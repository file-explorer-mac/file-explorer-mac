import { promises as fs, constants as fsConstants } from 'fs'
import { join, basename, extname, dirname, parse as parsePath, resolve } from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { app, shell, nativeImage } from 'electron'
import type {
  ConflictPolicy,
  DriveItem,
  FileItem,
  FolderSize,
  OpProgress,
  PropertyInfo,
  QuickLink,
  Result,
  TransferResult
} from '../shared/types'
import { classifyKind, kindLabel } from '../shared/fileKinds'

const execFileP = promisify(execFile)

const ok = <T>(data: T): Result<T> => ({ ok: true, data })
const fail = (error: unknown): Result<never> => ({
  ok: false,
  error: error instanceof Error ? error.message : String(error),
  code: (error as NodeJS.ErrnoException)?.code
})

function extOf(name: string, isDirectory: boolean): string {
  if (isDirectory) return ''
  const e = extname(name)
  return e ? e.slice(1).toLowerCase() : ''
}

async function buildFileItem(fullPath: string, knownName?: string): Promise<FileItem> {
  const name = knownName ?? basename(fullPath)
  // lstat first so we can detect symlinks; then stat the (possibly) resolved target.
  const lst = await fs.lstat(fullPath)
  const isSymbolicLink = lst.isSymbolicLink()
  let st = lst
  if (isSymbolicLink) {
    try {
      st = await fs.stat(fullPath)
    } catch {
      // Broken symlink: fall back to lstat info.
      st = lst
    }
  }
  const isDirectory = st.isDirectory()
  const ext = extOf(name, isDirectory)
  return {
    name,
    path: fullPath,
    isDirectory,
    isSymbolicLink,
    size: isDirectory ? 0 : st.size,
    modified: st.mtimeMs,
    created: st.birthtimeMs || st.ctimeMs,
    ext,
    isHidden: name.startsWith('.'),
    kind: classifyKind({ isDirectory, ext, name })
  }
}

export async function readDirectory(dirPath: string): Promise<Result<FileItem[]>> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const items = await Promise.all(
      entries.map(async (entry) => {
        const full = join(dirPath, entry.name)
        try {
          return await buildFileItem(full, entry.name)
        } catch {
          // Permission denied or transient error on a single entry — skip it.
          return null
        }
      })
    )
    return ok(items.filter((i): i is FileItem => i !== null))
  } catch (err) {
    return fail(err)
  }
}

export async function getFileItem(p: string): Promise<Result<FileItem>> {
  try {
    return ok(await buildFileItem(p))
  } catch (err) {
    return fail(err)
  }
}

export function getHomeDir(): string {
  return os.homedir()
}

function tryPath(getter: () => string): string | null {
  try {
    return getter()
  } catch {
    return null
  }
}

export async function getQuickLinks(): Promise<QuickLink[]> {
  const candidates: QuickLink[] = []
  const home = os.homedir()
  const add = (name: string, p: string | null, icon: QuickLink['icon']): void => {
    if (p) candidates.push({ name, path: p, icon })
  }
  add('Home', home, 'home')
  add('Desktop', tryPath(() => app.getPath('desktop')), 'desktop')
  add('Documents', tryPath(() => app.getPath('documents')), 'documents')
  add('Downloads', tryPath(() => app.getPath('downloads')), 'downloads')
  add('Pictures', tryPath(() => app.getPath('pictures')), 'pictures')
  add('Music', tryPath(() => app.getPath('music')), 'music')
  add('Videos', tryPath(() => app.getPath('videos')), 'videos')

  const checked = await Promise.all(
    candidates.map(async (c) => ((await pathExists(c.path)) ? c : null))
  )
  return checked.filter((c): c is QuickLink => c !== null)
}

export async function getDrives(): Promise<DriveItem[]> {
  // Candidate mount points: the boot volume plus everything under /Volumes.
  const candidates: { name: string; path: string }[] = [{ name: 'Macintosh HD', path: '/' }]
  try {
    const vols = await fs.readdir('/Volumes', { withFileTypes: true })
    for (const v of vols) {
      candidates.push({ name: v.name, path: join('/Volumes', v.name) })
    }
  } catch {
    // /Volumes unreadable — ignore.
  }

  const drives: DriveItem[] = []
  const seenDevices = new Set<number>()
  for (const c of candidates) {
    try {
      // Dedupe firmlinks/aliases that resolve to the same physical volume.
      const st = await fs.stat(c.path)
      if (seenDevices.has(st.dev)) continue
      seenDevices.add(st.dev)
      const drive: DriveItem = { name: c.name, path: c.path, icon: 'drive' }
      try {
        const sf = await fs.statfs(c.path)
        drive.total = sf.blocks * sf.bsize
        drive.free = sf.bavail * sf.bsize
      } catch {
        // statfs may be unavailable; leave capacity undefined.
      }
      drives.push(drive)
    } catch {
      // Unreadable mount — skip.
    }
  }
  return drives
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

export function parentOf(p: string): string {
  const parent = dirname(p)
  return parent
}

export function joinPath(base: string, parts: string[]): string {
  return join(base, ...parts)
}

export async function openPath(p: string): Promise<Result<void>> {
  const err = await shell.openPath(p)
  if (err) return fail(err)
  return ok(undefined)
}

export async function revealInFinder(p: string): Promise<void> {
  shell.showItemInFolder(p)
}

/**
 * Generate a thumbnail for a file using the OS thumbnailer (QuickLook on macOS),
 * returned as a data: URL. Works for images, video, PDF, etc. Empty/failed → fail().
 */
export async function getThumbnail(p: string, size: number): Promise<Result<string>> {
  try {
    const px = Math.max(16, Math.min(512, Math.round(size) || 256))
    const img = await nativeImage.createThumbnailFromPath(p, { width: px, height: px })
    if (img.isEmpty()) return fail(new Error('No thumbnail'))
    return ok(img.toDataURL())
  } catch (err) {
    return fail(err)
  }
}

/** Returns a non-clashing path by appending " (n)" before the extension if needed. */
async function uniquePath(parentDir: string, name: string): Promise<string> {
  let candidate = join(parentDir, name)
  if (!(await pathExists(candidate))) return candidate
  const { name: stem, ext } = parsePath(name)
  for (let i = 2; i < 1000; i++) {
    candidate = join(parentDir, `${stem} (${i})${ext}`)
    if (!(await pathExists(candidate))) return candidate
  }
  return join(parentDir, `${stem} (${Date.now()})${ext}`)
}

export async function createFolder(parentDir: string, name: string): Promise<Result<FileItem>> {
  try {
    const target = await uniquePath(parentDir, name || 'New folder')
    await fs.mkdir(target)
    return ok(await buildFileItem(target))
  } catch (err) {
    return fail(err)
  }
}

export async function createTextFile(parentDir: string, name: string): Promise<Result<FileItem>> {
  try {
    const target = await uniquePath(parentDir, name || 'New Text Document.txt')
    await fs.writeFile(target, '', { flag: 'wx' })
    return ok(await buildFileItem(target))
  } catch (err) {
    return fail(err)
  }
}

export async function rename(targetPath: string, newName: string): Promise<Result<FileItem>> {
  try {
    const clean = newName.trim()
    if (!clean || clean.includes('/')) {
      return fail(new Error('Invalid name'))
    }
    const dest = join(dirname(targetPath), clean)
    if (dest === targetPath) return ok(await buildFileItem(targetPath))
    if (await pathExists(dest)) {
      return fail(new Error(`An item named "${clean}" already exists.`))
    }
    await fs.rename(targetPath, dest)
    return ok(await buildFileItem(dest))
  } catch (err) {
    return fail(err)
  }
}

export async function moveToTrash(paths: string[]): Promise<Result<void>> {
  // Trash each item independently so one failure doesn't abort the rest.
  const failures: string[] = []
  for (const p of paths) {
    try {
      await shell.trashItem(p)
    } catch {
      failures.push(basename(p))
    }
  }
  if (failures.length === 0) return ok(undefined)
  return fail(new Error(`Couldn't delete: ${failures.join(', ')}`))
}

export async function listConflicts(
  srcPaths: string[],
  destDir: string
): Promise<Result<string[]>> {
  try {
    const conflicts: string[] = []
    for (const src of srcPaths) {
      // Moving within the same folder is never a conflict.
      if (resolve(dirname(src)) === resolve(destDir)) continue
      if (await pathExists(join(destDir, basename(src)))) conflicts.push(basename(src))
    }
    return ok(conflicts)
  } catch (err) {
    return fail(err)
  }
}

async function transfer(
  op: 'copy' | 'move',
  srcPaths: string[],
  destDir: string,
  policy: ConflictPolicy,
  onProgress?: (p: OpProgress) => void
): Promise<TransferResult> {
  const moves: { from: string; to: string }[] = []
  const total = srcPaths.length
  let done = 0
  for (const src of srcPaths) {
    const name = basename(src)
    onProgress?.({ op, done, total, name })
    const sameDir = resolve(dirname(src)) === resolve(destDir)
    let target = join(destDir, name)
    let skip = false

    if (sameDir && op === 'move') {
      skip = true
    } else if (await pathExists(target)) {
      if (policy === 'skip') skip = true
      else if (policy === 'keep-both') target = await uniquePath(destDir, name)
      else if (policy === 'replace' && resolve(target) !== resolve(src)) {
        await fs.rm(target, { recursive: true, force: true })
      }
    }

    if (!skip) {
      if (op === 'move') {
        try {
          await fs.rename(src, target)
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
            await fs.cp(src, target, { recursive: true })
            await fs.rm(src, { recursive: true, force: true })
          } else {
            throw err
          }
        }
      } else {
        await fs.cp(src, target, { recursive: true })
      }
      moves.push({ from: src, to: target })
    }
    done++
    onProgress?.({ op, done, total, name })
  }
  return { moves }
}

export async function copy(
  srcPaths: string[],
  destDir: string,
  policy: ConflictPolicy = 'keep-both',
  onProgress?: (p: OpProgress) => void
): Promise<Result<TransferResult>> {
  try {
    return ok(await transfer('copy', srcPaths, destDir, policy, onProgress))
  } catch (err) {
    return fail(err)
  }
}

export async function move(
  srcPaths: string[],
  destDir: string,
  policy: ConflictPolicy = 'keep-both',
  onProgress?: (p: OpProgress) => void
): Promise<Result<TransferResult>> {
  try {
    return ok(await transfer('move', srcPaths, destDir, policy, onProgress))
  } catch (err) {
    return fail(err)
  }
}

function modeToString(mode: number, isDir: boolean, isLink: boolean): string {
  const type = isLink ? 'l' : isDir ? 'd' : '-'
  const rwx = (bits: number): string =>
    `${bits & 4 ? 'r' : '-'}${bits & 2 ? 'w' : '-'}${bits & 1 ? 'x' : '-'}`
  return type + rwx((mode >> 6) & 7) + rwx((mode >> 3) & 7) + rwx(mode & 7)
}

export async function getProperties(p: string): Promise<Result<PropertyInfo>> {
  try {
    const lst = await fs.lstat(p)
    const isSymbolicLink = lst.isSymbolicLink()
    let st = lst
    let symlinkTarget: string | undefined
    if (isSymbolicLink) {
      try {
        symlinkTarget = await fs.readlink(p)
      } catch {
        /* ignore */
      }
      try {
        st = await fs.stat(p)
      } catch {
        st = lst
      }
    }
    const name = basename(p)
    const isDirectory = st.isDirectory()
    const ext = extOf(name, isDirectory)
    const kind = classifyKind({ isDirectory, ext, name })
    return ok({
      name,
      path: p,
      parent: dirname(p),
      isDirectory,
      isSymbolicLink,
      symlinkTarget,
      size: isDirectory ? 0 : st.size,
      created: st.birthtimeMs || st.ctimeMs,
      modified: st.mtimeMs,
      accessed: st.atimeMs,
      mode: modeToString(st.mode, isDirectory, isSymbolicLink),
      kind,
      typeLabel: kindLabel({ kind, ext })
    })
  } catch (err) {
    return fail(err)
  }
}

export async function getFolderSize(p: string): Promise<Result<FolderSize>> {
  let size = 0
  let files = 0
  let folders = 0
  let complete = true
  const deadline = Date.now() + 12000

  async function walk(dir: string): Promise<void> {
    if (Date.now() > deadline) {
      complete = false
      return
    }
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (Date.now() > deadline) {
        complete = false
        return
      }
      const full = join(dir, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        folders++
        await walk(full)
      } else {
        files++
        try {
          size += (await fs.lstat(full)).size
        } catch {
          /* ignore unreadable entry */
        }
      }
    }
  }

  try {
    await walk(p)
    return ok({ size, files, folders, complete })
  } catch (err) {
    return fail(err)
  }
}

export async function readTextPreview(
  p: string,
  maxBytes = 64 * 1024
): Promise<Result<string>> {
  try {
    // Clamp to a sane range so a renderer can't request a huge allocation.
    const cap = Math.min(Math.max(1, Math.round(maxBytes) || 64 * 1024), 1024 * 1024)
    const fh = await fs.open(p, 'r')
    try {
      const buf = Buffer.alloc(cap)
      const { bytesRead } = await fh.read(buf, 0, cap, 0)
      const slice = buf.subarray(0, bytesRead)
      if (slice.includes(0)) return fail(new Error('Binary file'))
      return ok(slice.toString('utf8'))
    } finally {
      await fh.close()
    }
  } catch (err) {
    return fail(err)
  }
}

export async function compressZip(
  srcPaths: string[],
  destDir: string
): Promise<Result<FileItem>> {
  try {
    if (!srcPaths.length) return fail(new Error('Nothing to compress'))
    const cwd = dirname(srcPaths[0])
    const names = srcPaths.map((s) => basename(s))
    const outName = srcPaths.length === 1 ? `${parsePath(names[0]).name}.zip` : 'Archive.zip'
    const outPath = await uniquePath(destDir, outName)
    // Prefix each name with "./" so a file named e.g. "-T" or
    // "--unzip-command=..." can't be parsed by zip as an option (argument
    // injection -> arbitrary command execution). cwd is the items' parent dir.
    await execFileP('zip', ['-r', '-q', '-X', outPath, ...names.map((n) => `./${n}`)], { cwd })
    return ok(await buildFileItem(outPath))
  } catch (err) {
    return fail(err)
  }
}

export async function extractZip(zipPath: string, destDir: string): Promise<Result<void>> {
  try {
    const outDir = await uniquePath(destDir, parsePath(basename(zipPath)).name)
    await fs.mkdir(outDir)
    // ditto is the macOS built-in that handles .zip robustly.
    await execFileP('ditto', ['-x', '-k', zipPath, outDir])
    return ok(undefined)
  } catch (err) {
    return fail(err)
  }
}

export async function openInTerminal(dir: string): Promise<void> {
  try {
    await execFileP('open', ['-a', 'Terminal', dir])
  } catch {
    /* ignore */
  }
}

export async function openWithApp(appPath: string, filePath: string): Promise<Result<void>> {
  try {
    await execFileP('open', ['-a', appPath, filePath])
    return ok(undefined)
  } catch (err) {
    return fail(err)
  }
}

export async function search(rootPath: string, query: string): Promise<Result<FileItem[]>> {
  const needle = query.trim().toLowerCase()
  if (!needle) return ok([])
  const results: FileItem[] = []
  const MAX_RESULTS = 500
  const MAX_DEPTH = 8
  const deadline = Date.now() + 8000 // hard 8s cap so search always returns

  async function walk(dir: string, depth: number): Promise<void> {
    if (results.length >= MAX_RESULTS || depth > MAX_DEPTH || Date.now() > deadline) return
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (results.length >= MAX_RESULTS || Date.now() > deadline) return
      const full = join(dir, entry.name)
      if (entry.name.toLowerCase().includes(needle)) {
        try {
          results.push(await buildFileItem(full, entry.name))
        } catch {
          /* skip */
        }
      }
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        await walk(full, depth + 1)
      }
    }
  }

  try {
    await walk(rootPath, 0)
    return ok(results)
  } catch (err) {
    return fail(err)
  }
}
