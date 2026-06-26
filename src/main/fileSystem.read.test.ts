// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir, symlink, chmod } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(), isPackaged: false },
  shell: {
    openPath: vi.fn().mockResolvedValue(''),
    showItemInFolder: vi.fn(),
    trashItem: vi.fn()
  },
  nativeImage: { createThumbnailFromPath: vi.fn() }
}))

vi.mock('child_process', () => ({
  execFile: vi.fn((_cmd, _args, opts, cb) => {
    const done = typeof opts === 'function' ? opts : cb
    done(null, { stdout: '', stderr: '' })
  })
}))

import { app, nativeImage } from 'electron'
import * as fsApi from './fileSystem'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'fe-read-'))
  vi.clearAllMocks()
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('readDirectory / buildFileItem', () => {
  it('builds items for a regular file, dir, hidden dotfile, and lowercases ext', async () => {
    await writeFile(join(dir, 'Report.TXT'), 'hello')
    await mkdir(join(dir, 'sub'))
    await writeFile(join(dir, '.hidden'), 'x')

    const res = await fsApi.readDirectory(dir)
    expect(res.ok).toBe(true)
    const byName = Object.fromEntries(res.data!.map((i) => [i.name, i]))

    expect(byName['Report.TXT'].isDirectory).toBe(false)
    expect(byName['Report.TXT'].ext).toBe('txt')
    expect(byName['Report.TXT'].size).toBe(5)
    expect(byName['Report.TXT'].isHidden).toBe(false)

    expect(byName['sub'].isDirectory).toBe(true)
    expect(byName['sub'].ext).toBe('')
    expect(byName['sub'].size).toBe(0)

    expect(byName['.hidden'].isHidden).toBe(true)
  })

  it('handles a file with no extension', async () => {
    await writeFile(join(dir, 'Makefile'), 'x')
    const res = await fsApi.readDirectory(dir)
    const item = res.data!.find((i) => i.name === 'Makefile')!
    expect(item.ext).toBe('')
  })

  it('treats a valid symlink by stat-ing its target (directory)', async () => {
    const realDir = join(dir, 'realdir')
    await mkdir(realDir)
    const link = join(dir, 'linkdir')
    await symlink(realDir, link)

    const res = await fsApi.getFileItem(link)
    expect(res.ok).toBe(true)
    expect(res.data!.isSymbolicLink).toBe(true)
    expect(res.data!.isDirectory).toBe(true)
  })

  it('falls back to lstat for a broken symlink (stat throws)', async () => {
    const link = join(dir, 'broken')
    await symlink(join(dir, 'does-not-exist'), link)

    const res = await fsApi.getFileItem(link)
    expect(res.ok).toBe(true)
    expect(res.data!.isSymbolicLink).toBe(true)
    // lstat of a symlink reports not-a-directory
    expect(res.data!.isDirectory).toBe(false)
  })

  it('classifies a .app directory as kind "app"', async () => {
    await mkdir(join(dir, 'Cool.app'))
    const res = await fsApi.getFileItem(join(dir, 'Cool.app'))
    expect(res.data!.kind).toBe('app')
    expect(res.data!.isDirectory).toBe(true)
  })

  it('fails with ENOENT for a missing directory', async () => {
    const res = await fsApi.readDirectory(join(dir, 'nope'))
    expect(res.ok).toBe(false)
    expect(res.code).toBe('ENOENT')
  })

  it('skips a single entry that errors while building', async () => {
    await writeFile(join(dir, 'good.txt'), 'x')
    await writeFile(join(dir, 'bad.txt'), 'x')
    const fsMod = await import('fs')
    const orig = fsMod.promises.lstat.bind(fsMod.promises)
    const spy = vi.spyOn(fsMod.promises, 'lstat').mockImplementation((async (p: string) => {
      if (String(p).endsWith('bad.txt')) throw new Error('boom')
      return (orig as never as (x: string) => never)(p)
    }) as never)

    const res = await fsApi.readDirectory(dir)
    expect(res.ok).toBe(true)
    const names = res.data!.map((i) => i.name)
    expect(names).toContain('good.txt')
    expect(names).not.toContain('bad.txt')
    spy.mockRestore()
  })

  it('getFileItem fails for a non-existent path', async () => {
    const res = await fsApi.getFileItem(join(dir, 'ghost'))
    expect(res.ok).toBe(false)
  })
})

describe('getHomeDir / pathExists / parentOf / joinPath', () => {
  it('getHomeDir returns os.homedir', () => {
    expect(typeof fsApi.getHomeDir()).toBe('string')
    expect(fsApi.getHomeDir().length).toBeGreaterThan(0)
  })

  it('pathExists true for existing, false for missing', async () => {
    await writeFile(join(dir, 'here.txt'), 'x')
    expect(await fsApi.pathExists(join(dir, 'here.txt'))).toBe(true)
    expect(await fsApi.pathExists(join(dir, 'nope.txt'))).toBe(false)
  })

  it('parentOf returns dirname', () => {
    expect(fsApi.parentOf('/a/b/c')).toBe('/a/b')
  })

  it('joinPath joins base + parts', () => {
    expect(fsApi.joinPath('/a', ['b', 'c'])).toBe('/a/b/c')
  })
})

describe('getQuickLinks', () => {
  it('includes Home and any getPath dirs that exist, filters missing/throwing', async () => {
    const desktop = join(dir, 'Desktop')
    await mkdir(desktop)
    vi.mocked(app.getPath).mockImplementation((name: string) => {
      if (name === 'desktop') return desktop
      if (name === 'documents') return join(dir, 'no-such-documents')
      throw new Error('unsupported')
    })

    const links = await fsApi.getQuickLinks()
    const names = links.map((l) => l.name)
    expect(names).toContain('Home')
    expect(names).toContain('Desktop')
    // documents path returned but does not exist -> filtered out
    expect(names).not.toContain('Documents')
    // downloads/pictures/etc threw -> tryPath null -> filtered out
    expect(names).not.toContain('Downloads')
  })
})

describe('getDrives', () => {
  it('returns boot volume and dedupes by st.dev', async () => {
    const fsMod = await import('fs')
    // Provide two /Volumes entries; the boot volume and one volume share dev.
    const realStat = fsMod.promises.stat.bind(fsMod.promises)
    const realReaddir = fsMod.promises.readdir.bind(fsMod.promises) as (
      p: string,
      opts: unknown
    ) => Promise<unknown>
    const readdirSpy = vi
      .spyOn(fsMod.promises, 'readdir')
      .mockImplementation((async (p: string, opts: unknown) => {
        if (String(p) === '/Volumes') {
          return [
            { name: 'VolA', isDirectory: () => true } as never,
            { name: 'VolB', isDirectory: () => true } as never
          ]
        }
        return realReaddir(p, opts)
      }) as never)

    const statSpy = vi.spyOn(fsMod.promises, 'stat').mockImplementation((async (p: string) => {
      const path = String(p)
      if (path === '/') return { dev: 1 } as never
      if (path === '/Volumes/VolA') return { dev: 1 } as never // dup of boot
      if (path === '/Volumes/VolB') return { dev: 2 } as never
      return realStat(p as never)
    }) as never)

    const statfsSpy = vi
      .spyOn(fsMod.promises, 'statfs')
      .mockImplementation((async (p: string) => {
        if (String(p) === '/') return { blocks: 100, bsize: 10, bavail: 40 } as never
        throw new Error('no statfs')
      }) as never)

    const drives = await fsApi.getDrives()
    const paths = drives.map((d) => d.path)
    expect(paths).toContain('/')
    expect(paths).toContain('/Volumes/VolB')
    expect(paths).not.toContain('/Volumes/VolA') // deduped (same dev as boot)

    const boot = drives.find((d) => d.path === '/')!
    expect(boot.total).toBe(1000)
    expect(boot.free).toBe(400)
    const volB = drives.find((d) => d.path === '/Volumes/VolB')!
    expect(volB.total).toBeUndefined() // statfs threw

    readdirSpy.mockRestore()
    statSpy.mockRestore()
    statfsSpy.mockRestore()
  })

  it('ignores unreadable /Volumes and skips unstattable mounts', async () => {
    const fsMod = await import('fs')
    const realStat = fsMod.promises.stat.bind(fsMod.promises)
    const readdirSpy = vi
      .spyOn(fsMod.promises, 'readdir')
      .mockImplementation((async (p: string) => {
        if (String(p) === '/Volumes') throw new Error('EACCES')
        return [] as never
      }) as never)
    const statSpy = vi.spyOn(fsMod.promises, 'stat').mockImplementation((async (p: string) => {
      if (String(p) === '/') throw new Error('boot unreadable')
      return realStat(p as never)
    }) as never)

    const drives = await fsApi.getDrives()
    expect(drives).toEqual([])

    readdirSpy.mockRestore()
    statSpy.mockRestore()
  })
})

describe('getThumbnail', () => {
  it('returns a data URL when image is non-empty and clamps size up', async () => {
    vi.mocked(nativeImage.createThumbnailFromPath).mockResolvedValue({
      isEmpty: () => false,
      toDataURL: () => 'data:image/png;base64,AAA'
    } as never)
    const res = await fsApi.getThumbnail('/some/file.png', 4) // clamps to 16
    expect(res.ok).toBe(true)
    expect(res.data).toBe('data:image/png;base64,AAA')
    expect(nativeImage.createThumbnailFromPath).toHaveBeenCalledWith('/some/file.png', {
      width: 16,
      height: 16
    })
  })

  it('clamps size down to 512 and rounds', async () => {
    vi.mocked(nativeImage.createThumbnailFromPath).mockResolvedValue({
      isEmpty: () => false,
      toDataURL: () => 'data:x'
    } as never)
    await fsApi.getThumbnail('/f.png', 9999)
    expect(nativeImage.createThumbnailFromPath).toHaveBeenCalledWith('/f.png', {
      width: 512,
      height: 512
    })
  })

  it('uses default 256 when size rounds to 0', async () => {
    vi.mocked(nativeImage.createThumbnailFromPath).mockResolvedValue({
      isEmpty: () => false,
      toDataURL: () => 'data:x'
    } as never)
    await fsApi.getThumbnail('/f.png', 0)
    expect(nativeImage.createThumbnailFromPath).toHaveBeenCalledWith('/f.png', {
      width: 256,
      height: 256
    })
  })

  it('fails when image is empty', async () => {
    vi.mocked(nativeImage.createThumbnailFromPath).mockResolvedValue({
      isEmpty: () => true,
      toDataURL: () => ''
    } as never)
    const res = await fsApi.getThumbnail('/f.png', 100)
    expect(res.ok).toBe(false)
    expect(res.error).toBe('No thumbnail')
  })

  it('fails when thumbnailer throws', async () => {
    vi.mocked(nativeImage.createThumbnailFromPath).mockRejectedValue(new Error('nope'))
    const res = await fsApi.getThumbnail('/f.png', 100)
    expect(res.ok).toBe(false)
    expect(res.error).toBe('nope')
  })
})

// silence unused import lint for chmod (kept for parity with ops tests env)
void chmod
