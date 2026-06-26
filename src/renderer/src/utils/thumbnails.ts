/**
 * Thumbnail loader for the file list. Requests OS-generated thumbnails from the
 * main process, caches them by path+mtime, dedupes in-flight requests, and caps
 * concurrency so large folders don't spawn hundreds of jobs at once.
 */

const THUMB_PX = 256
const MAX_CONCURRENT = 8

// path|mtime -> dataURL (or null when no thumbnail is available)
const cache = new Map<string, string | null>()
const inflight = new Map<string, Promise<string | null>>()
const queue: Array<() => void> = []
let active = 0

function pump(): void {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const task = queue.shift()!
    task()
  }
}

function keyOf(path: string, mtime: number): string {
  return `${path}|${mtime}`
}

/** Synchronously returns a cached thumbnail if present, else undefined. */
export function cachedThumbnail(path: string, mtime: number): string | null | undefined {
  return cache.get(keyOf(path, mtime))
}

/** Request a thumbnail; resolves to a data URL, or null if none can be made. */
export function loadThumbnail(path: string, mtime: number): Promise<string | null> {
  const key = keyOf(path, mtime)
  if (cache.has(key)) return Promise.resolve(cache.get(key) as string | null)
  const existing = inflight.get(key)
  if (existing) return existing

  const promise = new Promise<string | null>((resolve) => {
    const run = (): void => {
      active++
      window.api
        .getThumbnail(path, THUMB_PX)
        .then((res) => {
          const value = res.ok && res.data ? res.data : null
          cache.set(key, value)
          resolve(value)
        })
        .catch(() => {
          cache.set(key, null)
          resolve(null)
        })
        .finally(() => {
          active--
          inflight.delete(key)
          pump()
        })
    }
    queue.push(run)
    pump()
  })

  inflight.set(key, promise)
  return promise
}
