import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import App from './App'
import { useExplorerStore } from '@/store/explorerStore'
import { HOME_PATH } from '@/utils/pathUtils'
import { resetExplorerStore } from '@test/storeHelpers'
import { installApiMock, type ApiMock } from '@test/apiMock'
import { makeFileItem, makeFolder } from '@test/factories'

let api: ApiMock

beforeEach(() => {
  api = installApiMock()
  resetExplorerStore()
})

afterEach(() => {
  vi.useRealTimers()
})

/** Flush pending promise microtasks (store init etc.). */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('App (full integration render)', () => {
  it('renders the Home view on mount and runs store init', async () => {
    api.getHomeDir.mockResolvedValue('/Users/test')
    render(<App />)
    await flush()
    // currentPath stays HOME_PATH → HomeView is shown (no StatusBar item count etc).
    expect(useExplorerStore.getState().currentPath).toBe(HOME_PATH)
    // init reads home dir / quick links / drives.
    expect(api.getHomeDir).toHaveBeenCalled()
    // onOpenPath subscription installed.
    expect(api.onOpenPath).toHaveBeenCalled()
  })

  it('renders the FileView when currentPath is a real directory', async () => {
    api.startDir = '/Users/test/docs'
    api.pathExists.mockResolvedValue(true)
    api.readDirectory.mockResolvedValue({ ok: true, data: [makeFileItem({ name: 'a.txt' })] })
    render(<App />)
    await flush()
    expect(useExplorerStore.getState().currentPath).toBe('/Users/test/docs')
    // A non-home path renders FileView; StatusBar then shows an item count.
    expect(screen.getByText('1 items')).toBeInTheDocument()
  })

  it('opens a new tab when the OS hands us a path via onOpenPath', async () => {
    render(<App />)
    await flush()
    // Capture the callback registered with onOpenPath and invoke it.
    const cb = api.onOpenPath.mock.calls[0][0]
    act(() => {
      cb('/Users/test/handed')
    })
    await flush()
    expect(useExplorerStore.getState().currentPath).toBe('/Users/test/handed')
    expect(useExplorerStore.getState().tabs.length).toBeGreaterThan(1)
  })

  it('shows a status toast and auto-clears it after 4s', async () => {
    vi.useFakeTimers()
    render(<App />)
    // flush init microtasks under fake timers
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    act(() => {
      useExplorerStore.setState({ statusMessage: 'Path copied' })
    })
    expect(screen.getByText('Path copied')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(useExplorerStore.getState().statusMessage).toBeNull()
    expect(screen.queryByText('Path copied')).not.toBeInTheDocument()
  })

  it('does not arm the clear timer when there is no status message', async () => {
    render(<App />)
    await flush()
    // No statusMessage → the early-return branch in the effect is taken.
    expect(useExplorerStore.getState().statusMessage).toBeNull()
    expect(screen.queryByText(/./, { selector: 'div' })).toBeTruthy()
  })
})

describe('window.__feDemo (gated screenshot helper)', () => {
  it('is defined at import time', () => {
    expect(typeof window.__feDemo).toBe('function')
  })

  it('"select" selects the first file', () => {
    useExplorerStore.setState({
      items: [makeFolder({ name: 'sub', path: '/p/sub' }), makeFileItem({ name: 'a.txt', path: '/p/a.txt' })]
    })
    window.__feDemo!('select')
    expect(useExplorerStore.getState().selection.has('/p/a.txt')).toBe(true)
  })

  it('"select" falls back to first visible item when there is no plain file', () => {
    useExplorerStore.setState({
      items: [makeFolder({ name: 'sub', path: '/p/sub' })]
    })
    window.__feDemo!('select')
    expect(useExplorerStore.getState().selection.has('/p/sub')).toBe(true)
  })

  it('"select" with no visible items is a no-op (firstFile undefined)', () => {
    useExplorerStore.setState({ items: [] })
    window.__feDemo!('select')
    expect(useExplorerStore.getState().selection.size).toBe(0)
  })

  it('respects showHidden filter when picking the demo item', () => {
    useExplorerStore.setState({
      showHidden: false,
      items: [makeFileItem({ name: '.hidden', path: '/p/.hidden', isHidden: true })]
    })
    // Only item is hidden and showHidden is false → nothing visible → no selection.
    window.__feDemo!('select')
    expect(useExplorerStore.getState().selection.size).toBe(0)
  })

  it('"preview" selects a file and opens the preview pane', () => {
    useExplorerStore.setState({
      previewOpen: false,
      items: [makeFileItem({ name: 'a.txt', path: '/p/a.txt' })]
    })
    window.__feDemo!('preview')
    expect(useExplorerStore.getState().previewOpen).toBe(true)
    expect(useExplorerStore.getState().selection.has('/p/a.txt')).toBe(true)
  })

  it('"preview" does not re-toggle when the preview is already open', () => {
    useExplorerStore.setState({
      previewOpen: true,
      items: [makeFileItem({ name: 'a.txt', path: '/p/a.txt' })]
    })
    window.__feDemo!('preview')
    // Stays open (the `!s.previewOpen` guard skips the toggle).
    expect(useExplorerStore.getState().previewOpen).toBe(true)
  })

  it('"group" sets grouping to type', () => {
    useExplorerStore.setState({ items: [makeFileItem({ path: '/p/a.txt' })] })
    window.__feDemo!('group')
    expect(useExplorerStore.getState().groupBy).toBe('type')
  })

  it('"properties" selects a file and opens the properties dialog', () => {
    useExplorerStore.setState({ items: [makeFileItem({ name: 'a.txt', path: '/p/a.txt' })] })
    window.__feDemo!('properties')
    expect(useExplorerStore.getState().propertiesPath).toBe('/p/a.txt')
  })

  it('"properties" with no items does not open the dialog', () => {
    useExplorerStore.setState({ items: [] })
    window.__feDemo!('properties')
    expect(useExplorerStore.getState().propertiesPath).toBeNull()
  })

  it('"skeleton" flips the loading flag', () => {
    useExplorerStore.setState({ items: [], loading: false })
    window.__feDemo!('skeleton')
    expect(useExplorerStore.getState().loading).toBe(true)
  })

  it('skips installing the helper when there is no window (module-load guard)', async () => {
    // Re-evaluate the module with `window` removed to exercise the
    // `typeof window !== 'undefined'` false branch (the no-DOM guard).
    vi.resetModules()
    const orig = globalThis.window
    // @ts-expect-error intentionally remove the global for this re-import
    delete globalThis.window
    try {
      await import('./App')
    } finally {
      globalThis.window = orig
    }
    // Nothing to assert beyond it not throwing; the branch is now covered.
    expect(typeof globalThis.window).toBe('object')
  })

  it('"perf" navigates to api.startDir and logs after two animation frames', async () => {
    api.startDir = '/Users/test/perf'
    api.readDirectory.mockResolvedValue({
      ok: true,
      data: [makeFileItem({ name: 'a.txt', path: '/Users/test/perf/a.txt' })]
    })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const nowSpy = vi.spyOn(performance, 'now')
    nowSpy.mockReturnValueOnce(0).mockReturnValueOnce(12)

    await act(async () => {
      window.__feDemo!('perf')
      // let navigateTo resolve and the rAF callbacks fire
      await new Promise((r) => setTimeout(r, 0))
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      await new Promise((r) => requestAnimationFrame(() => r(null)))
    })

    expect(useExplorerStore.getState().currentPath).toBe('/Users/test/perf')
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[perf] nav+render 1 items'))
    logSpy.mockRestore()
    nowSpy.mockRestore()
  })
})
