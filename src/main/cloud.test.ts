// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const shellMock = vi.hoisted(() => ({ openExternal: vi.fn().mockResolvedValue(undefined) }))
vi.mock('electron', () => ({ shell: shellMock }))

const fsMock = vi.hoisted(() => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn()
}))
const streamMock = vi.hoisted(() => ({ createReadStream: vi.fn() }))
vi.mock('fs', () => ({
  promises: fsMock,
  createReadStream: streamMock.createReadStream
}))

vi.mock('os', () => ({ default: { homedir: () => '/Users/test' } }))

import {
  listCloudRoots,
  resetCloudRoots,
  getCloudRoots,
  cloudInfo,
  openOnWeb,
  makeAvailableOffline
} from './cloud'

const CLOUD = '/Users/test/Library/CloudStorage'
const DROPBOX = `${CLOUD}/Dropbox-NPOSystems`
const ONEDRIVE = `${CLOUD}/OneDrive2-Mickey`

const dirent = (name: string, isDir = true): unknown => ({
  name,
  isDirectory: () => isDir,
  isSymbolicLink: () => false
})

/** stat result with just the fields cloud.ts reads. */
const statOf = (opts: { dir?: boolean; size?: number; blocks?: number }): unknown => ({
  isDirectory: () => opts.dir ?? false,
  size: opts.size ?? 0,
  blocks: opts.blocks ?? 1
})

/** Default world: two CloudStorage roots, no Dropbox info.json, no iCloud. */
function seedDefaults(): void {
  fsMock.readdir.mockImplementation(async (dir: string) => {
    if (dir === CLOUD) return [dirent('Dropbox-NPOSystems'), dirent('OneDrive2-Mickey')]
    throw new Error('ENOENT')
  })
  fsMock.readFile.mockRejectedValue(new Error('ENOENT'))
  fsMock.stat.mockRejectedValue(new Error('ENOENT'))
}

beforeEach(() => {
  vi.clearAllMocks()
  resetCloudRoots()
  seedDefaults()
})

describe('listCloudRoots', () => {
  it('classifies CloudStorage folders and labels them with the account', async () => {
    const roots = await listCloudRoots()
    expect(roots).toEqual([
      { provider: 'dropbox', root: DROPBOX, label: 'Dropbox (NPOSystems)' },
      { provider: 'onedrive', root: ONEDRIVE, label: 'OneDrive (Mickey)' }
    ])
  })

  it('recognises Google Drive, Box and unknown providers, skipping dotfiles and files', async () => {
    fsMock.readdir.mockImplementation(async (dir: string) => {
      if (dir !== CLOUD) throw new Error('ENOENT')
      return [
        dirent('GoogleDrive-me@gmail.com'),
        dirent('Box-Work'),
        dirent('Pcloud-Home'),
        dirent('.DS_Store'),
        dirent('notes.txt', false)
      ]
    })
    const roots = await listCloudRoots()
    expect(roots.map((r) => [r.provider, r.label])).toEqual([
      ['box', 'Box (Work)'],
      ['googledrive', 'Google Drive (me@gmail.com)'],
      ['other', 'Pcloud (Home)']
    ])
  })

  it('includes roots from Dropbox info.json and de-duplicates against CloudStorage', async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        business: { root_path: DROPBOX, path: `${DROPBOX}/Mickey` },
        personal: { path: '/Users/test/Dropbox' }
      })
    )
    const roots = await listCloudRoots()
    // DROPBOX appears in both sources but is listed once.
    expect(roots.filter((r) => r.root === DROPBOX)).toHaveLength(1)
    expect(roots.map((r) => r.root)).toContain('/Users/test/Dropbox')
  })

  it('ignores a malformed info.json rather than failing the whole scan', async () => {
    fsMock.readFile.mockResolvedValue('{ not json')
    expect(await listCloudRoots()).toHaveLength(2)
  })

  it('adds iCloud Drive from Mobile Documents when present', async () => {
    const icloud = '/Users/test/Library/Mobile Documents/com~apple~CloudDocs'
    fsMock.stat.mockImplementation(async (p: string) => {
      if (p === icloud) return statOf({ dir: true })
      throw new Error('ENOENT')
    })
    expect((await listCloudRoots()).map((r) => r.root)).toContain(icloud)
  })

  it('returns nothing when CloudStorage does not exist', async () => {
    fsMock.readdir.mockRejectedValue(new Error('ENOENT'))
    expect(await listCloudRoots()).toEqual([])
  })

  it('labels a bare provider folder without an account suffix', async () => {
    fsMock.readdir.mockImplementation(async (dir: string) =>
      dir === CLOUD ? [dirent('Dropbox')] : Promise.reject(new Error('ENOENT'))
    )
    expect((await listCloudRoots())[0].label).toBe('Dropbox')
  })

  it('ignores info.json accounts with no usable path', async () => {
    fsMock.readFile.mockResolvedValue(JSON.stringify({ personal: { host: 1 }, business: {} }))
    expect((await listCloudRoots()).map((r) => r.root)).toEqual([DROPBOX, ONEDRIVE])
  })

  it('ignores a Mobile Documents entry that is not a directory', async () => {
    fsMock.stat.mockResolvedValue(statOf({ dir: false }))
    expect((await listCloudRoots()).map((r) => r.root)).toEqual([DROPBOX, ONEDRIVE])
  })

  it('caches the scan until reset', async () => {
    await listCloudRoots()
    await listCloudRoots()
    expect(fsMock.readdir).toHaveBeenCalledTimes(1)
    resetCloudRoots()
    await listCloudRoots()
    expect(fsMock.readdir).toHaveBeenCalledTimes(2)
  })

  it('getCloudRoots wraps the list in a Result', async () => {
    expect(await getCloudRoots()).toEqual({ ok: true, data: await listCloudRoots() })
  })
})

describe('cloudInfo', () => {
  it('returns null data for a path outside every synced root', async () => {
    fsMock.stat.mockResolvedValue(statOf({ size: 10, blocks: 8 }))
    expect(await cloudInfo('/Users/test/Documents/a.txt')).toEqual({ ok: true, data: null })
  })

  it('reports provider, relative path and a materialised file', async () => {
    fsMock.stat.mockResolvedValue(statOf({ size: 100, blocks: 8 }))
    const res = await cloudInfo(`${DROPBOX}/Clients/deal.pdf`)
    expect(res.data).toMatchObject({
      provider: 'dropbox',
      label: 'Dropbox (NPOSystems)',
      root: DROPBOX,
      relativePath: 'Clients/deal.pdf',
      dataless: false
    })
  })

  it('flags a placeholder: real size, no blocks allocated', async () => {
    fsMock.stat.mockResolvedValue(statOf({ size: 169397, blocks: 0 }))
    expect((await cloudInfo(`${DROPBOX}/a.pdf`)).data?.dataless).toBe(true)
  })

  it('never calls a directory dataless', async () => {
    fsMock.stat.mockResolvedValue(statOf({ dir: true, size: 0, blocks: 0 }))
    const res = await cloudInfo(`${DROPBOX}/Clients`)
    expect(res.data?.dataless).toBe(false)
    expect(res.data?.relativePath).toBe('Clients')
  })

  it('picks the most specific root when they nest', async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({ business: { root_path: `${DROPBOX}/Team` } })
    )
    fsMock.stat.mockResolvedValue(statOf({ size: 1, blocks: 1 }))
    expect((await cloudInfo(`${DROPBOX}/Team/x.txt`)).data?.root).toBe(`${DROPBOX}/Team`)
  })

  it('treats the root itself as an empty relative path', async () => {
    fsMock.stat.mockResolvedValue(statOf({ dir: true }))
    expect((await cloudInfo(DROPBOX)).data?.relativePath).toBe('')
  })

  it('surfaces a stat failure as an error Result', async () => {
    fsMock.stat.mockRejectedValue(Object.assign(new Error('nope'), { code: 'EACCES' }))
    expect(await cloudInfo(`${DROPBOX}/gone.txt`)).toMatchObject({ ok: false, code: 'EACCES' })
  })
})

describe('openOnWeb', () => {
  it('builds a Dropbox file link that previews the file in its folder', async () => {
    fsMock.stat.mockResolvedValue(statOf({ size: 1, blocks: 1 }))
    const res = await openOnWeb(`${DROPBOX}/Clients/a b.pdf`)
    expect(res.data).toBe('https://www.dropbox.com/home/Clients?preview=a%20b.pdf')
    expect(shellMock.openExternal).toHaveBeenCalledWith(res.data)
  })

  it('builds a Dropbox folder link', async () => {
    fsMock.stat.mockResolvedValue(statOf({ dir: true }))
    expect((await openOnWeb(`${DROPBOX}/Clients/Q4`)).data).toBe(
      'https://www.dropbox.com/home/Clients/Q4'
    )
  })

  it('falls back to the OneDrive home page when no site URL is discoverable', async () => {
    fsMock.stat.mockResolvedValue(statOf({ size: 1, blocks: 1 }))
    expect((await openOnWeb(`${ONEDRIVE}/notes.txt`)).data).toBe('https://onedrive.live.com/')
  })

  it('deep-links OneDrive using the site URL found in its settings databases', async () => {
    const settings = '/Users/test/Library/Application Support/OneDrive/settings'
    fsMock.readdir.mockImplementation(async (dir: string) => {
      if (dir === CLOUD) return [dirent('OneDrive2-Mickey')]
      if (dir === settings) return [dirent('ListSync')]
      if (dir === `${settings}/ListSync`) return [dirent('Microsoft.ListSync.db', false)]
      throw new Error('ENOENT')
    })
    fsMock.readFile.mockImplementation(async (p: string) => {
      if (String(p).endsWith('.db')) {
        // Binary scans pick up truncated neighbours; the real URL wins on count.
        return 'x https://acme-my.sharepoint.com/personal/m_test_io y https://acme-my.sharepoint.com/personal/m_test_io z https://acme-my.sharepoint.com/personal/m_test_io9'
      }
      throw new Error('ENOENT')
    })
    fsMock.stat.mockResolvedValue(statOf({ size: 1, blocks: 1 }))
    expect((await openOnWeb(`${ONEDRIVE}/Reports/q4.xlsx`)).data).toBe(
      'https://acme-my.sharepoint.com/personal/m_test_io/_layouts/15/onedrive.aspx?id=' +
        encodeURIComponent('/personal/m_test_io/Documents/Reports/q4.xlsx')
    )
  })

  it('refuses providers whose web URL cannot be derived from a local path', async () => {
    fsMock.readdir.mockImplementation(async (dir: string) =>
      dir === CLOUD ? [dirent('GoogleDrive-me@gmail.com')] : Promise.reject(new Error('ENOENT'))
    )
    const res = await openOnWeb(`${CLOUD}/GoogleDrive-me@gmail.com/a.txt`)
    expect(res.ok).toBe(false)
    expect(shellMock.openExternal).not.toHaveBeenCalled()
  })

  it('fails for a path outside any synced folder', async () => {
    expect((await openOnWeb('/Users/test/Documents/a.txt')).ok).toBe(false)
  })

  it('surfaces a failure from opening the browser', async () => {
    fsMock.stat.mockResolvedValue(statOf({ size: 1, blocks: 1 }))
    shellMock.openExternal.mockRejectedValueOnce(new Error('no handler'))
    expect(await openOnWeb(`${DROPBOX}/a.pdf`)).toMatchObject({ ok: false, error: 'no handler' })
  })

  it('falls back to the OneDrive home page when scanning the settings throws', async () => {
    const settings = '/Users/test/Library/Application Support/OneDrive/settings'
    fsMock.readdir.mockImplementation(async (dir: string) => {
      if (dir === CLOUD) return [dirent('OneDrive2-Mickey')]
      if (dir === settings) return [dirent('ListSync')]
      if (dir === `${settings}/ListSync`) return [dirent('broken.db', false)]
      throw new Error('ENOENT')
    })
    fsMock.readFile.mockRejectedValue(new Error('EACCES'))
    fsMock.stat.mockResolvedValue(statOf({ size: 1, blocks: 1 }))
    expect((await openOnWeb(`${ONEDRIVE}/a.txt`)).data).toBe('https://onedrive.live.com/')
  })
})

describe('makeAvailableOffline', () => {
  /** A read stream that immediately reports end-of-file. */
  const okStream = (): unknown => ({
    on(event: string, cb: (...a: unknown[]) => void) {
      if (event === 'end') setTimeout(cb, 0)
      return this
    }
  })

  it('streams only the placeholder files and reports progress', async () => {
    fsMock.stat.mockImplementation(async (p: string) => {
      if (p === '/f') return statOf({ dir: true })
      if (String(p).endsWith('placeholder.pdf')) return statOf({ size: 500, blocks: 0 })
      return statOf({ size: 500, blocks: 8 })
    })
    fsMock.readdir.mockImplementation(async (dir: string) =>
      dir === '/f' ? [dirent('placeholder.pdf', false), dirent('local.txt', false)] : []
    )
    streamMock.createReadStream.mockImplementation(okStream)

    const seen: string[] = []
    const res = await makeAvailableOffline(['/f'], (p) => seen.push(`${p.op}:${p.done}`))

    expect(res).toEqual({ ok: true, data: { files: 2 } })
    // Only the dataless one is actually read.
    expect(streamMock.createReadStream).toHaveBeenCalledTimes(1)
    expect(streamMock.createReadStream).toHaveBeenCalledWith('/f/placeholder.pdf')
    expect(seen).toEqual(['download:0', 'download:1', 'download:2'])
  })

  it('recurses into subfolders and skips symlinks', async () => {
    fsMock.stat.mockImplementation(async (p: string) =>
      p === '/f' || p === '/f/sub' ? statOf({ dir: true }) : statOf({ size: 1, blocks: 0 })
    )
    fsMock.readdir.mockImplementation(async (dir: string) => {
      if (dir === '/f') {
        return [
          dirent('sub'),
          { name: 'link', isDirectory: () => false, isSymbolicLink: () => true }
        ]
      }
      if (dir === '/f/sub') return [dirent('deep.bin', false)]
      return []
    })
    streamMock.createReadStream.mockImplementation(okStream)
    expect((await makeAvailableOffline(['/f'])).data).toEqual({ files: 1 })
  })

  it('reports a read failure as an error Result', async () => {
    fsMock.stat.mockResolvedValue(statOf({ size: 1, blocks: 0 }))
    streamMock.createReadStream.mockImplementation(() => ({
      on(event: string, cb: (e?: unknown) => void) {
        if (event === 'error') setTimeout(() => cb(new Error('offline')), 0)
        return this
      }
    }))
    expect(await makeAvailableOffline(['/a.bin'])).toMatchObject({ ok: false, error: 'offline' })
  })
})
