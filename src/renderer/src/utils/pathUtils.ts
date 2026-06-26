/**
 * POSIX path helpers for the renderer (the real path ops live in main; these are
 * for display: breadcrumbs, tab titles, etc.).
 */

/**
 * Sentinel "path" for the virtual Home landing page (the Home view with
 * Quick access + Recent/Favorites). It is never read from disk — the store
 * short-circuits it and renders <HomeView> instead of a directory listing.
 */
export const HOME_PATH = 'home://'

export function basename(p: string): string {
  if (p === '/') return '/'
  const trimmed = p.endsWith('/') ? p.slice(0, -1) : p
  const idx = trimmed.lastIndexOf('/')
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed
}

export function parentPath(p: string): string {
  if (p === '/') return '/'
  const trimmed = p.endsWith('/') ? p.slice(0, -1) : p
  const idx = trimmed.lastIndexOf('/')
  if (idx <= 0) return '/'
  return trimmed.slice(0, idx)
}

export interface Segment {
  name: string
  path: string
}

/** Friendly label for a path used in tabs and the address bar leaf. */
export function displayName(p: string, homeDir: string): string {
  if (p === HOME_PATH) return 'Home'
  if (p === '/') return 'Macintosh HD'
  if (homeDir && p === homeDir) return 'Home'
  if (p.startsWith('/Volumes/')) {
    const rest = p.slice('/Volumes/'.length)
    if (!rest.includes('/')) return rest
  }
  return basename(p)
}

/** Build breadcrumb segments from the filesystem root to the given path. */
export function toSegments(p: string, homeDir: string): Segment[] {
  // The virtual Home page is a single, root-level crumb (it has no parent).
  if (p === HOME_PATH) return [{ name: 'Home', path: HOME_PATH }]
  const segs: Segment[] = []
  const parts = p.split('/').filter(Boolean)
  let acc = ''
  // Always start at the root drive.
  segs.push({ name: 'Macintosh HD', path: '/' })
  for (const part of parts) {
    acc += '/' + part
    segs.push({ name: part, path: acc })
  }
  // Collapse the home directory into a single friendly crumb when applicable.
  if (homeDir && p.startsWith(homeDir)) {
    const homeParts = homeDir.split('/').filter(Boolean).length
    const collapsed: Segment[] = [{ name: 'Home', path: homeDir }]
    // Append everything below home.
    for (let i = homeParts + 1; i < segs.length; i++) collapsed.push(segs[i])
    return collapsed
  }
  return segs
}
