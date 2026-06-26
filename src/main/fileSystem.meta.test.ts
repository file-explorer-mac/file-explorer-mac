// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir, symlink, chmod } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(), isPackaged: true },
  shell: {
    openPath: vi.fn().mockResolvedValue(''),
    showItemInFolder: vi.fn(),
    trashItem: vi.fn().mockResolvedValue(undefined)
  },
  nativeImage: { createThumbnailFromPath: vi.fn() }
}))

vi.mock('child_process', () => ({
  execFile: vi.fn((_cmd, _args, opts, cb) => {
    const done = typeof opts === 'function' ? opts : cb
    done(null, { stdout: '', stderr: '' })
  })
}))

import * as fsApi from './fileSystem'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'fe-meta-'))
  vi.clearAllMocks()
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('getProperties / modeToString', () => {
  it('reports a regular file with rw-r--r-- mode bits', async () => {
    const f = join(dir, 'file.txt')
    await writeFile(f, 'hello')
    await chmod(f, 0o644)
    const res = await fsApi.getProperties(f)
    expect(res.ok).toBe(true)
    expect(res.data!.isDirectory).toBe(false)
    expect(res.data!.mode).toBe('-rw-r--r--')
    expect(res.data!.size).toBe(5)
    expect(res.data!.parent).toBe(dir)
    expect(res.data!.symlinkTarget).toBeUndefined()
  })

  it('reports a directory with d + rwx bits', async () => {
    const d = join(dir, 'folder')
    await mkdir(d)
    await chmod(d, 0o755)
    const res = await fsApi.getProperties(d)
    expect(res.data!.isDirectory).toBe(true)
    expect(res.data!.mode).toBe('drwxr-xr-x')
    expect(res.data!.size).toBe(0)
  })

  it('reports a symlink with l mode and readlink target', async () => {
    const target = join(dir, 'target.txt')
    await writeFile(target, 'x')
    const link = join(dir, 'link.txt')
    await symlink(target, link)
    const res = await fsApi.getProperties(link)
    expect(res.data!.isSymbolicLink).toBe(true)
    expect(res.data!.mode.startsWith('l')).toBe(true)
    expect(res.data!.symlinkTarget).toBe(target)
  })

  it('symlink with readlink failure leaves target undefined and stat fallback to lstat', async () => {
    const link = join(dir, 'broken')
    await symlink(join(dir, 'gone'), link)
    const fsMod = await import('fs')
    const readlinkSpy = vi
      .spyOn(fsMod.promises, 'readlink')
      .mockRejectedValue(new Error('readlink boom'))
    const res = await fsApi.getProperties(link)
    expect(res.ok).toBe(true)
    expect(res.data!.isSymbolicLink).toBe(true)
    expect(res.data!.symlinkTarget).toBeUndefined()
    readlinkSpy.mockRestore()
  })

  it('renders absent read/write bits and present execute bits (rwx "-" branches)', async () => {
    const f = join(dir, 'exec')
    await writeFile(f, 'x')
    await chmod(f, 0o711) // rwx for owner, --x for group & other
    const res = await fsApi.getProperties(f)
    expect(res.data!.mode).toBe('-rwx--x--x')
  })

  it('falls back to ctimeMs when birthtimeMs is 0', async () => {
    const f = join(dir, 'noBirth.txt')
    await writeFile(f, 'x')
    const fsMod = await import('fs')
    const realLstat = fsMod.promises.lstat.bind(fsMod.promises)
    const spy = vi.spyOn(fsMod.promises, 'lstat').mockImplementation((async (p: string) => {
      const st = (await (realLstat as never as (x: string) => Promise<Record<string, unknown>>)(p)) as Record<
        string,
        unknown
      >
      return { ...st, birthtimeMs: 0, ctimeMs: 4242, isDirectory: () => false, isSymbolicLink: () => false } as never
    }) as never)
    const res = await fsApi.getProperties(f)
    expect(res.ok).toBe(true)
    expect(res.data!.created).toBe(4242)
    spy.mockRestore()
  })

  it('fails for a missing path', async () => {
    const res = await fsApi.getProperties(join(dir, 'ghost'))
    expect(res.ok).toBe(false)
  })
})

describe('getFolderSize', () => {
  it('counts nested files and folders and sums sizes, skipping symlinks', async () => {
    await writeFile(join(dir, 'a.txt'), 'aaaa') // 4
    const sub = join(dir, 'sub')
    await mkdir(sub)
    await writeFile(join(sub, 'b.txt'), 'bb') // 2
    await symlink(join(dir, 'a.txt'), join(dir, 'lnk'))

    const res = await fsApi.getFolderSize(dir)
    expect(res.ok).toBe(true)
    expect(res.data!.complete).toBe(true)
    expect(res.data!.files).toBe(2)
    expect(res.data!.folders).toBe(1)
    expect(res.data!.size).toBe(6)
  })

  it('skips a file whose lstat throws', async () => {
    await writeFile(join(dir, 'a.txt'), 'aaaa')
    await writeFile(join(dir, 'b.txt'), 'bb')
    const fsMod = await import('fs')
    const orig = fsMod.promises.lstat.bind(fsMod.promises)
    const spy = vi.spyOn(fsMod.promises, 'lstat').mockImplementation((async (p: string) => {
      if (String(p).endsWith('b.txt')) throw new Error('boom')
      return (orig as never as (x: string) => never)(p)
    }) as never)
    const res = await fsApi.getFolderSize(dir)
    expect(res.ok).toBe(true)
    expect(res.data!.files).toBe(2)
    expect(res.data!.size).toBe(4) // only a.txt counted
    spy.mockRestore()
  })

  it('returns size 0 when the root readdir throws', async () => {
    const res = await fsApi.getFolderSize(join(dir, 'nope'))
    expect(res.ok).toBe(true)
    expect(res.data!.size).toBe(0)
    expect(res.data!.files).toBe(0)
    expect(res.data!.complete).toBe(true)
  })

  it('marks complete:false when the deadline is exceeded at the top of a (recursive) walk', async () => {
    // dir has exactly one entry: a subdirectory. Call sequence:
    //   1 deadline, 2 walk(root) top, 3 root entry-loop check, then recurse:
    //   4 walk(sub) top -> over deadline -> hits the top-of-walk branch.
    const sub = join(dir, 'sub')
    await mkdir(sub)
    await writeFile(join(sub, 'b.txt'), 'x')

    const nowSpy = vi.spyOn(Date, 'now')
    let n = 0
    nowSpy.mockImplementation(() => {
      n++
      if (n <= 3) return 1_000_000 // deadline + root top + root entry-loop check: ok
      return 1_000_000 + 999_999 // sub top check: over deadline
    })

    const res = await fsApi.getFolderSize(dir)
    expect(res.ok).toBe(true)
    expect(res.data!.complete).toBe(false)
    expect(res.data!.folders).toBe(1) // root counted the sub before recursing
    nowSpy.mockRestore()
  })

  it('marks complete:false when deadline trips inside the entry loop', async () => {
    await writeFile(join(dir, 'a.txt'), 'x')
    await writeFile(join(dir, 'b.txt'), 'x')
    const nowSpy = vi.spyOn(Date, 'now')
    let n = 0
    nowSpy.mockImplementation(() => {
      n++
      if (n === 1) return 1_000_000 // deadline
      if (n === 2) return 1_000_001 // walk(root) top: ok
      return 2_000_000 // first entry-loop check: over deadline
    })
    const res = await fsApi.getFolderSize(dir)
    expect(res.data!.complete).toBe(false)
    nowSpy.mockRestore()
  })

  it('fails when walk itself throws unexpectedly (outer catch)', async () => {
    await writeFile(join(dir, 'a.txt'), 'x')
    // deadline = Date.now() (1st call, ok). Inside walk the top-of-walk check
    // (2nd call) throws, escaping the inner try/catch -> hits the OUTER catch.
    const nowSpy = vi.spyOn(Date, 'now')
    let n = 0
    nowSpy.mockImplementation(() => {
      n++
      if (n === 1) return 1_000_000 // deadline computation succeeds
      throw new Error('clock boom') // top-of-walk check throws
    })
    const res = await fsApi.getFolderSize(dir)
    expect(res.ok).toBe(false)
    expect(res.error).toBe('clock boom')
    nowSpy.mockRestore()
  })
})

describe('readTextPreview', () => {
  it('reads text content', async () => {
    const f = join(dir, 't.txt')
    await writeFile(f, 'hello world')
    const res = await fsApi.readTextPreview(f)
    expect(res.ok).toBe(true)
    expect(res.data).toBe('hello world')
  })

  it('flags a file with a NUL byte as Binary', async () => {
    const f = join(dir, 'bin')
    await writeFile(f, Buffer.from([0x41, 0x00, 0x42]))
    const res = await fsApi.readTextPreview(f)
    expect(res.ok).toBe(false)
    expect(res.error).toBe('Binary file')
  })

  it('clamps maxBytes to at least 1', async () => {
    const f = join(dir, 't.txt')
    await writeFile(f, 'abcdef')
    const res = await fsApi.readTextPreview(f, 0) // round(0)||default -> default 64k actually
    expect(res.ok).toBe(true)
    expect(res.data).toBe('abcdef')
  })

  it('clamps a tiny positive maxBytes (1) and reads one byte', async () => {
    const f = join(dir, 't.txt')
    await writeFile(f, 'abcdef')
    const res = await fsApi.readTextPreview(f, 1)
    expect(res.ok).toBe(true)
    expect(res.data).toBe('a')
  })

  it('clamps an absurdly large maxBytes to 1MB', async () => {
    const f = join(dir, 't.txt')
    await writeFile(f, 'hi')
    const res = await fsApi.readTextPreview(f, 5 * 1024 * 1024)
    expect(res.ok).toBe(true)
    expect(res.data).toBe('hi')
  })

  it('fails when the file cannot be opened', async () => {
    const res = await fsApi.readTextPreview(join(dir, 'ghost'))
    expect(res.ok).toBe(false)
  })
})

describe('search', () => {
  it('returns [] for an empty/whitespace query', async () => {
    const res = await fsApi.search(dir, '   ')
    expect(res.ok).toBe(true)
    expect(res.data).toEqual([])
  })

  it('matches by name and walks nested directories', async () => {
    await writeFile(join(dir, 'apple.txt'), 'x')
    const sub = join(dir, 'fruits')
    await mkdir(sub)
    await writeFile(join(sub, 'pineapple.txt'), 'x')
    await writeFile(join(sub, 'banana.txt'), 'x')

    const res = await fsApi.search(dir, 'apple')
    expect(res.ok).toBe(true)
    const names = res.data!.map((i) => i.name).sort()
    expect(names).toEqual(['apple.txt', 'pineapple.txt'])
  })

  it('skips a directory it cannot read (readdir throws)', async () => {
    await writeFile(join(dir, 'target.txt'), 'x')
    const sub = join(dir, 'locked')
    await mkdir(sub)
    const fsMod = await import('fs')
    const orig = fsMod.promises.readdir.bind(fsMod.promises)
    const spy = vi.spyOn(fsMod.promises, 'readdir').mockImplementation((async (p: string, o: never) => {
      if (String(p) === sub) throw new Error('EACCES')
      return (orig as never as (a: string, b: never) => never)(p, o)
    }) as never)
    const res = await fsApi.search(dir, 'target')
    expect(res.ok).toBe(true)
    expect(res.data!.map((i) => i.name)).toEqual(['target.txt'])
    spy.mockRestore()
  })

  it('skips a matching entry whose buildFileItem throws', async () => {
    await writeFile(join(dir, 'match-good.txt'), 'x')
    await writeFile(join(dir, 'match-bad.txt'), 'x')
    const fsMod = await import('fs')
    const orig = fsMod.promises.lstat.bind(fsMod.promises)
    const spy = vi.spyOn(fsMod.promises, 'lstat').mockImplementation((async (p: string) => {
      if (String(p).endsWith('match-bad.txt')) throw new Error('boom')
      return (orig as never as (x: string) => never)(p)
    }) as never)
    const res = await fsApi.search(dir, 'match')
    expect(res.ok).toBe(true)
    expect(res.data!.map((i) => i.name)).toEqual(['match-good.txt'])
    spy.mockRestore()
  })

  it('stops walking past MAX_DEPTH', async () => {
    // Build dir depth 10 with a match deep down; MAX_DEPTH = 8.
    let cur = dir
    for (let i = 1; i <= 10; i++) {
      cur = join(cur, `d${i}`)
      await mkdir(cur)
    }
    await writeFile(join(cur, 'needle.txt'), 'x') // depth 10 -> beyond MAX_DEPTH
    const res = await fsApi.search(dir, 'needle')
    expect(res.ok).toBe(true)
    expect(res.data).toEqual([]) // too deep to be reached
  })

  it('stops when the deadline is exceeded', async () => {
    await writeFile(join(dir, 'needle.txt'), 'x')
    const nowSpy = vi.spyOn(Date, 'now')
    let n = 0
    nowSpy.mockImplementation(() => {
      n++
      if (n === 1) return 1_000_000 // deadline base
      return 2_000_000 // walk top check -> over deadline immediately
    })
    const res = await fsApi.search(dir, 'needle')
    expect(res.ok).toBe(true)
    expect(res.data).toEqual([])
    nowSpy.mockRestore()
  })

  it('fails via the outer catch when walk throws unexpectedly', async () => {
    await writeFile(join(dir, 'needle.txt'), 'x')
    // deadline calc (call 1) ok; walk top-of-walk check (call 2) throws ->
    // escapes the inner readdir try/catch -> caught by the outer try/catch.
    const nowSpy = vi.spyOn(Date, 'now')
    let n = 0
    nowSpy.mockImplementation(() => {
      n++
      if (n === 1) return 1_000_000
      throw new Error('search clock boom')
    })
    const res = await fsApi.search(dir, 'needle')
    expect(res.ok).toBe(false)
    expect(res.error).toBe('search clock boom')
    nowSpy.mockRestore()
  })

  it('stops within the entry loop when the deadline trips', async () => {
    await writeFile(join(dir, 'aa.txt'), 'x')
    await writeFile(join(dir, 'ab.txt'), 'x')
    const nowSpy = vi.spyOn(Date, 'now')
    let n = 0
    nowSpy.mockImplementation(() => {
      n++
      if (n === 1) return 1_000_000 // deadline
      if (n === 2) return 1_000_001 // walk top ok
      return 2_000_000 // entry-loop check over deadline
    })
    const res = await fsApi.search(dir, 'a')
    expect(res.ok).toBe(true)
    expect(res.data).toEqual([])
    nowSpy.mockRestore()
  })
})
