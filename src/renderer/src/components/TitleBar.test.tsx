import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TitleBar from './TitleBar'
import { useExplorerStore } from '@/store/explorerStore'
import { HOME_PATH } from '@/utils/pathUtils'
import { resetExplorerStore } from '@test/storeHelpers'
import { installApiMock, type ApiMock } from '@test/apiMock'

let api: ApiMock

beforeEach(() => {
  resetExplorerStore()
  api = installApiMock()
})

/** Seed the store with a deterministic set of tabs. */
function seedTabs(): void {
  useExplorerStore.setState({
    tabs: [
      { id: 't1', history: ['/Users/test/docs'], index: 0 },
      { id: 't2', history: ['/Users/test/pics'], index: 0 }
    ],
    activeTabId: 't1',
    homeDir: '/Users/test'
  })
}

describe('TitleBar — window controls', () => {
  it('minimizes the window', async () => {
    const user = userEvent.setup()
    render(<TitleBar />)
    await user.click(screen.getByRole('button', { name: 'Minimize' }))
    expect(api.windowMinimize).toHaveBeenCalledTimes(1)
  })

  it('toggles maximize from the maximize button', async () => {
    const user = userEvent.setup()
    render(<TitleBar />)
    await user.click(screen.getByRole('button', { name: 'Maximize' }))
    expect(api.windowToggleMaximize).toHaveBeenCalledTimes(1)
  })

  it('closes the window', async () => {
    const user = userEvent.setup()
    render(<TitleBar />)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(api.windowClose).toHaveBeenCalledTimes(1)
  })
})

describe('TitleBar — maximize state subscription', () => {
  it('subscribes on mount and unsubscribes on unmount', () => {
    const off = vi.fn()
    api.onMaximizeChange.mockReturnValue(off)
    const { unmount } = render(<TitleBar />)
    expect(api.onMaximizeChange).toHaveBeenCalledTimes(1)
    expect(off).not.toHaveBeenCalled()
    unmount()
    expect(off).toHaveBeenCalledTimes(1)
  })

  it('reflects the maximized state by swapping the button to Restore and back', () => {
    let cb: (m: boolean) => void = () => {}
    api.onMaximizeChange.mockImplementation((fn) => {
      cb = fn
      return () => {}
    })
    render(<TitleBar />)

    // Initial state: not maximized → "Maximize".
    expect(screen.getByRole('button', { name: 'Maximize' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull()

    // Window becomes maximized → button now offers "Restore".
    act(() => cb(true))
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Maximize' })).toBeNull()

    // Back to normal → "Maximize" again.
    act(() => cb(false))
    expect(screen.getByRole('button', { name: 'Maximize' })).toBeInTheDocument()
  })
})

describe('TitleBar — tab strip', () => {
  it('renders one tab per store tab with the active one selected', () => {
    seedTabs()
    render(<TitleBar />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(screen.getByText('docs')).toBeInTheDocument()
    expect(screen.getByText('pics')).toBeInTheDocument()

    const docsTab = screen.getByText('docs').closest('[role="tab"]')!
    const picsTab = screen.getByText('pics').closest('[role="tab"]')!
    expect(docsTab).toHaveAttribute('aria-selected', 'true')
    expect(picsTab).toHaveAttribute('aria-selected', 'false')
  })

  it('shows the Home label for a home:// tab path', () => {
    useExplorerStore.setState({
      tabs: [{ id: 't1', history: [HOME_PATH], index: 0 }],
      activeTabId: 't1'
    })
    render(<TitleBar />)
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('activates a background tab on click', async () => {
    const user = userEvent.setup()
    seedTabs()
    render(<TitleBar />)
    await user.click(screen.getByText('pics'))
    expect(useExplorerStore.getState().activeTabId).toBe('t2')
  })

  it('shows close buttons only when more than one tab is open', () => {
    seedTabs()
    const { rerender } = render(<TitleBar />)
    expect(screen.getAllByRole('button', { name: 'Close tab' })).toHaveLength(2)

    // Down to a single tab → no per-tab close button.
    useExplorerStore.setState({
      tabs: [{ id: 't1', history: ['/Users/test/docs'], index: 0 }],
      activeTabId: 't1'
    })
    rerender(<TitleBar />)
    expect(screen.queryByRole('button', { name: 'Close tab' })).toBeNull()
  })

  it('closes a tab from its close button without activating it', async () => {
    const user = userEvent.setup()
    seedTabs()
    render(<TitleBar />)

    const picsTab = screen.getByText('pics').closest('[role="tab"]')!
    const closeBtn = picsTab.querySelector('button[aria-label="Close tab"]')!
    await user.click(closeBtn)

    const state = useExplorerStore.getState()
    expect(state.tabs.map((t) => t.id)).toEqual(['t1'])
    // Active tab untouched since we closed a background tab.
    expect(state.activeTabId).toBe('t1')
  })

  it('closes the active tab via middle-click (mouse button 1)', () => {
    seedTabs()
    render(<TitleBar />)
    const docsTab = screen.getByText('docs').closest('[role="tab"]')!
    fireEvent.mouseDown(docsTab, { button: 1 })
    expect(useExplorerStore.getState().tabs.map((t) => t.id)).toEqual(['t2'])
  })

  it('ignores non-middle mouse-down (e.g. left button) on a tab', () => {
    seedTabs()
    render(<TitleBar />)
    const docsTab = screen.getByText('docs').closest('[role="tab"]')!
    fireEvent.mouseDown(docsTab, { button: 0 })
    // No tab removed.
    expect(useExplorerStore.getState().tabs).toHaveLength(2)
  })

  it('prevents default on a middle aux-click but leaves other aux buttons alone', () => {
    seedTabs()
    render(<TitleBar />)
    const docsTab = screen.getByText('docs').closest('[role="tab"]')!

    // Middle aux-click → handler calls preventDefault.
    const middle = new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true })
    fireEvent(docsTab, middle)
    expect(middle.defaultPrevented).toBe(true)

    // Right aux-click → short-circuits, default left intact.
    const right = new MouseEvent('auxclick', { button: 2, bubbles: true, cancelable: true })
    fireEvent(docsTab, right)
    expect(right.defaultPrevented).toBe(false)
  })

  it('opens a new tab from the new-tab button', async () => {
    const user = userEvent.setup()
    seedTabs()
    render(<TitleBar />)
    await user.click(screen.getByRole('button', { name: 'New tab' }))
    expect(useExplorerStore.getState().tabs).toHaveLength(3)
    expect(useExplorerStore.getState().currentPath).toBe(HOME_PATH)
  })
})
