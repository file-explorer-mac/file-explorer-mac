import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import FileView from './FileView'
import { useExplorerStore } from '@/store/explorerStore'
import { resetExplorerStore } from '@test/storeHelpers'
import { installApiMock } from '@test/apiMock'
import { makeFileItem } from '@test/factories'

// 50 files: numeric collation keeps them in f0, f1, … f49 order, so visible[i]
// is /p/f{i}.txt.
const many = Array.from({ length: 50 }, (_, i) =>
  makeFileItem({ name: `f${i}.txt`, path: `/p/f${i}.txt` })
)

beforeEach(() => {
  resetExplorerStore()
  installApiMock()
  useExplorerStore.setState({ currentPath: '/p', loading: false, groupBy: 'none', items: many })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const rootOf = (container: HTMLElement): HTMLElement =>
  container.querySelector('.root') as HTMLElement

/** Give the (layout-less) jsdom root a real size + scroll, then let FileView measure it. */
function setViewport(
  root: HTMLElement,
  { width = 500, height = 100, scrollTop = 0 } = {}
): void {
  Object.defineProperty(root, 'clientWidth', { value: width, configurable: true })
  Object.defineProperty(root, 'clientHeight', { value: height, configurable: true })
  Object.defineProperty(root, 'scrollTop', { value: scrollTop, configurable: true, writable: true })
  root.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width, height, right: width, bottom: height }) as DOMRect
  act(() => {
    fireEvent.scroll(root)
  })
}

const paths = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('[data-path]')].map((n) => n.getAttribute('data-path') as string)

describe('FileView — windowing (large flat list)', () => {
  it('renders only the rows near the viewport, not the whole folder', () => {
    useExplorerStore.setState({ viewMode: 'list' })
    const { container } = render(<FileView />)
    // Before measuring, the size-less fallback renders every row.
    expect(container.querySelectorAll('[data-path]').length).toBe(50)

    setViewport(rootOf(container), { width: 500, height: 60 })
    const shown = paths(container)
    expect(shown.length).toBeLessThan(50)
    expect(shown).toContain('/p/f0.txt')
    expect(shown).not.toContain('/p/f49.txt')
  })

  it('reflects the whole folder height in a spacer so the scrollbar is correct', () => {
    useExplorerStore.setState({ viewMode: 'list' })
    const { container } = render(<FileView />)
    setViewport(rootOf(container), { width: 500, height: 60 })
    // 2 columns → 25 rows: padTop 8 + 25*26 + 24*1 + padBottom 8.
    const sizer = rootOf(container).firstElementChild as HTMLElement
    expect(sizer.style.height).toBe(`${8 + 25 * 26 + 24 + 8}px`)
    expect(sizer.style.position).toBe('relative')
  })

  it('shifts the rendered window as the user scrolls', () => {
    useExplorerStore.setState({ viewMode: 'list' })
    const { container } = render(<FileView />)
    const root = rootOf(container)
    setViewport(root, { width: 500, height: 60 })
    expect(paths(container)).toContain('/p/f0.txt')

    setViewport(root, { width: 500, height: 60, scrollTop: 400 })
    const shown = paths(container)
    expect(shown).not.toContain('/p/f0.txt')
    expect(shown).toContain('/p/f30.txt')
  })

  it('positions windowed rows absolutely within the spacer', () => {
    useExplorerStore.setState({ viewMode: 'list' })
    const { container } = render(<FileView />)
    setViewport(rootOf(container), { width: 500, height: 60 })
    const first = container.querySelector('[data-path="/p/f0.txt"]') as HTMLElement
    expect(first.style.position).toBe('absolute')
    expect(first.style.left).toBe('8px')
    expect(first.style.top).toBe('8px')
  })

  it('windows the details view with a sticky header above the rows', () => {
    useExplorerStore.setState({ viewMode: 'details' })
    const { container } = render(<FileView />)
    setViewport(rootOf(container), { width: 500, height: 100 })
    const header = container.querySelector('.headerRow') as HTMLElement
    expect(header).not.toBeNull()
    expect(header.style.position).toBe('sticky')
    // Far fewer than 50 rows are rendered.
    expect(container.querySelectorAll('.detailRow').length).toBeLessThan(50)
  })

  it('does not window grouped views (every row still renders)', () => {
    useExplorerStore.setState({ viewMode: 'list', groupBy: 'name' })
    const { container } = render(<FileView />)
    setViewport(rootOf(container), { width: 500, height: 60 })
    expect(container.querySelectorAll('[data-path]').length).toBe(50)
  })
})

describe('FileView — windowed marquee selection', () => {
  it('selects items by geometry when off-screen rows are not in the DOM', () => {
    useExplorerStore.setState({ viewMode: 'list' })
    const { container } = render(<FileView />)
    const root = rootOf(container)
    setViewport(root, { width: 500, height: 200 })

    // Drag a box over the first two rows (cols 0/1 → items 0..3).
    fireEvent.mouseDown(root, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.mouseMove(window, { clientX: 250, clientY: 40 })
    const sel = useExplorerStore.getState().selection
    expect([...sel].sort()).toEqual(['/p/f0.txt', '/p/f1.txt', '/p/f2.txt', '/p/f3.txt'])
    fireEvent.mouseUp(window)
  })
})

describe('FileView — windowed scroll-into-view', () => {
  it('scrolls a below-viewport anchor into view', () => {
    useExplorerStore.setState({ viewMode: 'list' })
    const { container } = render(<FileView />)
    const root = rootOf(container)
    setViewport(root, { width: 500, height: 60 })

    act(() => {
      useExplorerStore.getState().selectOne('/p/f49.txt')
    })
    // row 24 → top 8 + 24*27 = 656, bottom 682; viewport 60 → scrollTop 682-60.
    expect(root.scrollTop).toBe(682 - 60)
  })

  it('leaves the scroll position alone when the anchor is already visible', () => {
    useExplorerStore.setState({ viewMode: 'list' })
    const { container } = render(<FileView />)
    const root = rootOf(container)
    setViewport(root, { width: 500, height: 200 })

    act(() => {
      useExplorerStore.getState().selectOne('/p/f0.txt')
    })
    expect(root.scrollTop).toBe(0)
  })
})
