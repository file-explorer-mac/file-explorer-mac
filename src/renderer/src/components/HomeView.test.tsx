import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HomeView from './HomeView'
import { useExplorerStore } from '@/store/explorerStore'
import { resetExplorerStore } from '@test/storeHelpers'
import { installApiMock, type ApiMock } from '@test/apiMock'
import { makeFileItem, makeFolder, makeQuickLink } from '@test/factories'

let api: ApiMock

beforeEach(() => {
  resetExplorerStore()
  api = installApiMock()
})

describe('HomeView', () => {
  it('renders Quick access folder links (excluding Home) and pinned links', () => {
    useExplorerStore.setState({
      quickLinks: [
        makeQuickLink({ name: 'Home', path: '/Users/test', icon: 'home' }),
        makeQuickLink({ name: 'Documents', path: '/Users/test/Documents', icon: 'documents' })
      ],
      pinnedLinks: [makeQuickLink({ name: 'Project', path: '/Users/test/Project', icon: 'documents' })]
    })
    render(<HomeView />)
    // Home shortcut is filtered out of Quick access.
    expect(screen.queryByRole('button', { name: 'Home' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Documents' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Project' })).toBeInTheDocument()
  })

  it('navigates when a Quick access tile is clicked', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({
      quickLinks: [makeQuickLink({ name: 'Documents', path: '/Users/test/Documents', icon: 'documents' })]
    })
    render(<HomeView />)
    await user.click(screen.getByRole('button', { name: 'Documents' }))
    await waitFor(() =>
      expect(useExplorerStore.getState().currentPath).toBe('/Users/test/Documents')
    )
  })

  it('shows the Recent empty state by default', async () => {
    render(<HomeView />)
    expect(
      await screen.findByText('Files and folders you open will show up here.')
    ).toBeInTheDocument()
  })

  it('resolves and lists recent items, with location shown relative to home', async () => {
    useExplorerStore.setState({
      recents: ['/Users/test/Docs/a.txt'],
      homeDir: '/Users/test'
    })
    api.getFileItem.mockResolvedValue({
      ok: true,
      data: makeFileItem({ name: 'a.txt', path: '/Users/test/Docs/a.txt' })
    })
    render(<HomeView />)
    expect(await screen.findByText('a.txt')).toBeInTheDocument()
    // parent '/Users/test/Docs' becomes '~/Docs'
    expect(screen.getByText(/~\/Docs/)).toBeInTheDocument()
    // Clear button appears when there are recents.
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
  })

  it('shows an absolute location when not under home', async () => {
    useExplorerStore.setState({
      recents: ['/opt/data/a.txt'],
      homeDir: '/Users/test'
    })
    api.getFileItem.mockResolvedValue({
      ok: true,
      data: makeFileItem({ name: 'a.txt', path: '/opt/data/a.txt' })
    })
    render(<HomeView />)
    expect(await screen.findByText('a.txt')).toBeInTheDocument()
    expect(screen.getByText(/\/opt\/data/)).toBeInTheDocument()
  })

  it('clears recents via the Clear button', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({ recents: ['/Users/test/a.txt'], homeDir: '/Users/test' })
    api.getFileItem.mockResolvedValue({
      ok: true,
      data: makeFileItem({ name: 'a.txt', path: '/Users/test/a.txt' })
    })
    render(<HomeView />)
    await screen.findByText('a.txt')
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(useExplorerStore.getState().recents).toEqual([])
  })

  it('removes a single recent via the row action without bubbling to the row', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({ recents: ['/Users/test/a.txt'], homeDir: '/Users/test' })
    api.getFileItem.mockResolvedValue({
      ok: true,
      data: makeFileItem({ name: 'a.txt', path: '/Users/test/a.txt' })
    })
    render(<HomeView />)
    await screen.findByText('a.txt')
    await user.click(screen.getByRole('button', { name: 'Remove from Recent' }))
    expect(useExplorerStore.getState().recents).toEqual([])
    // openItem must NOT have run (stopPropagation).
    expect(api.openPath).not.toHaveBeenCalled()
  })

  it('opens a recent item on double click (file → openPath)', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({ recents: ['/Users/test/a.txt'], homeDir: '/Users/test' })
    const item = makeFileItem({ name: 'a.txt', path: '/Users/test/a.txt' })
    api.getFileItem.mockResolvedValue({ ok: true, data: item })
    render(<HomeView />)
    await screen.findByText('a.txt')
    await user.dblClick(screen.getByText('a.txt'))
    await waitFor(() => expect(api.openPath).toHaveBeenCalledWith('/Users/test/a.txt'))
  })

  it('prunes recents that no longer resolve', async () => {
    useExplorerStore.setState({ recents: ['/Users/test/gone.txt'], homeDir: '/Users/test' })
    api.getFileItem.mockResolvedValue({ ok: false, error: 'missing' })
    render(<HomeView />)
    await waitFor(() => expect(useExplorerStore.getState().recents).toEqual([]))
    expect(
      screen.getByText('Files and folders you open will show up here.')
    ).toBeInTheDocument()
  })

  it('switches to the Favorites tab and shows its empty state', async () => {
    const user = userEvent.setup()
    render(<HomeView />)
    await user.click(screen.getByRole('button', { name: /Favorites/ }))
    expect(screen.getByText(/No favorites yet/)).toBeInTheDocument()
    // Clear button is only for the recent tab.
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
  })

  it('lists favorite items and removes one via the row action', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({ favorites: ['/Users/test/fav'], homeDir: '/Users/test' })
    api.getFileItem.mockResolvedValue({
      ok: true,
      data: makeFolder({ name: 'fav', path: '/Users/test/fav' })
    })
    render(<HomeView />)
    await user.click(screen.getByRole('button', { name: /Favorites/ }))
    await screen.findByText('fav')
    await user.click(screen.getByRole('button', { name: 'Remove from Favorites' }))
    expect(useExplorerStore.getState().favorites).toEqual([])
  })

  it('opens a favorite folder on double click (directory → navigateTo)', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({ favorites: ['/Users/test/fav'], homeDir: '/Users/test' })
    api.getFileItem.mockResolvedValue({
      ok: true,
      data: makeFolder({ name: 'fav', path: '/Users/test/fav' })
    })
    render(<HomeView />)
    await user.click(screen.getByRole('button', { name: /Favorites/ }))
    await screen.findByText('fav')
    await user.dblClick(screen.getByText('fav'))
    await waitFor(() => expect(useExplorerStore.getState().currentPath).toBe('/Users/test/fav'))
  })

  it('ignores a late resolution after unmount (alive guard)', async () => {
    useExplorerStore.setState({ recents: ['/Users/test/late.txt'], homeDir: '/Users/test' })
    let resolve!: (v: unknown) => void
    api.getFileItem.mockReturnValue(
      new Promise((r) => {
        resolve = r as (v: unknown) => void
      })
    )
    const { unmount } = render(<HomeView />)
    unmount()
    // Resolve after unmount: the effect's cleanup set alive=false, so this
    // must not attempt a state update or prune.
    resolve({ ok: false, error: 'missing' })
    await Promise.resolve()
    // Recent was not pruned because the resolution was ignored post-unmount.
    expect(useExplorerStore.getState().recents).toEqual(['/Users/test/late.txt'])
  })

  it('switches back to the Recent tab', async () => {
    const user = userEvent.setup()
    render(<HomeView />)
    await user.click(screen.getByRole('button', { name: /Favorites/ }))
    expect(screen.getByText(/No favorites yet/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Recent/ }))
    expect(
      screen.getByText('Files and folders you open will show up here.')
    ).toBeInTheDocument()
  })
})
