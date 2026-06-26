import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * `observeInView` wraps a module-level singleton IntersectionObserver. To test it
 * deterministically we replace `globalThis.IntersectionObserver` with a controllable
 * mock that captures the constructor callback, records its options, and lets us fire
 * arbitrary entries. Because the source caches the observer (and a WeakMap of
 * callbacks) at module scope, we `vi.resetModules()` and re-import between cases so
 * each test starts from a clean singleton.
 */

type IOCallback = (entries: Array<{ target: Element; isIntersecting: boolean }>) => void

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []

  cb: IOCallback
  options: IntersectionObserverInit | undefined
  observe = vi.fn<(el: Element) => void>()
  unobserve = vi.fn<(el: Element) => void>()
  disconnect = vi.fn()

  constructor(cb: IOCallback, options?: IntersectionObserverInit) {
    this.cb = cb
    this.options = options
    MockIntersectionObserver.instances.push(this)
  }

  /** Fire the captured callback as if these targets crossed the threshold. */
  fire(entries: Array<{ target: Element; isIntersecting: boolean }>): void {
    this.cb(entries)
  }
}

const originalIO = globalThis.IntersectionObserver

beforeEach(() => {
  MockIntersectionObserver.instances = []
  ;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    MockIntersectionObserver
  vi.resetModules()
})

afterEach(() => {
  ;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    originalIO
})

async function loadModule(): Promise<typeof import('./inView')> {
  return import('./inView')
}

describe('observeInView', () => {
  it('lazily creates a single shared observer with a 500px prefetch margin', async () => {
    const { observeInView } = await loadModule()
    const el = document.createElement('div')

    expect(MockIntersectionObserver.instances).toHaveLength(0)

    observeInView(el, vi.fn())

    expect(MockIntersectionObserver.instances).toHaveLength(1)
    const io = MockIntersectionObserver.instances[0]
    expect(io.options).toEqual({ rootMargin: '500px 0px' })
    expect(io.observe).toHaveBeenCalledWith(el)
  })

  it('reuses the singleton observer on subsequent calls', async () => {
    const { observeInView } = await loadModule()
    const a = document.createElement('div')
    const b = document.createElement('div')

    observeInView(a, vi.fn())
    observeInView(b, vi.fn())

    // Still exactly one observer instance, both elements observed on it.
    expect(MockIntersectionObserver.instances).toHaveLength(1)
    const io = MockIntersectionObserver.instances[0]
    expect(io.observe).toHaveBeenNthCalledWith(1, a)
    expect(io.observe).toHaveBeenNthCalledWith(2, b)
  })

  it('fires the callback once when the element intersects, then unobserves it', async () => {
    const { observeInView } = await loadModule()
    const el = document.createElement('div')
    const cb = vi.fn()
    observeInView(el, cb)

    const io = MockIntersectionObserver.instances[0]
    io.fire([{ target: el, isIntersecting: true }])

    expect(cb).toHaveBeenCalledTimes(1)
    expect(io.unobserve).toHaveBeenCalledWith(el)

    // The callback was deleted: a second intersection event is a no-op.
    io.fire([{ target: el, isIntersecting: true }])
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('ignores entries that are not intersecting', async () => {
    const { observeInView } = await loadModule()
    const el = document.createElement('div')
    const cb = vi.fn()
    observeInView(el, cb)

    const io = MockIntersectionObserver.instances[0]
    io.fire([{ target: el, isIntersecting: false }])

    expect(cb).not.toHaveBeenCalled()
    expect(io.unobserve).not.toHaveBeenCalled()
  })

  it('ignores an intersecting entry whose target has no registered callback', async () => {
    const { observeInView } = await loadModule()
    const el = document.createElement('div')
    observeInView(el, vi.fn())

    const io = MockIntersectionObserver.instances[0]
    // A stray target the WeakMap never knew about — `callbacks.get` returns undefined.
    const stranger = document.createElement('span')
    io.fire([{ target: stranger, isIntersecting: true }])

    expect(io.unobserve).not.toHaveBeenCalled()
  })

  it('unsubscribe deletes the callback and unobserves the element', async () => {
    const { observeInView } = await loadModule()
    const el = document.createElement('div')
    const cb = vi.fn()
    const unsubscribe = observeInView(el, cb)

    const io = MockIntersectionObserver.instances[0]
    unsubscribe()

    expect(io.unobserve).toHaveBeenCalledWith(el)

    // After unsubscribing, an intersection event no longer fires the callback.
    io.fire([{ target: el, isIntersecting: true }])
    expect(cb).not.toHaveBeenCalled()
  })
})
