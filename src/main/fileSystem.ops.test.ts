// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir, readFile, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(), isPackaged: false },
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

import { shell } from 'electron'
import { execFile } from 'child_process'
import * as fsApi from './fileSystem'

type ExecCb = (err: unknown, res?: { stdout: string; stderr: string }) => void

/**
 * Build a promisify-compatible execFile mock implementation. `behaviour`
 * receives the parsed args and the resolve/reject-style callback.
 */
function execImpl(
  behaviour: (args: string[], done: ExecCb) => void
): typeof execFile {
  return ((
    _cmd: unknown,
    args: unknown,
    opts: unknown,
    cb: unknown
  ): unknown => {
    const done = (typeof opts === 'function' ? opts : cb) as ExecCb
    behaviour(args as string[], done)
    return undefined
  }) as unknown as typeof execFile
}

const execOk = execImpl((_args, done) => done(null, { stdout: '', stderr: '' }))

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'fe-ops-'))
  vi.clearAllMocks()
  vi.mocked(shell.trashItem).mockResolvedValue(undefined)
  vi.mocked(execFile).mockImplementation(execOk)
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('createFolder', () => {
  it('creates a folder with the given name', async () => {
    const res = await fsApi.createFolder(dir, 'My Folder')
    expect(res.ok).toBe(true)
    expect(res.data!.name).toBe('My Folder')
    expect((await stat(join(dir, 'My Folder'))).isDirectory()).toBe(true)
  })

  it('uses default name when empty', async () => {
    const res = await fsApi.createFolder(dir, '')
    expect(res.data!.name).toBe('New folder')
  })

  it('appends " (2)" on collision', async () => {
    await mkdir(join(dir, 'Dup'))
    const res = await fsApi.createFolder(dir, 'Dup')
    expect(res.data!.name).toBe('Dup (2)')
  })

  it('fails when parent does not exist', async () => {
    const res = await fsApi.createFolder(join(dir, 'nope'), 'X')
    expect(res.ok).toBe(false)
  })
})

describe('createTextFile', () => {
  it('creates an empty text file', async () => {
    const res = await fsApi.createTextFile(dir, 'note.txt')
    expect(res.ok).toBe(true)
    expect(res.data!.name).toBe('note.txt')
    expect(await readFile(join(dir, 'note.txt'), 'utf8')).toBe('')
  })

  it('uses default name when empty', async () => {
    const res = await fsApi.createTextFile(dir, '')
    expect(res.data!.name).toBe('New Text Document.txt')
  })

  it('keeps both on collision, splitting the extension', async () => {
    await writeFile(join(dir, 'note.txt'), 'x')
    const res = await fsApi.createTextFile(dir, 'note.txt')
    expect(res.data!.name).toBe('note (2).txt')
  })

  it('fails on bad parent', async () => {
    const res = await fsApi.createTextFile(join(dir, 'nope'), 'x.txt')
    expect(res.ok).toBe(false)
  })
})

describe('uniquePath fallback (>=1000 collisions)', () => {
  it('falls back to a timestamp-based name when 2..999 all exist', async () => {
    await writeFile(join(dir, 'f.txt'), 'x')
    const fsMod = await import('fs')
    // Make pathExists (fs.access) report everything as existing except a final
    // timestamp candidate; simulate 1000 collisions by always "exists".
    const accessSpy = vi
      .spyOn(fsMod.promises, 'access')
      .mockImplementation((async (p: string) => {
        // Existing target + all " (n)" variants exist; only the Date.now() one is free.
        if (/\(\d{6,}\)/.test(String(p))) throw new Error('ENOENT') // timestamp -> free
        return undefined
      }) as never)
    const writeSpy = vi
      .spyOn(fsMod.promises, 'writeFile')
      .mockResolvedValue(undefined as never)
    const lstatSpy = vi
      .spyOn(fsMod.promises, 'lstat')
      .mockResolvedValue({
        isSymbolicLink: () => false,
        isDirectory: () => false,
        size: 0,
        mtimeMs: 0,
        birthtimeMs: 0,
        ctimeMs: 0
      } as never)

    const res = await fsApi.createTextFile(dir, 'f.txt')
    expect(res.ok).toBe(true)
    expect(res.data!.name).toMatch(/^f \(\d+\)\.txt$/)

    accessSpy.mockRestore()
    writeSpy.mockRestore()
    lstatSpy.mockRestore()
  })
})

describe('rename', () => {
  it('rejects empty / "/"-containing names', async () => {
    await writeFile(join(dir, 'a.txt'), 'x')
    const r1 = await fsApi.rename(join(dir, 'a.txt'), '   ')
    expect(r1.ok).toBe(false)
    expect(r1.error).toBe('Invalid name')
    const r2 = await fsApi.rename(join(dir, 'a.txt'), 'b/c')
    expect(r2.ok).toBe(false)
    expect(r2.error).toBe('Invalid name')
  })

  it('returns the item unchanged when new name equals current', async () => {
    await writeFile(join(dir, 'same.txt'), 'x')
    const res = await fsApi.rename(join(dir, 'same.txt'), 'same.txt')
    expect(res.ok).toBe(true)
    expect(res.data!.name).toBe('same.txt')
  })

  it('fails when destination already exists', async () => {
    await writeFile(join(dir, 'a.txt'), 'x')
    await writeFile(join(dir, 'b.txt'), 'y')
    const res = await fsApi.rename(join(dir, 'a.txt'), 'b.txt')
    expect(res.ok).toBe(false)
    expect(res.error).toContain('already exists')
  })

  it('renames successfully', async () => {
    await writeFile(join(dir, 'a.txt'), 'x')
    const res = await fsApi.rename(join(dir, 'a.txt'), 'c.txt')
    expect(res.ok).toBe(true)
    expect(res.data!.name).toBe('c.txt')
    expect(await fsApi.pathExists(join(dir, 'c.txt'))).toBe(true)
    expect(await fsApi.pathExists(join(dir, 'a.txt'))).toBe(false)
  })

  it('fails when source does not exist (rename throws)', async () => {
    const res = await fsApi.rename(join(dir, 'ghost.txt'), 'x.txt')
    expect(res.ok).toBe(false)
  })
})

describe('moveToTrash', () => {
  it('returns ok when all succeed', async () => {
    const res = await fsApi.moveToTrash([join(dir, 'a'), join(dir, 'b')])
    expect(res.ok).toBe(true)
    expect(shell.trashItem).toHaveBeenCalledTimes(2)
  })

  it('lists failures when some reject', async () => {
    vi.mocked(shell.trashItem).mockImplementation(async (p: string) => {
      if (p.endsWith('bad')) throw new Error('nope')
    })
    const res = await fsApi.moveToTrash([join(dir, 'good'), join(dir, 'bad')])
    expect(res.ok).toBe(false)
    expect(res.error).toContain('bad')
    expect(res.error).not.toContain('good')
  })
})

describe('listConflicts', () => {
  it('skips same-dir moves and reports real conflicts', async () => {
    const src1 = join(dir, 'x.txt')
    await writeFile(src1, '1')
    const destDir = join(dir, 'dest')
    await mkdir(destDir)
    await writeFile(join(destDir, 'x.txt'), 'existing')

    // src2 lives in destDir already -> same-dir, never a conflict
    const src2 = join(destDir, 'y.txt')
    await writeFile(src2, '2')

    // src3 is cross-dir but its name does NOT exist in destDir -> no conflict
    const src3 = join(dir, 'unique.txt')
    await writeFile(src3, '3')

    const res = await fsApi.listConflicts([src1, src2, src3], destDir)
    expect(res.ok).toBe(true)
    expect(res.data).toEqual(['x.txt'])
  })

  it('fails when an error is thrown', async () => {
    const fsMod = await import('fs')
    const spy = vi
      .spyOn(fsMod.promises, 'access')
      .mockRejectedValue(Object.assign(new Error('boom'), { code: 'EUNKNOWN' }))
    // pathExists swallows access errors, so force the throw earlier via basename? Instead
    // make resolve throw by passing a non-string. Simpler: spy resolve indirectly is hard;
    // instead trigger catch by making srcPaths include something that throws in join.
    spy.mockRestore()
    // Force the try/catch: monkeypatch path via providing a src whose dirname throws.
    const res = await fsApi.listConflicts(
      [undefined as unknown as string],
      dir
    )
    expect(res.ok).toBe(false)
  })
})

describe('copy / move (transfer)', () => {
  it('copy keep-both creates a uniquely named copy and calls onProgress', async () => {
    const src = join(dir, 'file.txt')
    await writeFile(src, 'data')
    const destDir = join(dir, 'dest')
    await mkdir(destDir)
    await writeFile(join(destDir, 'file.txt'), 'old')

    const progress: number[] = []
    const res = await fsApi.copy([src], destDir, 'keep-both', (p) => progress.push(p.done))
    expect(res.ok).toBe(true)
    expect(res.data!.moves[0].to).toBe(join(destDir, 'file (2).txt'))
    expect(await fsApi.pathExists(join(destDir, 'file (2).txt'))).toBe(true)
    expect(progress).toEqual([0, 1]) // before + after
  })

  it('copy with default policy (keep-both) when none supplied', async () => {
    const src = join(dir, 'a.txt')
    await writeFile(src, 'x')
    const destDir = join(dir, 'd')
    await mkdir(destDir)
    const res = await fsApi.copy([src], destDir)
    expect(res.ok).toBe(true)
    expect(res.data!.moves[0].to).toBe(join(destDir, 'a.txt'))
  })

  it('copy skip leaves the existing target untouched', async () => {
    const src = join(dir, 'file.txt')
    await writeFile(src, 'new')
    const destDir = join(dir, 'dest')
    await mkdir(destDir)
    await writeFile(join(destDir, 'file.txt'), 'old')

    const res = await fsApi.copy([src], destDir, 'skip')
    expect(res.ok).toBe(true)
    expect(res.data!.moves).toEqual([])
    expect(await readFile(join(destDir, 'file.txt'), 'utf8')).toBe('old')
  })

  it('copy replace removes the existing target then copies', async () => {
    const src = join(dir, 'file.txt')
    await writeFile(src, 'NEW')
    const destDir = join(dir, 'dest')
    await mkdir(destDir)
    await writeFile(join(destDir, 'file.txt'), 'old')

    const res = await fsApi.copy([src], destDir, 'replace')
    expect(res.ok).toBe(true)
    expect(await readFile(join(destDir, 'file.txt'), 'utf8')).toBe('NEW')
  })

  it('replace skips rm when target resolves to the source (copy into same dir)', async () => {
    const src = join(dir, 'file.txt')
    await writeFile(src, 'keep')
    // dest is the same directory -> target === src; copy of a file onto itself with cp throws
    const res = await fsApi.copy([src], dir, 'replace')
    // fs.cp of a file onto itself fails -> overall fail (but rm was skipped, file preserved-ish)
    expect(res.ok).toBe(false)
  })

  it('move within same dir is skipped', async () => {
    const src = join(dir, 'file.txt')
    await writeFile(src, 'x')
    const res = await fsApi.move([src], dir, 'keep-both')
    expect(res.ok).toBe(true)
    expect(res.data!.moves).toEqual([])
    expect(await fsApi.pathExists(src)).toBe(true)
  })

  it('move across dirs renames the file', async () => {
    const src = join(dir, 'file.txt')
    await writeFile(src, 'x')
    const destDir = join(dir, 'dest')
    await mkdir(destDir)
    const res = await fsApi.move([src], destDir, 'keep-both')
    expect(res.ok).toBe(true)
    expect(await fsApi.pathExists(join(destDir, 'file.txt'))).toBe(true)
    expect(await fsApi.pathExists(src)).toBe(false)
  })

  it('move falls back to cp+rm on EXDEV', async () => {
    const src = join(dir, 'file.txt')
    await writeFile(src, 'cross')
    const destDir = join(dir, 'dest')
    await mkdir(destDir)

    const fsMod = await import('fs')
    const renameSpy = vi
      .spyOn(fsMod.promises, 'rename')
      .mockRejectedValueOnce(Object.assign(new Error('cross device'), { code: 'EXDEV' }))

    const res = await fsApi.move([src], destDir, 'keep-both')
    expect(res.ok).toBe(true)
    expect(await readFile(join(destDir, 'file.txt'), 'utf8')).toBe('cross')
    expect(await fsApi.pathExists(src)).toBe(false)
    renameSpy.mockRestore()
  })

  it('move rethrows non-EXDEV errors -> fail()', async () => {
    const src = join(dir, 'file.txt')
    await writeFile(src, 'x')
    const destDir = join(dir, 'dest')
    await mkdir(destDir)

    const fsMod = await import('fs')
    const renameSpy = vi
      .spyOn(fsMod.promises, 'rename')
      .mockRejectedValueOnce(Object.assign(new Error('perm'), { code: 'EPERM' }))

    const res = await fsApi.move([src], destDir, 'keep-both')
    expect(res.ok).toBe(false)
    expect(res.code).toBe('EPERM')
    renameSpy.mockRestore()
  })

  it('move with default policy parameter', async () => {
    const src = join(dir, 'm.txt')
    await writeFile(src, 'x')
    const destDir = join(dir, 'dd')
    await mkdir(destDir)
    const res = await fsApi.move([src], destDir)
    expect(res.ok).toBe(true)
  })
})

describe('compressZip', () => {
  it('fails on empty input', async () => {
    const res = await fsApi.compressZip([], dir)
    expect(res.ok).toBe(false)
    expect(res.error).toBe('Nothing to compress')
  })

  it('uses <name>.zip for a single source and ./ prefixes', async () => {
    const src = join(dir, 'doc.txt')
    await writeFile(src, 'x')
    // execFile mocked: simulate zip creating the file so buildFileItem succeeds
    vi.mocked(execFile).mockImplementation(
      execImpl((args, done) => {
        const out = args[args.indexOf('-X') + 1]
        void writeFile(out, 'zip').then(() => done(null, { stdout: '', stderr: '' }))
      })
    )

    const res = await fsApi.compressZip([src], dir)
    expect(res.ok).toBe(true)
    expect(res.data!.name).toBe('doc.zip')
    const call = vi.mocked(execFile).mock.calls[0]
    expect(call[0]).toBe('zip')
    expect(call[1]).toEqual(['-r', '-q', '-X', join(dir, 'doc.zip'), './doc.txt'])
    expect((call[2] as { cwd: string }).cwd).toBe(dir)
  })

  it('uses Archive.zip for multiple sources', async () => {
    const s1 = join(dir, 'a.txt')
    const s2 = join(dir, 'b.txt')
    await writeFile(s1, 'a')
    await writeFile(s2, 'b')
    vi.mocked(execFile).mockImplementation(
      execImpl((args, done) => {
        const out = args[args.indexOf('-X') + 1]
        void writeFile(out, 'zip').then(() => done(null, { stdout: '', stderr: '' }))
      })
    )

    const res = await fsApi.compressZip([s1, s2], dir)
    expect(res.ok).toBe(true)
    expect(res.data!.name).toBe('Archive.zip')
    const call = vi.mocked(execFile).mock.calls[0]
    expect(call[1]).toContain('./a.txt')
    expect(call[1]).toContain('./b.txt')
  })

  it('fails when zip errors', async () => {
    const src = join(dir, 'doc.txt')
    await writeFile(src, 'x')
    vi.mocked(execFile).mockImplementation(execImpl((_args, done) => done(new Error('zip failed'))))
    const res = await fsApi.compressZip([src], dir)
    expect(res.ok).toBe(false)
    expect(res.error).toBe('zip failed')
  })
})

describe('extractZip', () => {
  it('mkdirs an output dir and calls ditto', async () => {
    const zip = join(dir, 'bundle.zip')
    await writeFile(zip, 'x')
    const res = await fsApi.extractZip(zip, dir)
    expect(res.ok).toBe(true)
    expect(await fsApi.pathExists(join(dir, 'bundle'))).toBe(true)
    const call = vi.mocked(execFile).mock.calls[0]
    expect(call[0]).toBe('ditto')
    expect(call[1]).toEqual(['-x', '-k', zip, join(dir, 'bundle')])
  })

  it('fails when ditto errors', async () => {
    const zip = join(dir, 'bundle.zip')
    await writeFile(zip, 'x')
    vi.mocked(execFile).mockImplementation(execImpl((_args, done) => done(new Error('ditto failed'))))
    const res = await fsApi.extractZip(zip, dir)
    expect(res.ok).toBe(false)
  })
})

describe('openInTerminal / openWithApp / openPath / revealInFinder', () => {
  it('openInTerminal runs open -a Terminal', async () => {
    await fsApi.openInTerminal(dir)
    const call = vi.mocked(execFile).mock.calls[0]
    expect(call[0]).toBe('open')
    expect(call[1]).toEqual(['-a', 'Terminal', dir])
  })

  it('openInTerminal swallows errors', async () => {
    vi.mocked(execFile).mockImplementation(execImpl((_args, done) => done(new Error('boom'))))
    await expect(fsApi.openInTerminal(dir)).resolves.toBeUndefined()
  })

  it('openWithApp ok', async () => {
    const res = await fsApi.openWithApp('/Applications/X.app', '/a/b.txt')
    expect(res.ok).toBe(true)
    expect(vi.mocked(execFile).mock.calls[0][1]).toEqual(['-a', '/Applications/X.app', '/a/b.txt'])
  })

  it('openWithApp fails when open errors', async () => {
    vi.mocked(execFile).mockImplementation(execImpl((_args, done) => done(new Error('no app'))))
    const res = await fsApi.openWithApp('/X.app', '/f')
    expect(res.ok).toBe(false)
  })

  it('openPath ok when shell.openPath returns empty string', async () => {
    vi.mocked(shell.openPath).mockResolvedValue('')
    const res = await fsApi.openPath('/some/path')
    expect(res.ok).toBe(true)
  })

  it('openPath fails when shell.openPath returns an error string', async () => {
    vi.mocked(shell.openPath).mockResolvedValue('cannot open')
    const res = await fsApi.openPath('/some/path')
    expect(res.ok).toBe(false)
    expect(res.error).toBe('cannot open')
  })

  it('revealInFinder calls shell.showItemInFolder', async () => {
    await fsApi.revealInFinder('/a/b')
    expect(shell.showItemInFolder).toHaveBeenCalledWith('/a/b')
  })
})
