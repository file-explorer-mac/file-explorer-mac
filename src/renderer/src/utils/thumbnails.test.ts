import { describe, it, expect, beforeEach, vi } from 'vitest'
import { installApiMock, type ApiMock } from '@test/apiMock'

/**
 * thumbnails.ts keeps module-level state (cache / inflight / queue / active),
 * so each test loads a FRESH copy of the module via vi.resetModules() + dynamic
 * import. We install our own api mock first and override `getThumbnail` per test.
 */
type ThumbModule = typeof import('./thumbnails')

async function freshModule(): Promise<{ mod: ThumbModule; api: ApiMock }> {
  vi.resetModules()
  const api = installApiMock()
  const mod = await import('./thumbnails')
  return { mod, api }
}

/** A deferred promise helper to control resolution timing of getThumbnail. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e?: unknown) => void } {
  let resolve!: (v: T) => void
  let reject!: (e?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.resetModules()
})

describe('cachedThumbnail', () => {
  it('returns undefined when nothing is cached for the key', async () => {
    const { mod } = await freshModule()
    expect(mod.cachedThumbnail('/a/b.png', 123)).toBeUndefined()
  })

  it('returns the cached data URL once a successful load completes', async () => {
    const { mod, api } = await freshModule()
    api.getThumbnail.mockResolvedValue({ ok: true, data: 'data:image/png;base64,AAA' })

    const value = await mod.loadThumbnail('/a/b.png', 123)
    expect(value).toBe('data:image/png;base64,AAA')
    // Now synchronously available.
    expect(mod.cachedThumbnail('/a/b.png', 123)).toBe('data:image/png;base64,AAA')
  })

  it('returns null (not undefined) when the key is cached as null', async () => {
    const { mod, api } = await freshModule()
    api.getThumbnail.mockResolvedValue({ ok: false, error: 'nope' })

    await mod.loadThumbnail('/a/b.png', 123)
    expect(mod.cachedThumbnail('/a/b.png', 123)).toBeNull()
  })

  it('keys on path AND mtime — a different mtime is a different (absent) key', async () => {
    const { mod, api } = await freshModule()
    api.getThumbnail.mockResolvedValue({ ok: true, data: 'data:abc' })

    await mod.loadThumbnail('/a/b.png', 1)
    expect(mod.cachedThumbnail('/a/b.png', 1)).toBe('data:abc')
    // Same path, different mtime => not cached yet.
    expect(mod.cachedThumbnail('/a/b.png', 2)).toBeUndefined()
  })
})

describe('loadThumbnail', () => {
  it('requests the OS thumbnail at 256px and caches the data URL on success', async () => {
    const { mod, api } = await freshModule()
    api.getThumbnail.mockResolvedValue({ ok: true, data: 'data:ok' })

    const value = await mod.loadThumbnail('/img.png', 99)

    expect(value).toBe('data:ok')
    expect(api.getThumbnail).toHaveBeenCalledTimes(1)
    expect(api.getThumbnail).toHaveBeenCalledWith('/img.png', 256)
  })

  it('caches null when the result is ok:false', async () => {
    const { mod, api } = await freshModule()
    api.getThumbnail.mockResolvedValue({ ok: false, error: 'no thumb' })

    const value = await mod.loadThumbnail('/img.png', 99)
    expect(value).toBeNull()
    expect(mod.cachedThumbnail('/img.png', 99)).toBeNull()
  })

  it('caches null when the result is ok:true but has no data', async () => {
    const { mod, api } = await freshModule()
    api.getThumbnail.mockResolvedValue({ ok: true, data: undefined })

    const value = await mod.loadThumbnail('/img.png', 99)
    expect(value).toBeNull()
    expect(mod.cachedThumbnail('/img.png', 99)).toBeNull()
  })

  it('catches a rejected getThumbnail and resolves to null, caching null', async () => {
    const { mod, api } = await freshModule()
    api.getThumbnail.mockRejectedValue(new Error('boom'))

    const value = await mod.loadThumbnail('/img.png', 99)
    expect(value).toBeNull()
    expect(mod.cachedThumbnail('/img.png', 99)).toBeNull()
  })

  it('returns a synchronously-resolved cached value on a cache hit (no second IPC call)', async () => {
    const { mod, api } = await freshModule()
    api.getThumbnail.mockResolvedValue({ ok: true, data: 'data:cached' })

    await mod.loadThumbnail('/img.png', 7)
    expect(api.getThumbnail).toHaveBeenCalledTimes(1)

    // Second call hits the cache branch: same value, no new IPC.
    const again = await mod.loadThumbnail('/img.png', 7)
    expect(again).toBe('data:cached')
    expect(api.getThumbnail).toHaveBeenCalledTimes(1)
  })

  it('returns the cached null value on a cache hit when previously cached as null', async () => {
    const { mod, api } = await freshModule()
    api.getThumbnail.mockResolvedValue({ ok: false })

    await mod.loadThumbnail('/img.png', 7)
    expect(api.getThumbnail).toHaveBeenCalledTimes(1)

    const again = await mod.loadThumbnail('/img.png', 7)
    expect(again).toBeNull()
    expect(api.getThumbnail).toHaveBeenCalledTimes(1)
  })

  it('dedupes in-flight requests: two calls for the same key share one promise and one IPC call', async () => {
    const { mod, api } = await freshModule()
    const d = deferred<{ ok: boolean; data?: string }>()
    api.getThumbnail.mockReturnValue(d.promise)

    const p1 = mod.loadThumbnail('/img.png', 5)
    const p2 = mod.loadThumbnail('/img.png', 5)

    // Same promise instance returned for the duplicate in-flight request.
    expect(p1).toBe(p2)
    expect(api.getThumbnail).toHaveBeenCalledTimes(1)

    d.resolve({ ok: true, data: 'data:shared' })
    const [v1, v2] = await Promise.all([p1, p2])
    expect(v1).toBe('data:shared')
    expect(v2).toBe('data:shared')
    expect(api.getThumbnail).toHaveBeenCalledTimes(1)
  })

  it('allows a fresh request for the same key after the in-flight one settles', async () => {
    const { mod, api } = await freshModule()
    api.getThumbnail.mockResolvedValue({ ok: true, data: 'data:first' })

    await mod.loadThumbnail('/img.png', 5)
    // After it settles it is cached, so the next call hits cache (covered above).
    // Use a different mtime to force a brand-new inflight + run path again.
    api.getThumbnail.mockResolvedValue({ ok: true, data: 'data:second' })
    const v = await mod.loadThumbnail('/img.png', 6)
    expect(v).toBe('data:second')
    expect(api.getThumbnail).toHaveBeenCalledTimes(2)
  })

  it('caps concurrency at MAX_CONCURRENT=8 and pumps the queue as requests resolve', async () => {
    const { mod, api } = await freshModule()

    const deferreds: Array<ReturnType<typeof deferred<{ ok: boolean; data?: string }>>> = []
    api.getThumbnail.mockImplementation(() => {
      const d = deferred<{ ok: boolean; data?: string }>()
      deferreds.push(d)
      return d.promise
    })

    // Fire 12 distinct requests (different paths => different keys).
    const total = 12
    const promises: Array<Promise<string | null>> = []
    for (let i = 0; i < total; i++) {
      promises.push(mod.loadThumbnail(`/img-${i}.png`, 1))
    }

    // Only the first 8 should have started (active capped at MAX_CONCURRENT).
    expect(api.getThumbnail).toHaveBeenCalledTimes(8)
    expect(deferreds).toHaveLength(8)

    // Resolve the first one; the queue should pump the 9th task.
    deferreds[0].resolve({ ok: true, data: 'data:0' })
    await deferreds[0].promise
    // Let microtasks flush so .finally → pump runs.
    await Promise.resolve()
    await Promise.resolve()
    expect(api.getThumbnail).toHaveBeenCalledTimes(9)

    // Resolve the rest in order, flushing between each so pump keeps draining.
    let i = 1
    while (i < deferreds.length) {
      deferreds[i].resolve({ ok: true, data: `data:${i}` })
      // eslint-disable-next-line no-await-in-loop
      await deferreds[i].promise
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve()
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve()
      i++
    }

    // All 12 eventually issued one IPC call each.
    expect(api.getThumbnail).toHaveBeenCalledTimes(total)

    const values = await Promise.all(promises)
    expect(values).toEqual(Array.from({ length: total }, (_, n) => `data:${n}`))
  })
})
