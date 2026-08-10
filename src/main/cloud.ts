import { promises as fs, createReadStream } from 'fs'
import { join, basename, relative, sep } from 'path'
import os from 'os'
import { shell } from 'electron'
import { supportsWebLink } from '../shared/types'
import type { CloudInfo, CloudProvider, CloudRoot, OpProgress, Result } from '../shared/types'

/**
 * Dropbox and OneDrive integration.
 *
 * Their Finder entries come from Finder Sync extensions (FIFinderSync), an
 * extension point macOS loads into Finder and nothing else — there is no API to
 * host or invoke another app's extension. So this module does not surface their
 * menus; it recognises their folders and offers our own equivalents.
 *
 * Everything here is read-only detection plus one action (materialise), and each
 * lookup degrades to "not a cloud path" rather than throwing.
 */

const ok = <T>(data: T): Result<T> => ({ ok: true, data })
const fail = (error: unknown): Result<never> => ({
  ok: false,
  error: error instanceof Error ? error.message : String(error),
  code: (error as NodeJS.ErrnoException)?.code
})

/** Where modern macOS mounts File Provider sync roots. */
const cloudStorageDir = (): string => join(os.homedir(), 'Library', 'CloudStorage')

/** Dropbox publishes its sync roots here; this is how Dropbox expects to be found. */
const dropboxInfoPath = (): string => join(os.homedir(), '.dropbox', 'info.json')

/**
 * macOS names File Provider roots "<Service><n?>-<Account>", e.g.
 * "Dropbox-NPOSystems", "OneDrive2-Mickey", "GoogleDrive-someone@gmail.com".
 */
const PROVIDER_PREFIXES: { re: RegExp; provider: CloudProvider; name: string }[] = [
  { re: /^Dropbox\d*(-|$)/i, provider: 'dropbox', name: 'Dropbox' },
  { re: /^OneDrive\d*(-|$)/i, provider: 'onedrive', name: 'OneDrive' },
  { re: /^GoogleDrive\d*(-|$)/i, provider: 'googledrive', name: 'Google Drive' },
  { re: /^Box\d*(-|$)/i, provider: 'box', name: 'Box' },
  { re: /^iCloudDrive\d*(-|$)/i, provider: 'icloud', name: 'iCloud Drive' }
]

/** "Dropbox-NPOSystems" → "NPOSystems". */
function accountSuffix(folder: string): string {
  const dash = folder.indexOf('-')
  return dash === -1 ? '' : folder.slice(dash + 1)
}

function classify(folder: string): { provider: CloudProvider; label: string } {
  const match = PROVIDER_PREFIXES.find((p) => p.re.test(folder))
  const account = accountSuffix(folder)
  // An unrecognised CloudStorage entry is still a cloud folder worth listing.
  const name = match?.name ?? folder.split('-')[0]
  return {
    provider: match?.provider ?? 'other',
    label: account ? `${name} (${account})` : name
  }
}

/** Sync roots under ~/Library/CloudStorage, where every File Provider lives now. */
async function cloudStorageRoots(): Promise<CloudRoot[]> {
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(cloudStorageDir(), { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => ({ ...classify(e.name), root: join(cloudStorageDir(), e.name) }))
}

/** iCloud Drive predates CloudStorage and still lives under Mobile Documents. */
async function iCloudRoot(): Promise<CloudRoot[]> {
  const root = join(os.homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs')
  try {
    if ((await fs.stat(root)).isDirectory()) {
      return [{ provider: 'icloud', root, label: 'iCloud Drive' }]
    }
  } catch {
    /* not signed in to iCloud Drive */
  }
  return []
}

/** Legacy/explicit Dropbox roots straight from Dropbox's own info.json. */
async function dropboxInfoRoots(): Promise<CloudRoot[]> {
  try {
    const raw = await fs.readFile(dropboxInfoPath(), 'utf8')
    const parsed = JSON.parse(raw) as Record<string, { path?: string; root_path?: string }>
    return Object.values(parsed)
      .map((acc) => acc.root_path ?? acc.path)
      .filter((p): p is string => typeof p === 'string' && p.length > 0)
      .map((root) => ({ provider: 'dropbox' as const, root, label: classify(basename(root)).label }))
  } catch {
    return []
  }
}

let rootsCache: CloudRoot[] | null = null

/** Every cloud sync root on this machine. Cached; call reset to re-scan. */
export async function listCloudRoots(): Promise<CloudRoot[]> {
  if (rootsCache) return rootsCache
  const found = [
    ...(await dropboxInfoRoots()),
    ...(await cloudStorageRoots()),
    ...(await iCloudRoot())
  ]
  const byPath = new Map<string, CloudRoot>()
  for (const r of found) if (!byPath.has(r.root)) byPath.set(r.root, r)
  rootsCache = [...byPath.values()].sort((a, b) => a.label.localeCompare(b.label))
  return rootsCache
}

/**
 * Sidebar listing of cloud folders, for the "This PC" section. No error path:
 * every scan listCloudRoots runs degrades to an empty list on its own.
 */
export async function getCloudRoots(): Promise<Result<CloudRoot[]>> {
  return ok(await listCloudRoots())
}

/** Drops the cached roots so a newly-linked account is picked up. */
export function resetCloudRoots(): void {
  rootsCache = null
  oneDriveSiteCache = undefined
}

/** True when `path` is the root itself or sits inside it. */
function isUnder(path: string, root: string): boolean {
  if (path === root) return true
  return path.startsWith(root.endsWith(sep) ? root : root + sep)
}

/** The most specific root containing `path` — team roots nest inside each other. */
function rootFor(path: string, roots: CloudRoot[]): CloudRoot | null {
  let best: CloudRoot | null = null
  for (const r of roots) {
    if (!isUnder(path, r.root)) continue
    if (!best || r.root.length > best.root.length) best = r
  }
  return best
}

const encodePath = (rel: string): string =>
  rel
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')

let oneDriveSiteCache: string | null | undefined

/**
 * OneDrive's personal site URL, dug out of its local sync databases.
 *
 * Microsoft publishes no supported local mapping from a synced path to its web
 * URL, so this scans the settings databases for the site host. It is a
 * best-effort convenience: when it finds nothing, callers fall back to the
 * OneDrive home page, which still gets the user somewhere useful.
 */
async function oneDriveSite(): Promise<string | null> {
  if (oneDriveSiteCache !== undefined) return oneDriveSiteCache
  oneDriveSiteCache = null
  const settings = join(os.homedir(), 'Library', 'Application Support', 'OneDrive', 'settings')
  const pattern = /https:\/\/[a-z0-9-]+-my\.sharepoint\.com\/personal\/[a-z0-9_]+/gi
  try {
    const counts = new Map<string, number>()
    for (const file of await collectFiles(settings, 3)) {
      if (!file.endsWith('.db') && !file.endsWith('.ini')) continue
      const text = await fs.readFile(file, 'latin1')
      for (const m of text.match(pattern) ?? []) counts.set(m, (counts.get(m) ?? 0) + 1)
    }
    // Binary scanning picks up truncated neighbours, so trust the most frequent.
    let best: string | null = null
    let bestCount = 0
    for (const [url, n] of counts) {
      if (n > bestCount || (n === bestCount && best !== null && url.length < best.length)) {
        best = url
        bestCount = n
      }
    }
    oneDriveSiteCache = best
  } catch {
    oneDriveSiteCache = null
  }
  return oneDriveSiteCache
}

/** Files under `dir`, at most `depth` levels down. Missing dirs yield nothing. */
async function collectFiles(dir: string, depth: number): Promise<string[]> {
  if (depth < 0) return []
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: string[] = []
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await collectFiles(full, depth - 1)))
    else out.push(full)
  }
  return out
}

/** Web URL for a synced item. Only call for providers `supportsWebLink` accepts. */
async function webUrlFor(
  provider: CloudProvider,
  relativePath: string,
  isDirectory: boolean
): Promise<string> {
  if (provider === 'dropbox') {
    // Dropbox mirrors the synced tree under /home.
    const parts = relativePath.split('/').filter(Boolean)
    if (!isDirectory && parts.length > 0) {
      const name = parts[parts.length - 1]
      const dir = encodePath(parts.slice(0, -1).join('/'))
      return `https://www.dropbox.com/home/${dir}?preview=${encodeURIComponent(name)}`
    }
    return `https://www.dropbox.com/home/${encodePath(relativePath)}`
  }
  const site = await oneDriveSite()
  if (!site) return 'https://onedrive.live.com/'
  // .../personal/<user> → the web view wants an id rooted at the document library.
  const personal = new URL(site).pathname
  const id = `${personal}/Documents${relativePath ? `/${relativePath}` : ''}`
  return `${site}/_layouts/15/onedrive.aspx?id=${encodeURIComponent(id)}`
}

/**
 * A File Provider placeholder reports its real size but has no blocks allocated.
 * (`ls -lO` calls the same condition "dataless".)
 */
const isDataless = (size: number, blocks: number): boolean => size > 0 && blocks === 0

/**
 * Cloud details for a path, or null when it isn't inside a synced folder.
 *
 * Deliberately cheap — one stat against cached roots — because the context menu
 * waits on it. Resolving the web URL can touch OneDrive's databases, so that
 * lives in `openOnWeb` and only runs when the user asks for it.
 */
export async function cloudInfo(path: string): Promise<Result<CloudInfo | null>> {
  try {
    const root = rootFor(path, await listCloudRoots())
    if (!root) return ok(null)
    const st = await fs.stat(path)
    return ok({
      provider: root.provider,
      label: root.label,
      root: root.root,
      relativePath: relative(root.root, path).split(sep).join('/'),
      dataless: st.isDirectory() ? false : isDataless(st.size, st.blocks)
    })
  } catch (e) {
    return fail(e)
  }
}

/** Opens the item on the provider's website. Returns the URL that was opened. */
export async function openOnWeb(path: string): Promise<Result<string>> {
  try {
    const root = rootFor(path, await listCloudRoots())
    if (!root || !supportsWebLink(root.provider)) {
      return fail(new Error('Not inside a Dropbox or OneDrive folder'))
    }
    const st = await fs.stat(path)
    const rel = relative(root.root, path).split(sep).join('/')
    const url = await webUrlFor(root.provider, rel, st.isDirectory())
    await shell.openExternal(url)
    return ok(url)
  } catch (e) {
    return fail(e)
  }
}

/** Every file under `path` (or `path` itself when it is a file). */
async function filesUnder(path: string): Promise<string[]> {
  const st = await fs.stat(path)
  if (!st.isDirectory()) return [path]
  const entries = await fs.readdir(path, { withFileTypes: true })
  const out: string[] = []
  for (const e of entries) {
    // Symlinks are left alone: following them would pull in unrelated trees.
    if (e.isSymbolicLink()) continue
    out.push(...(await filesUnder(join(path, e.name))))
  }
  return out
}

/** Streams a file's bytes and discards them, which is what triggers the download. */
function readThrough(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(path)
    stream.on('data', () => {})
    stream.on('end', () => resolve())
    stream.on('error', reject)
  })
}

/**
 * Downloads placeholder contents so the items work offline.
 *
 * This materialises the files — it cannot set Dropbox's or OneDrive's "always
 * keep on this device" pin, which only their own apps can write, so macOS may
 * evict the contents again later to reclaim space.
 */
export async function makeAvailableOffline(
  paths: string[],
  onProgress?: (p: OpProgress) => void
): Promise<Result<{ files: number }>> {
  try {
    const files: string[] = []
    for (const p of paths) files.push(...(await filesUnder(p)))
    let done = 0
    for (const file of files) {
      onProgress?.({ op: 'download', done, total: files.length, name: basename(file) })
      const st = await fs.stat(file)
      // Skip anything already on disk so a big folder doesn't re-read everything.
      if (isDataless(st.size, st.blocks)) await readThrough(file)
      done++
    }
    onProgress?.({ op: 'download', done, total: files.length, name: '' })
    return ok({ files: files.length })
  } catch (e) {
    return fail(e)
  }
}
