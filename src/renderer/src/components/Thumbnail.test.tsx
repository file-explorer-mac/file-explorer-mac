import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import type React from 'react'
import { render, screen, act, cleanup } from '@testing-library/react'
import { makeFileItem } from '@test/factories'

// When true, the next `useRef(null)` (the component's span ref) reads back as
// null forever — exercising the defensive `if (!el) return` guard. The
// component destructures `useRef` from `react`, so we mock the module itself
// rather than spying on the namespace object.
let forceNullRef = false

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    default: actual,
    useRef: <T,>(initial: T) => {
      const r = actual.useRef(initial)
      if (forceNullRef && initial === null) {
        forceNullRef = false
        return Object.defineProperty({}, 'current', {
          get: () => null,
          set: () => {}
        }) as React.MutableRefObject<T>
      }
      return r
    }
  }
})

// Control the in-view firing: capture each registered callback so a test can
// "scroll" the element into view on demand, and assert the returned unsubscribe
// (unobserve) runs on unmount.
const observeInView = vi.fn<(el: Element, cb: () => void) => () => void>()
const unobserve = vi.fn()
let fireInView: (() => void) | null = null

vi.mock('@/utils/inView', () => ({
  observeInView: (el: Element, cb: () => void) => observeInView(el, cb)
}))

// Control thumbnail resolution synchronously.
const cachedThumbnail = vi.fn<(path: string, mtime: number) => string | null | undefined>()
const loadThumbnail = vi.fn<(path: string, mtime: number) => Promise<string | null>>()

vi.mock('@/utils/thumbnails', () => ({
  cachedThumbnail: (path: string, mtime: number) => cachedThumbnail(path, mtime),
  loadThumbnail: (path: string, mtime: number) => loadThumbnail(path, mtime)
}))

import { Thumbnail } from './Thumbnail'

beforeEach(() => {
  fireInView = null
  observeInView.mockReset()
  unobserve.mockReset()
  cachedThumbnail.mockReset()
  loadThumbnail.mockReset()
  // Default: register the callback and hand back the unobserve cleanup.
  observeInView.mockImplementation((_el, cb) => {
    fireInView = cb
    return unobserve
  })
  // Default benign returns.
  cachedThumbnail.mockReturnValue(undefined)
  loadThumbnail.mockResolvedValue(null)
})

afterEach(() => {
  cleanup()
})

/** Drive the captured in-view callback to flip the element into view. */
function scrollIntoView(): void {
  act(() => {
    fireInView?.()
  })
}

describe('Thumbnail', () => {
  it('renders nothing visible until the element scrolls into view', () => {
    const item = makeFileItem({ kind: 'image', path: '/p/a.png', ext: 'png' })
    const { container } = render(<Thumbnail item={item} size={48} />)

    // The wrapping span is present, but it has no img/svg child yet.
    expect(observeInView).toHaveBeenCalledTimes(1)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).toBeNull()
  })

  it('shows an OS thumbnail img once in view and loadThumbnail resolves a data URL', async () => {
    const item = makeFileItem({ kind: 'image', path: '/p/photo.jpg', ext: 'jpg', modified: 42 })
    let resolveThumb!: (v: string | null) => void
    loadThumbnail.mockReturnValue(
      new Promise<string | null>((res) => {
        resolveThumb = res
      })
    )

    render(<Thumbnail item={item} size={64} className="thumb" />)
    scrollIntoView()

    expect(loadThumbnail).toHaveBeenCalledWith('/p/photo.jpg', 42)

    await act(async () => {
      resolveThumb('data:image/png;base64,AAAA')
    })

    const img = screen.getByRole('presentation') as HTMLImageElement
    expect(img.tagName).toBe('IMG')
    expect(img).toHaveAttribute('src', 'data:image/png;base64,AAAA')
    expect(img).toHaveAttribute('width', '64')
    expect(img).toHaveAttribute('height', '64')
  })

  it('falls back to the FileGlyph when loadThumbnail resolves null', async () => {
    const item = makeFileItem({ kind: 'video', path: '/p/clip.mov', ext: 'mov' })
    loadThumbnail.mockResolvedValue(null)

    const { container } = render(<Thumbnail item={item} size={32} />)
    await act(async () => {
      scrollIntoView()
    })

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('uses an already-cached thumbnail (cached string) without calling loadThumbnail', async () => {
    const item = makeFileItem({ kind: 'pdf', path: '/p/doc.pdf', ext: 'pdf', modified: 7 })
    // Cached present from first render AND from the in-view effect.
    cachedThumbnail.mockReturnValue('data:image/png;base64,CACHED')

    render(<Thumbnail item={item} size={50} />)
    await act(async () => {
      scrollIntoView()
    })

    expect(loadThumbnail).not.toHaveBeenCalled()
    const img = screen.getByRole('presentation') as HTMLImageElement
    expect(img).toHaveAttribute('src', 'data:image/png;base64,CACHED')
    expect(cachedThumbnail).toHaveBeenCalledWith('/p/doc.pdf', 7)
  })

  it('renders the FileGlyph when the cached value is explicitly null (no thumbnail)', async () => {
    const item = makeFileItem({ kind: 'image', path: '/p/broken.png', ext: 'png' })
    // null (not undefined): a definitively "no thumbnail" cache hit.
    cachedThumbnail.mockReturnValue(null)

    const { container } = render(<Thumbnail item={item} size={40} />)
    await act(async () => {
      scrollIntoView()
    })

    expect(loadThumbnail).not.toHaveBeenCalled()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('renders the glyph (never a thumbnail) for non-previewable kinds', async () => {
    const item = makeFileItem({ kind: 'text', path: '/p/notes.txt', ext: 'txt' })

    const { container } = render(<Thumbnail item={item} size={32} />)
    await act(async () => {
      scrollIntoView()
    })

    // wantThumb is false: never consults the thumbnail loaders.
    expect(cachedThumbnail).not.toHaveBeenCalled()
    expect(loadThumbnail).not.toHaveBeenCalled()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('unobserves the element when unmounted before it comes into view', () => {
    const item = makeFileItem({ kind: 'image', path: '/p/a.png', ext: 'png' })
    const { unmount } = render(<Thumbnail item={item} size={32} />)

    expect(unobserve).not.toHaveBeenCalled()
    unmount()
    expect(unobserve).toHaveBeenCalledTimes(1)
  })

  it('does not re-observe once already in view (effect short-circuits)', () => {
    const item = makeFileItem({ kind: 'image', path: '/p/a.png', ext: 'png' })
    render(<Thumbnail item={item} size={32} />)
    expect(observeInView).toHaveBeenCalledTimes(1)

    scrollIntoView()

    // After flipping into view, the observe effect re-runs but bails early,
    // so it does not register a new observation.
    expect(observeInView).toHaveBeenCalledTimes(1)
  })

  it('ignores a late thumbnail resolution after unmount (alive guard)', async () => {
    const item = makeFileItem({ kind: 'image', path: '/p/late.png', ext: 'png' })
    let resolveThumb!: (v: string | null) => void
    loadThumbnail.mockReturnValue(
      new Promise<string | null>((res) => {
        resolveThumb = res
      })
    )

    const { unmount } = render(<Thumbnail item={item} size={32} />)
    scrollIntoView()
    expect(loadThumbnail).toHaveBeenCalledTimes(1)

    // Unmount first (runs the cleanup that sets alive=false), then resolve.
    unmount()
    await act(async () => {
      resolveThumb('data:image/png;base64,TOOLATE')
    })

    // No throw / no img mounted afterwards.
    expect(screen.queryByRole('presentation')).toBeNull()
  })

  it('bails out of observing when the element ref is not attached', () => {
    // Force the span ref to read as null so the `if (!el) return` guard fires.
    forceNullRef = true
    const item = makeFileItem({ kind: 'image', path: '/p/a.png', ext: 'png' })
    render(<Thumbnail item={item} size={32} />)
    forceNullRef = false

    // The effect ran but returned early before registering an observer.
    expect(observeInView).not.toHaveBeenCalled()
  })

  it('passes the item path + modified mtime through to the thumbnail loaders', () => {
    const item = makeFileItem({ kind: 'image', path: '/deep/dir/pic.png', ext: 'png', modified: 999 })
    render(<Thumbnail item={item} size={32} />)

    // Initial cached lookup (lazy useState initializer) uses path + modified.
    expect(cachedThumbnail).toHaveBeenCalledWith('/deep/dir/pic.png', 999)

    scrollIntoView()
    expect(loadThumbnail).toHaveBeenCalledWith('/deep/dir/pic.png', 999)
  })
})
