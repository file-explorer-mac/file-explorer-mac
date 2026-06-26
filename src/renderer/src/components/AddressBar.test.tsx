import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddressBar from './AddressBar'
import { useExplorerStore } from '@/store/explorerStore'
import { HOME_PATH } from '@/utils/pathUtils'
import { EDIT_ADDRESS_EVENT, FOCUS_SEARCH_EVENT } from '@/hooks/useKeyboardShortcuts'
import { resetExplorerStore } from '@test/storeHelpers'
import { installApiMock, type ApiMock } from '@test/apiMock'

let api: ApiMock

beforeEach(() => {
  resetExplorerStore()
  api = installApiMock()
})

const seed = (over: Record<string, unknown> = {}): void => {
  useExplorerStore.setState({
    currentPath: '/Users/test/docs',
    homeDir: '/Users/test',
    ...over
  })
}

describe('AddressBar — breadcrumbs', () => {
  it('renders crumbs from home and navigates when a crumb is clicked', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(useExplorerStore.getState(), 'navigateTo')
    seed()
    render(<AddressBar />)

    // Home is collapsed; leaf crumb is the current span (not a button).
    expect(screen.getByText('docs')).toBeInTheDocument()
    const homeCrumb = screen.getByRole('button', { name: 'Home' })
    await user.click(homeCrumb)
    expect(spy).toHaveBeenCalledWith('/Users/test')
  })

  it('renders the leaf crumb as a non-clickable current span', () => {
    seed({ currentPath: '/Users/test/docs' })
    render(<AddressBar />)
    // 'docs' is the last segment → rendered as span, so no button with that name.
    expect(screen.queryByRole('button', { name: 'docs' })).toBeNull()
  })
})

describe('AddressBar — nav buttons', () => {
  it('disables back/forward/up appropriately on Home', () => {
    useExplorerStore.setState({
      currentPath: HOME_PATH,
      homeDir: '/Users/test',
      tabs: [{ id: 'tab-1', history: [HOME_PATH], index: 0 }],
      activeTabId: 'tab-1'
    })
    render(<AddressBar />)
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Forward' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Up to parent' })).toBeDisabled()
  })

  it('enables back/forward when history allows and wires actions', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({
      currentPath: '/Users/test/docs',
      homeDir: '/Users/test',
      tabs: [{ id: 'tab-1', history: ['/a', '/Users/test/docs', '/b'], index: 1 }],
      activeTabId: 'tab-1'
    })
    const goBack = vi.spyOn(useExplorerStore.getState(), 'goBack')
    const goForward = vi.spyOn(useExplorerStore.getState(), 'goForward')
    const goUp = vi.spyOn(useExplorerStore.getState(), 'goUp')
    render(<AddressBar />)

    const back = screen.getByRole('button', { name: 'Back' })
    const forward = screen.getByRole('button', { name: 'Forward' })
    const up = screen.getByRole('button', { name: 'Up to parent' })
    expect(back).toBeEnabled()
    expect(forward).toBeEnabled()
    expect(up).toBeEnabled()
    await user.click(back)
    await user.click(forward)
    await user.click(up)
    expect(goBack).toHaveBeenCalled()
    expect(goForward).toHaveBeenCalled()
    expect(goUp).toHaveBeenCalled()
  })

  it('treats missing tab as no back/forward (canBack/canForward false)', () => {
    useExplorerStore.setState({
      currentPath: '/Users/test/docs',
      homeDir: '/Users/test',
      tabs: [{ id: 'tab-1', history: ['/a', '/b'], index: 1 }],
      activeTabId: 'nope'
    })
    render(<AddressBar />)
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Forward' })).toBeDisabled()
  })

  it('refresh button triggers refresh', async () => {
    const user = userEvent.setup()
    const refresh = vi.spyOn(useExplorerStore.getState(), 'refresh')
    seed()
    render(<AddressBar />)
    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(refresh).toHaveBeenCalled()
  })
})

describe('AddressBar — edit mode via background click', () => {
  it('enters edit mode when clicking the breadcrumb background', async () => {
    const user = userEvent.setup()
    seed()
    const { container } = render(<AddressBar />)
    const bg = container.querySelector('[class*="breadcrumb"]') as HTMLElement
    await user.click(bg)
    const input = screen.getByRole('textbox', { name: 'Address' }) as HTMLInputElement
    expect(input).toBeInTheDocument()
    expect(input.value).toBe('/Users/test/docs')
  })

  it('does not enter edit mode when clicking a crumb button (closest button)', async () => {
    const user = userEvent.setup()
    seed()
    render(<AddressBar />)
    await user.click(screen.getByRole('button', { name: 'Home' }))
    expect(screen.queryByRole('textbox', { name: 'Address' })).toBeNull()
  })

  it('starts blank when editing from Home page', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({ currentPath: HOME_PATH, homeDir: '/Users/test' })
    const { container } = render(<AddressBar />)
    const bg = container.querySelector('[class*="breadcrumb"]') as HTMLElement
    await user.click(bg)
    const input = screen.getByRole('textbox', { name: 'Address' }) as HTMLInputElement
    expect(input.value).toBe('')
  })
})

describe('AddressBar — EDIT_ADDRESS_EVENT', () => {
  it('enters edit mode seeded with current path on the event', () => {
    seed({ currentPath: '/Users/test/docs' })
    render(<AddressBar />)
    act(() => {
      window.dispatchEvent(new CustomEvent(EDIT_ADDRESS_EVENT))
    })
    const input = screen.getByRole('textbox', { name: 'Address' }) as HTMLInputElement
    expect(input.value).toBe('/Users/test/docs')
  })

  it('seeds blank when the event fires on Home', () => {
    useExplorerStore.setState({ currentPath: HOME_PATH, homeDir: '/Users/test' })
    render(<AddressBar />)
    act(() => {
      window.dispatchEvent(new CustomEvent(EDIT_ADDRESS_EVENT))
    })
    const input = screen.getByRole('textbox', { name: 'Address' }) as HTMLInputElement
    expect(input.value).toBe('')
  })

  it('removes the listener on unmount', () => {
    seed()
    const { unmount } = render(<AddressBar />)
    unmount()
    act(() => {
      window.dispatchEvent(new CustomEvent(EDIT_ADDRESS_EVENT))
    })
    expect(screen.queryByRole('textbox', { name: 'Address' })).toBeNull()
  })
})

describe('AddressBar — committing the edited path', () => {
  it('navigates to an absolute path that exists', async () => {
    const user = userEvent.setup()
    api.pathExists.mockResolvedValue(true)
    const nav = vi.spyOn(useExplorerStore.getState(), 'navigateTo')
    seed()
    render(<AddressBar />)
    act(() => window.dispatchEvent(new CustomEvent(EDIT_ADDRESS_EVENT)))
    const input = screen.getByRole('textbox', { name: 'Address' })
    await user.clear(input)
    await user.type(input, '/Applications')
    await user.keyboard('{Enter}')
    expect(api.pathExists).toHaveBeenCalledWith('/Applications')
    expect(nav).toHaveBeenCalledWith('/Applications')
  })

  it('flashes status when the path does not exist', async () => {
    const user = userEvent.setup()
    api.pathExists.mockResolvedValue(false)
    const flash = vi.spyOn(useExplorerStore.getState(), 'flashStatus')
    seed()
    render(<AddressBar />)
    act(() => window.dispatchEvent(new CustomEvent(EDIT_ADDRESS_EVENT)))
    const input = screen.getByRole('textbox', { name: 'Address' })
    await user.clear(input)
    await user.type(input, '/missing')
    await user.keyboard('{Enter}')
    expect(flash).toHaveBeenCalledWith('Cannot find /missing')
  })

  it('expands a bare ~ to the home directory', async () => {
    const user = userEvent.setup()
    const nav = vi.spyOn(useExplorerStore.getState(), 'navigateTo')
    seed()
    render(<AddressBar />)
    act(() => window.dispatchEvent(new CustomEvent(EDIT_ADDRESS_EVENT)))
    const input = screen.getByRole('textbox', { name: 'Address' })
    await user.clear(input)
    await user.type(input, '~')
    await user.keyboard('{Enter}')
    expect(api.pathExists).toHaveBeenCalledWith('/Users/test')
    expect(nav).toHaveBeenCalledWith('/Users/test')
  })

  it('expands ~/sub to homeDir + /sub', async () => {
    const user = userEvent.setup()
    const nav = vi.spyOn(useExplorerStore.getState(), 'navigateTo')
    seed()
    render(<AddressBar />)
    act(() => window.dispatchEvent(new CustomEvent(EDIT_ADDRESS_EVENT)))
    const input = screen.getByRole('textbox', { name: 'Address' })
    await user.clear(input)
    await user.type(input, '~/Downloads')
    await user.keyboard('{Enter}')
    expect(api.pathExists).toHaveBeenCalledWith('/Users/test/Downloads')
    expect(nav).toHaveBeenCalledWith('/Users/test/Downloads')
  })

  it('resolves a relative entry against the current folder via joinPath', async () => {
    const user = userEvent.setup()
    api.joinPath.mockResolvedValue('/Users/test/docs/sub')
    const nav = vi.spyOn(useExplorerStore.getState(), 'navigateTo')
    seed()
    render(<AddressBar />)
    act(() => window.dispatchEvent(new CustomEvent(EDIT_ADDRESS_EVENT)))
    const input = screen.getByRole('textbox', { name: 'Address' })
    await user.clear(input)
    await user.type(input, 'sub')
    await user.keyboard('{Enter}')
    expect(api.joinPath).toHaveBeenCalledWith('/Users/test/docs', 'sub')
    expect(nav).toHaveBeenCalledWith('/Users/test/docs/sub')
  })

  it('does nothing for an empty (whitespace) value and exits edit mode', async () => {
    const user = userEvent.setup()
    const nav = vi.spyOn(useExplorerStore.getState(), 'navigateTo')
    seed()
    render(<AddressBar />)
    act(() => window.dispatchEvent(new CustomEvent(EDIT_ADDRESS_EVENT)))
    const input = screen.getByRole('textbox', { name: 'Address' })
    await user.clear(input)
    await user.type(input, '   ')
    await user.keyboard('{Enter}')
    expect(nav).not.toHaveBeenCalled()
    expect(api.pathExists).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox', { name: 'Address' })).toBeNull()
  })

  it('cancels edit mode on Escape without navigating', async () => {
    const user = userEvent.setup()
    const nav = vi.spyOn(useExplorerStore.getState(), 'navigateTo')
    seed()
    render(<AddressBar />)
    act(() => window.dispatchEvent(new CustomEvent(EDIT_ADDRESS_EVENT)))
    const input = screen.getByRole('textbox', { name: 'Address' })
    await user.clear(input)
    await user.type(input, '/Applications')
    await user.keyboard('{Escape}')
    expect(nav).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox', { name: 'Address' })).toBeNull()
  })

  it('ignores other keys in the edit input', async () => {
    const user = userEvent.setup()
    seed()
    render(<AddressBar />)
    act(() => window.dispatchEvent(new CustomEvent(EDIT_ADDRESS_EVENT)))
    const input = screen.getByRole('textbox', { name: 'Address' })
    await user.type(input, 'x')
    // still editing (Tab/other keys not handled)
    expect(screen.getByRole('textbox', { name: 'Address' })).toBeInTheDocument()
  })

  it('exits edit mode on blur', async () => {
    const user = userEvent.setup()
    seed()
    render(<AddressBar />)
    act(() => window.dispatchEvent(new CustomEvent(EDIT_ADDRESS_EVENT)))
    expect(screen.getByRole('textbox', { name: 'Address' })).toBeInTheDocument()
    // Tab away to fire React's onBlur.
    await user.tab()
    expect(screen.queryByRole('textbox', { name: 'Address' })).toBeNull()
  })
})

describe('AddressBar — search', () => {
  it('disables search and shows the generic placeholder on Home', () => {
    useExplorerStore.setState({ currentPath: HOME_PATH, homeDir: '/Users/test' })
    render(<AddressBar />)
    const search = screen.getByRole('textbox', { name: 'Search' }) as HTMLInputElement
    expect(search).toBeDisabled()
    expect(search.placeholder).toBe('Search')
  })

  it('shows a folder-scoped placeholder off Home', () => {
    seed({ currentPath: '/Users/test/docs' })
    render(<AddressBar />)
    const search = screen.getByRole('textbox', { name: 'Search' }) as HTMLInputElement
    expect(search.placeholder).toBe('Search docs')
  })

  it('types into search and runs search on Enter', async () => {
    const user = userEvent.setup()
    const run = vi.spyOn(useExplorerStore.getState(), 'runSearch')
    seed()
    render(<AddressBar />)
    const search = screen.getByRole('textbox', { name: 'Search' })
    await user.type(search, 'report')
    expect(useExplorerStore.getState().searchQuery).toBe('report')
    await user.keyboard('{Enter}')
    expect(run).toHaveBeenCalled()
  })

  it('clears search on Escape when there is a query', async () => {
    const user = userEvent.setup()
    const clear = vi.spyOn(useExplorerStore.getState(), 'clearSearch')
    seed({ searchQuery: 'abc' })
    render(<AddressBar />)
    const search = screen.getByRole('textbox', { name: 'Search' })
    search.focus()
    await user.keyboard('{Escape}')
    expect(clear).toHaveBeenCalled()
  })

  it('Escape with no query is a no-op (does not call clearSearch)', async () => {
    const user = userEvent.setup()
    const clear = vi.spyOn(useExplorerStore.getState(), 'clearSearch')
    seed({ searchQuery: '' })
    render(<AddressBar />)
    const search = screen.getByRole('textbox', { name: 'Search' })
    search.focus()
    await user.keyboard('{Escape}')
    expect(clear).not.toHaveBeenCalled()
  })

  it('the clear button clears search and resets the query', async () => {
    const user = userEvent.setup()
    const clear = vi.spyOn(useExplorerStore.getState(), 'clearSearch')
    const setQuery = vi.spyOn(useExplorerStore.getState(), 'setSearchQuery')
    seed({ searchQuery: 'abc' })
    render(<AddressBar />)
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(clear).toHaveBeenCalled()
    expect(setQuery).toHaveBeenCalledWith('')
  })

  it('hides the clear button when there is no query', () => {
    seed({ searchQuery: '' })
    render(<AddressBar />)
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull()
  })

  it('focuses and selects the search box on FOCUS_SEARCH_EVENT', () => {
    seed({ searchQuery: 'hello' })
    render(<AddressBar />)
    const search = screen.getByRole('textbox', { name: 'Search' }) as HTMLInputElement
    const selectSpy = vi.spyOn(search, 'select')
    act(() => {
      window.dispatchEvent(new CustomEvent(FOCUS_SEARCH_EVENT))
    })
    expect(document.activeElement).toBe(search)
    expect(selectSpy).toHaveBeenCalled()
  })

  it('removes the focus-search listener on unmount', () => {
    seed({ searchQuery: 'hello' })
    const { unmount } = render(<AddressBar />)
    unmount()
    // Should not throw / no input to focus after unmount.
    act(() => {
      window.dispatchEvent(new CustomEvent(FOCUS_SEARCH_EVENT))
    })
    expect(screen.queryByRole('textbox', { name: 'Search' })).toBeNull()
  })

  it('ignores non-Enter/Escape keys in search', async () => {
    const user = userEvent.setup()
    const run = vi.spyOn(useExplorerStore.getState(), 'runSearch')
    seed()
    render(<AddressBar />)
    const search = screen.getByRole('textbox', { name: 'Search' })
    await user.type(search, 'a')
    expect(run).not.toHaveBeenCalled()
  })
})
