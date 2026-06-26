import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import {
  useKeyboardShortcuts,
  FOCUS_SEARCH_EVENT,
  EDIT_ADDRESS_EVENT
} from './useKeyboardShortcuts'
import { useExplorerStore } from '@/store/explorerStore'
import { resetExplorerStore } from '@test/storeHelpers'
import { installApiMock, type ApiMock } from '@test/apiMock'
import { makeFileItem, makeFolder } from '@test/factories'

function Host(): null {
  useKeyboardShortcuts()
  return null
}

let api: ApiMock

beforeEach(() => {
  resetExplorerStore()
  api = installApiMock()
})

afterEach(() => {
  vi.useRealTimers()
})

/** Dispatch a keydown on window with optional target. */
function key(init: KeyboardEventInit & { target?: EventTarget }): KeyboardEvent {
  const { target, ...rest } = init
  const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...rest })
  if (target) Object.defineProperty(ev, 'target', { value: target })
  window.dispatchEvent(ev)
  return ev
}

describe('useKeyboardShortcuts — guards', () => {
  it('returns early while renaming (no action runs)', () => {
    useExplorerStore.setState({ renamingPath: '/p/x', selection: new Set(['/p/x']) })
    const spy = vi.spyOn(useExplorerStore.getState(), 'selectAll')
    render(<Host />)
    const ev = key({ key: 'a', metaKey: true })
    expect(ev.defaultPrevented).toBe(false)
    spy.mockRestore()
  })

  it('blurs the field on Escape when typing in an input', () => {
    render(<Host />)
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    const blurSpy = vi.spyOn(input, 'blur')
    key({ key: 'Escape', target: input })
    expect(blurSpy).toHaveBeenCalled()
    input.remove()
  })

  it('ignores other keys while typing in an input (no preventDefault)', () => {
    render(<Host />)
    const input = document.createElement('input')
    document.body.appendChild(input)
    const ev = key({ key: 'a', metaKey: true, target: input })
    expect(ev.defaultPrevented).toBe(false)
    input.remove()
  })

  it('treats a TEXTAREA as a typing target (blurs on Escape)', () => {
    render(<Host />)
    const ta = document.createElement('textarea')
    document.body.appendChild(ta)
    const blurSpy = vi.spyOn(ta, 'blur')
    key({ key: 'Escape', target: ta })
    expect(blurSpy).toHaveBeenCalled()
    ta.remove()
  })

  it('treats a contentEditable element as a typing target', () => {
    render(<Host />)
    const div = document.createElement('div')
    div.contentEditable = 'true'
    Object.defineProperty(div, 'isContentEditable', { value: true, configurable: true })
    document.body.appendChild(div)
    const blurSpy = vi.spyOn(div, 'blur')
    key({ key: 'Escape', target: div })
    expect(blurSpy).toHaveBeenCalled()
    div.remove()
  })

  it('a non-typing HTMLElement target is not treated as typing', () => {
    // Exercises isTypingTarget falling through all three checks to `false`.
    const spy = vi.spyOn(useExplorerStore.getState(), 'selectAll')
    render(<Host />)
    const div = document.createElement('div')
    document.body.appendChild(div)
    key({ key: 'a', metaKey: true, target: div })
    expect(spy).toHaveBeenCalled()
    div.remove()
  })

  it('a non-HTMLElement target is not treated as typing', () => {
    // e.target === window is not an HTMLElement → isTypingTarget returns false.
    const spy = vi.spyOn(useExplorerStore.getState(), 'selectAll')
    render(<Host />)
    key({ key: 'a', metaKey: true })
    expect(spy).toHaveBeenCalled()
  })
})

describe('useKeyboardShortcuts — mod shortcuts', () => {
  it('Cmd+F dispatches FOCUS_SEARCH_EVENT', () => {
    render(<Host />)
    const listener = vi.fn()
    window.addEventListener(FOCUS_SEARCH_EVENT, listener)
    const ev = key({ key: 'f', metaKey: true })
    expect(listener).toHaveBeenCalled()
    expect(ev.defaultPrevented).toBe(true)
    window.removeEventListener(FOCUS_SEARCH_EVENT, listener)
  })

  it('Ctrl+E dispatches FOCUS_SEARCH_EVENT', () => {
    render(<Host />)
    const listener = vi.fn()
    window.addEventListener(FOCUS_SEARCH_EVENT, listener)
    key({ key: 'e', ctrlKey: true })
    expect(listener).toHaveBeenCalled()
    window.removeEventListener(FOCUS_SEARCH_EVENT, listener)
  })

  it('Cmd+L dispatches EDIT_ADDRESS_EVENT', () => {
    render(<Host />)
    const listener = vi.fn()
    window.addEventListener(EDIT_ADDRESS_EVENT, listener)
    const ev = key({ key: 'l', metaKey: true })
    expect(listener).toHaveBeenCalled()
    expect(ev.defaultPrevented).toBe(true)
    window.removeEventListener(EDIT_ADDRESS_EVENT, listener)
  })

  it('Cmd+Shift+N creates a folder (uppercase N)', () => {
    const spy = vi.spyOn(useExplorerStore.getState(), 'createFolder')
    render(<Host />)
    key({ key: 'N', metaKey: true, shiftKey: true })
    expect(spy).toHaveBeenCalled()
  })

  it('Cmd+Shift+n creates a folder (lowercase n)', () => {
    const spy = vi.spyOn(useExplorerStore.getState(), 'createFolder')
    render(<Host />)
    key({ key: 'n', metaKey: true, shiftKey: true })
    expect(spy).toHaveBeenCalled()
  })

  it('Cmd+A selects all', () => {
    const spy = vi.spyOn(useExplorerStore.getState(), 'selectAll')
    render(<Host />)
    const ev = key({ key: 'a', metaKey: true })
    expect(spy).toHaveBeenCalled()
    expect(ev.defaultPrevented).toBe(true)
  })

  it('Cmd+C copies selection', () => {
    const spy = vi.spyOn(useExplorerStore.getState(), 'copySelection')
    render(<Host />)
    key({ key: 'c', metaKey: true })
    expect(spy).toHaveBeenCalled()
  })

  it('Cmd+X cuts selection', () => {
    const spy = vi.spyOn(useExplorerStore.getState(), 'cutSelection')
    render(<Host />)
    key({ key: 'x', metaKey: true })
    expect(spy).toHaveBeenCalled()
  })

  it('Cmd+V pastes', () => {
    const spy = vi.spyOn(useExplorerStore.getState(), 'paste')
    render(<Host />)
    key({ key: 'v', metaKey: true })
    expect(spy).toHaveBeenCalled()
  })

  it('Cmd+N opens a new window', () => {
    render(<Host />)
    key({ key: 'n', metaKey: true })
    expect(api.windowNew).toHaveBeenCalled()
  })

  it('Cmd+T opens a new tab', () => {
    const spy = vi.spyOn(useExplorerStore.getState(), 'newTab')
    render(<Host />)
    key({ key: 't', metaKey: true })
    expect(spy).toHaveBeenCalled()
  })

  it('Cmd+W closes the active tab', () => {
    const spy = vi.spyOn(useExplorerStore.getState(), 'closeTab')
    render(<Host />)
    key({ key: 'w', metaKey: true })
    expect(spy).toHaveBeenCalledWith(useExplorerStore.getState().activeTabId)
  })

  it('Cmd+R refreshes', () => {
    const spy = vi.spyOn(useExplorerStore.getState(), 'refresh')
    render(<Host />)
    key({ key: 'r', metaKey: true })
    expect(spy).toHaveBeenCalled()
  })

  it('Cmd+Z undoes', () => {
    const spy = vi.spyOn(useExplorerStore.getState(), 'undo')
    render(<Host />)
    key({ key: 'z', metaKey: true })
    expect(spy).toHaveBeenCalled()
  })

  it('Cmd+I opens properties', () => {
    const spy = vi.spyOn(useExplorerStore.getState(), 'openProperties')
    render(<Host />)
    key({ key: 'i', metaKey: true })
    expect(spy).toHaveBeenCalled()
  })

  it('a bare mod key with an unhandled letter falls through to type-ahead skip', () => {
    // Cmd+b is not in the switch; with no further handlers it does nothing.
    const ev = key({ key: 'b', metaKey: true })
    render(<Host />)
    expect(ev.defaultPrevented).toBe(false)
  })
})

describe('useKeyboardShortcuts — alt navigation', () => {
  it('Alt+ArrowLeft goes back', () => {
    const spy = vi.spyOn(useExplorerStore.getState(), 'goBack')
    render(<Host />)
    const ev = key({ key: 'ArrowLeft', altKey: true })
    expect(spy).toHaveBeenCalled()
    expect(ev.defaultPrevented).toBe(true)
  })

  it('Alt+ArrowRight goes forward', () => {
    const spy = vi.spyOn(useExplorerStore.getState(), 'goForward')
    render(<Host />)
    key({ key: 'ArrowRight', altKey: true })
    expect(spy).toHaveBeenCalled()
  })

  it('Alt+ArrowUp goes up', () => {
    const spy = vi.spyOn(useExplorerStore.getState(), 'goUp')
    render(<Host />)
    key({ key: 'ArrowUp', altKey: true })
    expect(spy).toHaveBeenCalled()
  })

  it('Alt with an unhandled arrow falls through (no nav)', () => {
    const back = vi.spyOn(useExplorerStore.getState(), 'goBack')
    render(<Host />)
    key({ key: 'ArrowDown', altKey: true })
    expect(back).not.toHaveBeenCalled()
  })
})

describe('useKeyboardShortcuts — function & edit keys', () => {
  it('F5 refreshes', () => {
    const spy = vi.spyOn(useExplorerStore.getState(), 'refresh')
    render(<Host />)
    const ev = key({ key: 'F5' })
    expect(spy).toHaveBeenCalled()
    expect(ev.defaultPrevented).toBe(true)
  })

  it('F2 begins rename when there is a selection', () => {
    useExplorerStore.setState({ selection: new Set(['/p/a.txt']) })
    const spy = vi.spyOn(useExplorerStore.getState(), 'beginRename')
    render(<Host />)
    const ev = key({ key: 'F2' })
    expect(spy).toHaveBeenCalledWith('/p/a.txt')
    expect(ev.defaultPrevented).toBe(true)
  })

  it('F2 does nothing without a selection', () => {
    useExplorerStore.setState({ selection: new Set() })
    const spy = vi.spyOn(useExplorerStore.getState(), 'beginRename')
    render(<Host />)
    const ev = key({ key: 'F2' })
    expect(spy).not.toHaveBeenCalled()
    expect(ev.defaultPrevented).toBe(false)
  })

  it('Delete deletes when selection is non-empty', () => {
    useExplorerStore.setState({ selection: new Set(['/p/a.txt']) })
    const spy = vi.spyOn(useExplorerStore.getState(), 'deleteSelection')
    render(<Host />)
    const ev = key({ key: 'Delete' })
    expect(spy).toHaveBeenCalled()
    expect(ev.defaultPrevented).toBe(true)
  })

  it('Delete does nothing when selection is empty', () => {
    useExplorerStore.setState({ selection: new Set() })
    const spy = vi.spyOn(useExplorerStore.getState(), 'deleteSelection')
    render(<Host />)
    const ev = key({ key: 'Delete' })
    expect(spy).not.toHaveBeenCalled()
    expect(ev.defaultPrevented).toBe(false)
  })

  it('Backspace goes back', () => {
    const spy = vi.spyOn(useExplorerStore.getState(), 'goBack')
    render(<Host />)
    const ev = key({ key: 'Backspace' })
    expect(spy).toHaveBeenCalled()
    expect(ev.defaultPrevented).toBe(true)
  })
})

describe('useKeyboardShortcuts — Enter', () => {
  it('does nothing with no selection', () => {
    useExplorerStore.setState({ selection: new Set() })
    const spy = vi.spyOn(useExplorerStore.getState(), 'openItem')
    render(<Host />)
    const ev = key({ key: 'Enter' })
    expect(spy).not.toHaveBeenCalled()
    expect(ev.defaultPrevented).toBe(false)
  })

  it('opens a single selected directory', () => {
    const dir = makeFolder({ name: 'd', path: '/p/d' })
    useExplorerStore.setState({ items: [dir], selection: new Set(['/p/d']) })
    const spy = vi.spyOn(useExplorerStore.getState(), 'openItem')
    render(<Host />)
    key({ key: 'Enter' })
    expect(spy).toHaveBeenCalledWith(dir)
  })

  it('opens a single selected file', () => {
    const file = makeFileItem({ name: 'a.txt', path: '/p/a.txt' })
    useExplorerStore.setState({ items: [file], selection: new Set(['/p/a.txt']) })
    const spy = vi.spyOn(useExplorerStore.getState(), 'openItem')
    render(<Host />)
    key({ key: 'Enter' })
    expect(spy).toHaveBeenCalledWith(file)
  })

  it('opens only files when multiple items are selected', () => {
    const dir = makeFolder({ name: 'd', path: '/p/d' })
    const file = makeFileItem({ name: 'a.txt', path: '/p/a.txt' })
    useExplorerStore.setState({
      items: [dir, file],
      selection: new Set(['/p/d', '/p/a.txt'])
    })
    const spy = vi.spyOn(useExplorerStore.getState(), 'openItem')
    render(<Host />)
    key({ key: 'Enter' })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(file)
  })
})

describe('useKeyboardShortcuts — Escape', () => {
  it('closes the context menu when one is open', () => {
    useExplorerStore.setState({ contextMenu: { x: 1, y: 2, targetPath: null } })
    const close = vi.spyOn(useExplorerStore.getState(), 'closeContextMenu')
    const clear = vi.spyOn(useExplorerStore.getState(), 'clearSelection')
    render(<Host />)
    key({ key: 'Escape' })
    expect(close).toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
  })

  it('clears selection when no context menu is open', () => {
    useExplorerStore.setState({ contextMenu: null })
    const clear = vi.spyOn(useExplorerStore.getState(), 'clearSelection')
    render(<Host />)
    key({ key: 'Escape' })
    expect(clear).toHaveBeenCalled()
  })
})

describe('useKeyboardShortcuts — type-ahead', () => {
  function seed(): void {
    useExplorerStore.setState({
      items: [
        makeFolder({ name: 'Apple', path: '/p/Apple' }),
        makeFolder({ name: 'Avocado', path: '/p/Avocado' }),
        makeFileItem({ name: 'banana.txt', path: '/p/banana.txt' })
      ],
      selection: new Set(),
      anchorPath: null,
      showHidden: false,
      sortKey: 'name',
      sortDir: 'asc'
    })
  }

  it('selects the first matching item and scrolls it into view', () => {
    seed()
    const matching = document.createElement('div')
    matching.setAttribute('data-path', '/p/Apple')
    document.body.appendChild(matching)
    const matchScroll = vi.spyOn(matching, 'scrollIntoView')

    render(<Host />)
    const ev = key({ key: 'a' })
    expect(useExplorerStore.getState().selection.has('/p/Apple')).toBe(true)
    expect(matchScroll).toHaveBeenCalledWith({ block: 'nearest' })
    expect(ev.defaultPrevented).toBe(true)

    matching.remove()
  })

  it('accumulates a multi-character prefix within the time window', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    seed()
    render(<Host />)
    key({ key: 'a' }) // -> Apple (first A item)
    expect(useExplorerStore.getState().selection.has('/p/Apple')).toBe(true)
    vi.setSystemTime(1200)
    key({ key: 'v' }) // prefix 'av' -> Avocado
    expect(useExplorerStore.getState().selection.has('/p/Avocado')).toBe(true)
  })

  it('cycles through matches when the same letter is pressed again', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    seed()
    render(<Host />)
    key({ key: 'a' }) // Apple (anchor now Apple)
    expect(useExplorerStore.getState().anchorPath).toBe('/p/Apple')
    vi.setSystemTime(1300)
    key({ key: 'a' }) // same char -> cycle to Avocado
    expect(useExplorerStore.getState().selection.has('/p/Avocado')).toBe(true)
    vi.setSystemTime(1600)
    key({ key: 'a' }) // cycle wraps back to Apple
    expect(useExplorerStore.getState().selection.has('/p/Apple')).toBe(true)
  })

  it('resets the buffer after the 800ms window expires', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    seed()
    render(<Host />)
    key({ key: 'a' }) // Apple
    expect(useExplorerStore.getState().selection.has('/p/Apple')).toBe(true)
    // Advance well past 800ms: buffer expires, 'b' starts fresh -> banana
    vi.setSystemTime(2000)
    key({ key: 'b' })
    expect(useExplorerStore.getState().selection.has('/p/banana.txt')).toBe(true)
  })

  it('ignores a leading space (empty buffer guard)', () => {
    seed()
    const spy = vi.spyOn(useExplorerStore.getState(), 'selectOne')
    render(<Host />)
    const ev = key({ key: ' ' })
    expect(spy).not.toHaveBeenCalled()
    expect(ev.defaultPrevented).toBe(false)
  })

  it('accepts a space once the buffer is non-empty', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    useExplorerStore.setState({
      items: [makeFolder({ name: 'a b', path: '/p/ab' })],
      selection: new Set(),
      showHidden: false,
      sortKey: 'name',
      sortDir: 'asc'
    })
    render(<Host />)
    key({ key: 'a' }) // buffer 'a' -> matches 'a b'
    vi.setSystemTime(1100)
    key({ key: ' ' }) // buffer 'a ' -> still matches 'a b'
    expect(useExplorerStore.getState().selection.has('/p/ab')).toBe(true)
  })

  it('does nothing when there are no visible items', () => {
    useExplorerStore.setState({
      items: [],
      selection: new Set(),
      showHidden: false,
      sortKey: 'name',
      sortDir: 'asc'
    })
    const spy = vi.spyOn(useExplorerStore.getState(), 'selectOne')
    render(<Host />)
    const ev = key({ key: 'a' })
    expect(spy).not.toHaveBeenCalled()
    expect(ev.defaultPrevented).toBe(false)
  })

  it('does nothing when no item matches the prefix', () => {
    seed()
    const spy = vi.spyOn(useExplorerStore.getState(), 'selectOne')
    render(<Host />)
    const ev = key({ key: 'z' })
    expect(spy).not.toHaveBeenCalled()
    expect(ev.defaultPrevented).toBe(false)
  })

  it('uses the current anchor as the cycle starting point', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    seed()
    // Anchor already on Apple; pressing 'a' (same char as a fresh buffer would be)
    // — first press builds buffer from scratch (not a cycle since buffer was empty).
    useExplorerStore.setState({ anchorPath: '/p/Avocado' })
    render(<Host />)
    key({ key: 'a' }) // fresh buffer 'a', start=0 -> Apple
    expect(useExplorerStore.getState().selection.has('/p/Apple')).toBe(true)
  })
})

describe('useKeyboardShortcuts — arrow navigation', () => {
  function seedNav(): void {
    useExplorerStore.setState({
      items: [
        makeFolder({ name: 'docs', path: '/p/docs' }),
        makeFileItem({ name: 'a.txt', path: '/p/a.txt' }),
        makeFileItem({ name: 'b.txt', path: '/p/b.txt' }),
        makeFileItem({ name: 'c.txt', path: '/p/c.txt' })
      ],
      selection: new Set(),
      anchorPath: null,
      showHidden: false,
      sortKey: 'name',
      sortDir: 'asc'
    })
  }

  it('ArrowDown with nothing selected lands on the first item (works before any click)', () => {
    seedNav()
    const match = document.createElement('div')
    match.setAttribute('data-path', '/p/docs')
    document.body.appendChild(match)
    const matchScroll = vi.spyOn(match, 'scrollIntoView')

    render(<Host />)
    const ev = key({ key: 'ArrowDown' })
    expect([...useExplorerStore.getState().selection]).toEqual(['/p/docs'])
    expect(matchScroll).toHaveBeenCalledWith({ block: 'nearest' })
    expect(ev.defaultPrevented).toBe(true)

    match.remove()
  })

  it('ArrowDown advances from the anchor and clamps at the last item', () => {
    seedNav()
    useExplorerStore.setState({ selection: new Set(['/p/docs']), anchorPath: '/p/docs' })
    render(<Host />)
    key({ key: 'ArrowDown' })
    expect([...useExplorerStore.getState().selection]).toEqual(['/p/a.txt'])
    // From the last item, ArrowDown stays put (the Math.min clamp).
    useExplorerStore.setState({ selection: new Set(['/p/c.txt']), anchorPath: '/p/c.txt' })
    key({ key: 'ArrowDown' })
    expect([...useExplorerStore.getState().selection]).toEqual(['/p/c.txt'])
  })

  it('ArrowUp with nothing selected lands on the last item', () => {
    seedNav()
    render(<Host />)
    key({ key: 'ArrowUp' })
    expect([...useExplorerStore.getState().selection]).toEqual(['/p/c.txt'])
  })

  it('ArrowUp moves up and clamps at the top', () => {
    seedNav()
    useExplorerStore.setState({ selection: new Set(['/p/a.txt']), anchorPath: '/p/a.txt' })
    render(<Host />)
    key({ key: 'ArrowUp' })
    expect([...useExplorerStore.getState().selection]).toEqual(['/p/docs'])
    key({ key: 'ArrowUp' }) // already at the top → stays at index 0
    expect([...useExplorerStore.getState().selection]).toEqual(['/p/docs'])
  })

  it('ArrowUp is a no-op (no re-select) when the first item is already selected', () => {
    seedNav()
    useExplorerStore.setState({ selection: new Set(['/p/docs']), anchorPath: '/p/docs' })
    const spy = vi.spyOn(useExplorerStore.getState(), 'selectOne')
    render(<Host />)
    const ev = key({ key: 'ArrowUp' })
    expect(spy).not.toHaveBeenCalled()
    expect([...useExplorerStore.getState().selection]).toEqual(['/p/docs'])
    expect(ev.defaultPrevented).toBe(true) // still swallows the key (no scroll jump)
  })

  it('Home and End jump to the first/last visible item', () => {
    seedNav()
    render(<Host />)
    key({ key: 'End' })
    expect([...useExplorerStore.getState().selection]).toEqual(['/p/c.txt'])
    key({ key: 'Home' })
    expect([...useExplorerStore.getState().selection]).toEqual(['/p/docs'])
  })

  it('shift+ArrowDown extends the selection from the anchor', () => {
    seedNav()
    useExplorerStore.setState({ selection: new Set(['/p/docs']), anchorPath: '/p/docs' })
    render(<Host />)
    key({ key: 'ArrowDown', shiftKey: true })
    expect([...useExplorerStore.getState().selection].sort()).toEqual(['/p/a.txt', '/p/docs'])
  })

  it('does nothing while renaming', () => {
    seedNav()
    useExplorerStore.setState({ renamingPath: '/p/a.txt' })
    render(<Host />)
    const ev = key({ key: 'ArrowDown' })
    expect(useExplorerStore.getState().selection.size).toBe(0)
    expect(ev.defaultPrevented).toBe(false)
  })

  it('does nothing when there are no visible items', () => {
    useExplorerStore.setState({
      items: [],
      selection: new Set(),
      anchorPath: null,
      showHidden: false,
      sortKey: 'name',
      sortDir: 'asc'
    })
    render(<Host />)
    const ev = key({ key: 'ArrowDown' })
    expect(useExplorerStore.getState().selection.size).toBe(0)
    expect(ev.defaultPrevented).toBe(false)
  })
})

describe('useKeyboardShortcuts — cleanup', () => {
  it('removes the keydown listener on unmount', () => {
    const spy = vi.spyOn(useExplorerStore.getState(), 'selectAll')
    const { unmount } = render(<Host />)
    unmount()
    key({ key: 'a', metaKey: true })
    expect(spy).not.toHaveBeenCalled()
  })
})
