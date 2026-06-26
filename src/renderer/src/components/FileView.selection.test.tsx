import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FileView from './FileView'
import { useExplorerStore } from '@/store/explorerStore'
import { resetExplorerStore } from '@test/storeHelpers'
import { installApiMock, type ApiMock } from '@test/apiMock'
import { makeFileItem, makeFolder } from '@test/factories'

let api: ApiMock

const items = [
  makeFolder({ name: 'docs', path: '/p/docs' }),
  makeFileItem({ name: 'a.txt', path: '/p/a.txt' }),
  makeFileItem({ name: 'b.txt', path: '/p/b.txt' }),
  makeFileItem({ name: 'c.txt', path: '/p/c.txt' })
]

beforeEach(() => {
  resetExplorerStore()
  api = installApiMock()
  useExplorerStore.setState({ currentPath: '/p', loading: false, viewMode: 'list', items })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const row = (container: HTMLElement, path: string): HTMLElement =>
  container.querySelector(`[data-path="${path}"]`) as HTMLElement

describe('FileView — selection', () => {
  it('single click selects exactly one item', async () => {
    const user = userEvent.setup()
    const { container } = render(<FileView />)
    await user.click(row(container, '/p/a.txt'))
    const sel = useExplorerStore.getState().selection
    expect([...sel]).toEqual(['/p/a.txt'])
  })

  it('cmd/ctrl-click toggles the item in/out of the selection', async () => {
    const user = userEvent.setup()
    const { container } = render(<FileView />)
    await user.click(row(container, '/p/a.txt'))
    await user.keyboard('{Meta>}')
    await user.click(row(container, '/p/b.txt'))
    await user.keyboard('{/Meta}')
    expect([...useExplorerStore.getState().selection].sort()).toEqual(['/p/a.txt', '/p/b.txt'])

    // Toggle b back off.
    await user.keyboard('{Meta>}')
    await user.click(row(container, '/p/b.txt'))
    await user.keyboard('{/Meta}')
    expect([...useExplorerStore.getState().selection]).toEqual(['/p/a.txt'])
  })

  it('shift-click range-selects from the anchor', async () => {
    const user = userEvent.setup()
    const { container } = render(<FileView />)
    await user.click(row(container, '/p/docs'))
    await user.keyboard('{Shift>}')
    await user.click(row(container, '/p/b.txt'))
    await user.keyboard('{/Shift}')
    expect([...useExplorerStore.getState().selection].sort()).toEqual([
      '/p/a.txt',
      '/p/b.txt',
      '/p/docs'
    ])
  })

  it('begins inline rename after a slow second click on the sole-selected item', () => {
    vi.useFakeTimers()
    try {
      const { container } = render(<FileView />)
      // First click selects.
      fireEvent.click(row(container, '/p/a.txt'))
      expect([...useExplorerStore.getState().selection]).toEqual(['/p/a.txt'])
      // Second (slow) click on the same already-sole-selected item arms the rename timer.
      fireEvent.click(row(container, '/p/a.txt'))
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(useExplorerStore.getState().renamingPath).toBe('/p/a.txt')
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not begin rename if the selection changed before the timer fires', () => {
    vi.useFakeTimers()
    try {
      const { container } = render(<FileView />)
      fireEvent.click(row(container, '/p/a.txt'))
      fireEvent.click(row(container, '/p/a.txt')) // arm timer
      // Selection changes away before timeout.
      act(() => {
        useExplorerStore.getState().selectOne('/p/b.txt')
        vi.advanceTimersByTime(500)
      })
      expect(useExplorerStore.getState().renamingPath).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('double-click opens the item and clears any pending rename timer', () => {
    vi.useFakeTimers()
    const openItem = vi.spyOn(useExplorerStore.getState(), 'openItem').mockResolvedValue()
    try {
      const { container } = render(<FileView />)
      fireEvent.click(row(container, '/p/a.txt'))
      fireEvent.click(row(container, '/p/a.txt')) // arm rename timer
      fireEvent.doubleClick(row(container, '/p/a.txt'))
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(openItem).toHaveBeenCalledTimes(1)
      // Rename never began because the timer was cleared by the double-click.
      expect(useExplorerStore.getState().renamingPath).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('right-click selects the item (if not already selected) and opens the context menu', async () => {
    const user = userEvent.setup()
    const { container } = render(<FileView />)
    await user.pointer({ keys: '[MouseRight]', target: row(container, '/p/a.txt') })
    const st = useExplorerStore.getState()
    expect([...st.selection]).toEqual(['/p/a.txt'])
    expect(st.contextMenu?.targetPath).toBe('/p/a.txt')
  })

  it('right-click keeps an existing multi-selection that already includes the target', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({ selection: new Set(['/p/a.txt', '/p/b.txt']) })
    const { container } = render(<FileView />)
    await user.pointer({ keys: '[MouseRight]', target: row(container, '/p/a.txt') })
    expect([...useExplorerStore.getState().selection].sort()).toEqual(['/p/a.txt', '/p/b.txt'])
    expect(useExplorerStore.getState().contextMenu?.targetPath).toBe('/p/a.txt')
  })

  it('background right-click opens the empty-area context menu', () => {
    const { container } = render(<FileView />)
    const root = container.querySelector('.root') as HTMLElement
    fireEvent.contextMenu(root)
    expect(useExplorerStore.getState().contextMenu?.targetPath).toBeNull()
  })
})

describe('FileView — background mouse interactions (marquee + clear)', () => {
  it('a plain click on empty space clears the selection', () => {
    useExplorerStore.setState({ selection: new Set(['/p/a.txt']) })
    const { container } = render(<FileView />)
    const root = container.querySelector('.root') as HTMLElement
    fireEvent.mouseDown(root, { button: 0, clientX: 5, clientY: 5 })
    fireEvent.mouseUp(window)
    expect(useExplorerStore.getState().selection.size).toBe(0)
  })

  it('ignores non-left mouse buttons for marquee', () => {
    useExplorerStore.setState({ selection: new Set(['/p/a.txt']) })
    const { container } = render(<FileView />)
    const root = container.querySelector('.root') as HTMLElement
    fireEvent.mouseDown(root, { button: 2, clientX: 5, clientY: 5 })
    fireEvent.mouseUp(window)
    // Selection untouched (the down was ignored, no clearSelection on up).
    expect(useExplorerStore.getState().selection.size).toBe(1)
  })

  it('does not start a marquee when the press lands on an item row', () => {
    useExplorerStore.setState({ selection: new Set(['/p/a.txt']) })
    const { container } = render(<FileView />)
    fireEvent.mouseDown(row(container, '/p/a.txt'), { button: 0, clientX: 5, clientY: 5 })
    fireEvent.mouseUp(window)
    // No clearSelection happened (dragRef was never set).
    expect(useExplorerStore.getState().selection.size).toBe(1)
  })

  it('does not start a marquee when the press lands on a header button (details view)', () => {
    useExplorerStore.setState({ viewMode: 'details', selection: new Set(['/p/a.txt']) })
    const { container } = render(<FileView />)
    const headerBtn = container.querySelector('.headerRow button') as HTMLElement
    fireEvent.mouseDown(headerBtn, { button: 0, clientX: 5, clientY: 5 })
    fireEvent.mouseUp(window)
    // The press hit a <button>, so no marquee drag started and selection survives.
    expect(useExplorerStore.getState().selection.size).toBe(1)
  })

  it('does not start a marquee when the press lands on the rename input', () => {
    useExplorerStore.setState({ renamingPath: '/p/a.txt', selection: new Set(['/p/a.txt']) })
    const { container } = render(<FileView />)
    const input = container.querySelector('input.renameInput') as HTMLElement
    fireEvent.mouseDown(input, { button: 0, clientX: 5, clientY: 5 })
    fireEvent.mouseUp(window)
    expect(useExplorerStore.getState().selection.size).toBe(1)
  })

  it('dragging a marquee selects intersecting items and shows the marquee box', () => {
    useExplorerStore.setState({ viewMode: 'list' })
    const { container } = render(<FileView />)
    const root = container.querySelector('.root') as HTMLElement

    // Give the root + a row real geometry.
    root.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 500, height: 500, right: 500, bottom: 500 }) as DOMRect
    const aRow = row(container, '/p/a.txt')
    aRow.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 20, right: 200, bottom: 20 }) as DOMRect

    fireEvent.mouseDown(root, { button: 0, clientX: 1, clientY: 1 })
    fireEvent.mouseMove(window, { clientX: 150, clientY: 150 })
    // Marquee rendered.
    expect(container.querySelector('.marquee')).not.toBeNull()
    // a.txt's rect intersects the marquee box → selected.
    expect(useExplorerStore.getState().selection.has('/p/a.txt')).toBe(true)
    fireEvent.mouseUp(window)
    // Marquee cleared on mouse up.
    expect(container.querySelector('.marquee')).toBeNull()
  })

  it('skips a marquee-intersecting node that carries an empty data-path', () => {
    const { container } = render(<FileView />)
    const root = container.querySelector('.root') as HTMLElement
    root.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 500, height: 500, right: 500, bottom: 500 }) as DOMRect
    // Inject a node that matches [data-path] but resolves to an empty path; the
    // marquee scan must ignore it (the `if (p)` guard), never adding '' to the set.
    const ghost = document.createElement('div')
    ghost.setAttribute('data-path', '')
    ghost.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }) as DOMRect
    root.appendChild(ghost)

    fireEvent.mouseDown(root, { button: 0, clientX: 1, clientY: 1 })
    fireEvent.mouseMove(window, { clientX: 200, clientY: 200 })
    fireEvent.mouseUp(window)
    expect(useExplorerStore.getState().selection.has('')).toBe(false)
  })

  it('an additive marquee (cmd held) keeps the prior selection as a base and does not clear on plain click', () => {
    useExplorerStore.setState({ viewMode: 'list', selection: new Set(['/p/c.txt']) })
    const { container } = render(<FileView />)
    const root = container.querySelector('.root') as HTMLElement
    // Additive plain mousedown+up (no move) must NOT clear selection.
    fireEvent.mouseDown(root, { button: 0, clientX: 5, clientY: 5, metaKey: true })
    fireEvent.mouseUp(window)
    expect(useExplorerStore.getState().selection.has('/p/c.txt')).toBe(true)
  })

  it('a tiny sub-threshold mouse move does not start the marquee', () => {
    const { container } = render(<FileView />)
    const root = container.querySelector('.root') as HTMLElement
    root.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 500, height: 500, right: 500, bottom: 500 }) as DOMRect
    fireEvent.mouseDown(root, { button: 0, clientX: 1, clientY: 1 })
    fireEvent.mouseMove(window, { clientX: 2, clientY: 2 }) // < 4px hypotenuse
    expect(container.querySelector('.marquee')).toBeNull()
    fireEvent.mouseUp(window)
  })

  it('mouse move with no active drag is a no-op (defensive guard)', () => {
    render(<FileView />)
    // No mousedown first — the window listeners are not attached, so dispatching
    // a move must not throw and must not create a marquee.
    fireEvent.mouseMove(window, { clientX: 50, clientY: 50 })
    expect(document.querySelector('.marquee')).toBeNull()
  })
})

describe('FileView — inline rename', () => {
  it('commits on Enter via the store', async () => {
    api.rename.mockResolvedValue({ ok: true, data: makeFileItem({ path: '/p/renamed.txt' }) })
    useExplorerStore.setState({ renamingPath: '/p/a.txt' })
    const { container } = render(<FileView />)
    const input = container.querySelector('input.renameInput') as HTMLInputElement
    expect(input).not.toBeNull()
    fireEvent.change(input, { target: { value: 'renamed.txt' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await act(async () => {})
    expect(api.rename).toHaveBeenCalledWith('/p/a.txt', 'renamed.txt')
  })

  it('selects the basename (before the extension dot) on focus', () => {
    useExplorerStore.setState({ renamingPath: '/p/a.txt' })
    const { container } = render(<FileView />)
    const input = container.querySelector('input.renameInput') as HTMLInputElement
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe('a'.length) // up to the dot
  })

  it('selects the whole value for a dotfile / no-extension name', () => {
    useExplorerStore.setState({
      renamingPath: '/p/README',
      items: [...items, makeFileItem({ name: 'README', path: '/p/README', ext: '' })]
    })
    const { container } = render(<FileView />)
    const input = container.querySelector('input.renameInput') as HTMLInputElement
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe('README'.length)
  })

  it('commits on blur', async () => {
    api.rename.mockResolvedValue({ ok: true, data: makeFileItem({ path: '/p/x.txt' }) })
    useExplorerStore.setState({ renamingPath: '/p/a.txt' })
    const { container } = render(<FileView />)
    const input = container.querySelector('input.renameInput') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'x.txt' } })
    fireEvent.blur(input)
    await act(async () => {})
    expect(api.rename).toHaveBeenCalledWith('/p/a.txt', 'x.txt')
  })

  it('does not double-commit when Enter is followed by blur', async () => {
    // Keep the input mounted across both events by neutralising the store action
    // (so renamingPath stays set) — this exercises the `committed` guard directly.
    const commitSpy = vi
      .spyOn(useExplorerStore.getState(), 'commitRename')
      .mockResolvedValue()
    useExplorerStore.setState({ renamingPath: '/p/a.txt' })
    const { container } = render(<FileView />)
    const input = container.querySelector('input.renameInput') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'x.txt' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input) // second commit() short-circuits on the committed guard
    await act(async () => {})
    expect(commitSpy).toHaveBeenCalledTimes(1)
    expect(commitSpy).toHaveBeenCalledWith('x.txt')
  })

  it('cancels on Escape without renaming', () => {
    useExplorerStore.setState({ renamingPath: '/p/a.txt' })
    const cancelSpy = vi.spyOn(useExplorerStore.getState(), 'cancelRename')
    const { container } = render(<FileView />)
    const input = container.querySelector('input.renameInput') as HTMLInputElement
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(cancelSpy).toHaveBeenCalledTimes(1)
    expect(useExplorerStore.getState().renamingPath).toBeNull()
    expect(api.rename).not.toHaveBeenCalled()
  })

  it('stops click / dblclick / contextmenu from bubbling out of the input', () => {
    useExplorerStore.setState({ renamingPath: '/p/a.txt' })
    const { container } = render(<FileView />)
    const input = container.querySelector('input.renameInput') as HTMLInputElement
    // These handlers call stopPropagation; assert they don't trigger row/menu logic.
    fireEvent.click(input)
    fireEvent.doubleClick(input)
    fireEvent.contextMenu(input)
    expect(useExplorerStore.getState().contextMenu).toBeNull()
    // Still renaming (no selection/open side effects).
    expect(useExplorerStore.getState().renamingPath).toBe('/p/a.txt')
  })

  it('falls back to the initial name when the input value reads as nullish', async () => {
    // Defensive `?? initialName` path: force the input value getter to null.
    const commitSpy = vi
      .spyOn(useExplorerStore.getState(), 'commitRename')
      .mockResolvedValue()
    useExplorerStore.setState({ renamingPath: '/p/a.txt' })
    const { container } = render(<FileView />)
    const input = container.querySelector('input.renameInput') as HTMLInputElement
    Object.defineProperty(input, 'value', { configurable: true, get: () => null })
    fireEvent.blur(input)
    await act(async () => {})
    expect(commitSpy).toHaveBeenCalledWith('a.txt')
  })

  it('lets ordinary typing keys through (neither Enter nor Escape)', () => {
    useExplorerStore.setState({ renamingPath: '/p/a.txt' })
    const { container } = render(<FileView />)
    const input = container.querySelector('input.renameInput') as HTMLInputElement
    // A normal character key: no commit, no cancel, still renaming.
    fireEvent.keyDown(input, { key: 'z' })
    expect(useExplorerStore.getState().renamingPath).toBe('/p/a.txt')
    expect(api.rename).not.toHaveBeenCalled()
  })

  it('renders the renaming row as non-draggable', () => {
    useExplorerStore.setState({ renamingPath: '/p/a.txt' })
    const { container } = render(<FileView />)
    expect(row(container, '/p/a.txt').getAttribute('draggable')).toBe('false')
  })
})
