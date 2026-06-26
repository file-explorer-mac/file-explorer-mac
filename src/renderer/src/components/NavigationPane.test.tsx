import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NavigationPane from './NavigationPane'
import { useExplorerStore } from '@/store/explorerStore'
import { resetExplorerStore } from '@test/storeHelpers'
import { installApiMock, type ApiMock } from '@test/apiMock'
import { makeQuickLink, makeDrive, makeFolder, makeFileItem } from '@test/factories'

let api: ApiMock

beforeEach(() => {
  resetExplorerStore()
  api = installApiMock()
})

describe('NavigationPane', () => {
  it('renders Quick access, pinned links and This PC sections', () => {
    useExplorerStore.setState({
      quickLinks: [makeQuickLink({ name: 'Home', path: '/Users/test', icon: 'home' })],
      pinnedLinks: [makeQuickLink({ name: 'Projects', path: '/Users/test/proj', icon: 'documents' })],
      drives: [makeDrive({ name: 'Macintosh HD', path: '/' })]
    })
    render(<NavigationPane />)
    expect(screen.getByText('Quick access')).toBeInTheDocument()
    expect(screen.getByText('This PC')).toBeInTheDocument()
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Projects')).toBeInTheDocument()
    expect(screen.getByText('Macintosh HD')).toBeInTheDocument()
  })

  it('renders every quick-link icon variant', () => {
    const icons = [
      'home',
      'desktop',
      'documents',
      'downloads',
      'pictures',
      'music',
      'videos',
      'applications'
    ] as const
    useExplorerStore.setState({
      quickLinks: icons.map((icon) => makeQuickLink({ name: icon, path: `/q/${icon}`, icon }))
    })
    render(<NavigationPane />)
    icons.forEach((icon) => expect(screen.getByText(icon)).toBeInTheDocument())
  })

  it('navigates when a node row is clicked', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({
      quickLinks: [makeQuickLink({ name: 'Home', path: '/Users/test', icon: 'home' })]
    })
    render(<NavigationPane />)
    await user.click(screen.getByText('Home'))
    expect(useExplorerStore.getState().currentPath).toBe('/Users/test')
  })

  it('highlights the node matching the current path', () => {
    useExplorerStore.setState({
      currentPath: '/Users/test',
      quickLinks: [makeQuickLink({ name: 'Home', path: '/Users/test', icon: 'home' })]
    })
    render(<NavigationPane />)
    const row = screen.getByText('Home').closest('div')!
    // The selected class is applied (non-empty className beyond nodeRow).
    expect(row.className).toMatch(/selected/)
  })

  it('does not mark a non-current node as selected', () => {
    useExplorerStore.setState({
      currentPath: '/somewhere/else',
      quickLinks: [makeQuickLink({ name: 'Home', path: '/Users/test', icon: 'home' })]
    })
    render(<NavigationPane />)
    const row = screen.getByText('Home').closest('div')!
    expect(row.className).not.toMatch(/selected/)
  })

  it('unpins a pinned link via its unpin button', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({
      pinnedLinks: [makeQuickLink({ name: 'Projects', path: '/p/proj', icon: 'documents' })]
    })
    render(<NavigationPane />)
    await user.click(screen.getByTitle('Unpin from Quick access'))
    expect(useExplorerStore.getState().pinnedLinks).toEqual([])
    expect(screen.queryByText('Projects')).not.toBeInTheDocument()
  })

  it('expands a node, loading and showing sorted visible subfolders', async () => {
    const user = userEvent.setup()
    api.readDirectory.mockResolvedValue({
      ok: true,
      data: [
        makeFolder({ name: 'beta', path: '/Users/test/beta' }),
        makeFolder({ name: 'alpha', path: '/Users/test/alpha' }),
        makeFileItem({ name: 'note.txt', path: '/Users/test/note.txt' }),
        makeFolder({ name: '.hidden', path: '/Users/test/.hidden', isHidden: true })
      ]
    })
    useExplorerStore.setState({
      showHidden: false,
      quickLinks: [makeQuickLink({ name: 'Home', path: '/Users/test', icon: 'home' })]
    })
    render(<NavigationPane />)
    await user.click(screen.getByRole('button', { name: 'Expand' }))
    expect(api.readDirectory).toHaveBeenCalledWith('/Users/test')
    // Directories only, hidden filtered out, sorted.
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('beta')).toBeInTheDocument()
    expect(screen.queryByText('note.txt')).not.toBeInTheDocument()
    expect(screen.queryByText('.hidden')).not.toBeInTheDocument()
    const labels = screen
      .getAllByText(/alpha|beta/)
      .map((el) => el.textContent)
    expect(labels).toEqual(['alpha', 'beta'])
  })

  it('shows hidden subfolders when showHidden is enabled', async () => {
    const user = userEvent.setup()
    api.readDirectory.mockResolvedValue({
      ok: true,
      data: [makeFolder({ name: '.git', path: '/Users/test/.git', isHidden: true })]
    })
    useExplorerStore.setState({
      showHidden: true,
      quickLinks: [makeQuickLink({ name: 'Home', path: '/Users/test', icon: 'home' })]
    })
    render(<NavigationPane />)
    await user.click(screen.getByRole('button', { name: 'Expand' }))
    expect(screen.getByText('.git')).toBeInTheDocument()
  })

  it('collapses again and caches children (readDirectory called once)', async () => {
    const user = userEvent.setup()
    api.readDirectory.mockResolvedValue({
      ok: true,
      data: [makeFolder({ name: 'sub', path: '/Users/test/sub' })]
    })
    useExplorerStore.setState({
      quickLinks: [makeQuickLink({ name: 'Home', path: '/Users/test', icon: 'home' })]
    })
    render(<NavigationPane />)
    const chevron = screen.getByRole('button', { name: 'Expand' })
    await user.click(chevron)
    expect(screen.getByText('sub')).toBeInTheDocument()
    // Now collapse (button is labelled Collapse while expanded).
    await user.click(screen.getByRole('button', { name: 'Collapse' }))
    expect(screen.queryByText('sub')).not.toBeInTheDocument()
    // Re-expand: no second fetch (children cached).
    await user.click(screen.getByRole('button', { name: 'Expand' }))
    expect(screen.getByText('sub')).toBeInTheDocument()
    expect(api.readDirectory).toHaveBeenCalledTimes(1)
  })

  it('renders no child container when readDirectory fails / returns empty', async () => {
    const user = userEvent.setup()
    api.readDirectory.mockResolvedValue({ ok: false, error: 'nope' })
    useExplorerStore.setState({
      quickLinks: [makeQuickLink({ name: 'Home', path: '/Users/test', icon: 'home' })]
    })
    render(<NavigationPane />)
    await user.click(screen.getByRole('button', { name: 'Expand' }))
    // Expanded but with zero children: nothing extra rendered, no crash.
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument()
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('handles a successful result with missing data array as empty', async () => {
    const user = userEvent.setup()
    api.readDirectory.mockResolvedValue({ ok: true })
    useExplorerStore.setState({
      quickLinks: [makeQuickLink({ name: 'Home', path: '/Users/test', icon: 'home' })]
    })
    render(<NavigationPane />)
    await user.click(screen.getByRole('button', { name: 'Expand' }))
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument()
  })

  it('clicking the chevron does not navigate (stopPropagation)', async () => {
    const user = userEvent.setup()
    api.readDirectory.mockResolvedValue({ ok: true, data: [] })
    useExplorerStore.setState({
      currentPath: '/start',
      quickLinks: [makeQuickLink({ name: 'Home', path: '/Users/test', icon: 'home' })]
    })
    render(<NavigationPane />)
    await user.click(screen.getByRole('button', { name: 'Expand' }))
    expect(useExplorerStore.getState().currentPath).toBe('/start')
  })

  it('navigates into a nested subfolder rendered by recursion', async () => {
    const user = userEvent.setup()
    api.readDirectory.mockResolvedValue({
      ok: true,
      data: [makeFolder({ name: 'sub', path: '/Users/test/sub' })]
    })
    useExplorerStore.setState({
      quickLinks: [makeQuickLink({ name: 'Home', path: '/Users/test', icon: 'home' })]
    })
    render(<NavigationPane />)
    await user.click(screen.getByRole('button', { name: 'Expand' }))
    await user.click(screen.getByText('sub'))
    expect(useExplorerStore.getState().currentPath).toBe('/Users/test/sub')
  })

  it('toggles the Quick access section closed and open', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({
      quickLinks: [makeQuickLink({ name: 'Home', path: '/Users/test', icon: 'home' })]
    })
    render(<NavigationPane />)
    const header = screen.getByRole('button', { name: /Quick access/ })
    expect(screen.getByText('Home')).toBeInTheDocument()
    await user.click(header)
    expect(screen.queryByText('Home')).not.toBeInTheDocument()
    await user.click(header)
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('toggles the This PC section closed and open', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({
      drives: [makeDrive({ name: 'Macintosh HD', path: '/' })]
    })
    render(<NavigationPane />)
    const header = screen.getByRole('button', { name: /This PC/ })
    expect(screen.getByText('Macintosh HD')).toBeInTheDocument()
    await user.click(header)
    expect(screen.queryByText('Macintosh HD')).not.toBeInTheDocument()
    await user.click(header)
    expect(screen.getByText('Macintosh HD')).toBeInTheDocument()
  })

  it('renders empty sections without crashing when store is empty', () => {
    render(<NavigationPane />)
    expect(screen.getByText('Quick access')).toBeInTheDocument()
    expect(screen.getByText('This PC')).toBeInTheDocument()
  })

  it('shows the unpin button only on pinned links, not quick links', () => {
    useExplorerStore.setState({
      quickLinks: [makeQuickLink({ name: 'Home', path: '/Users/test', icon: 'home' })],
      pinnedLinks: [makeQuickLink({ name: 'Projects', path: '/p/proj', icon: 'documents' })]
    })
    render(<NavigationPane />)
    const unpins = screen.getAllByTitle('Unpin from Quick access')
    expect(unpins).toHaveLength(1)
    const projectsRow = screen.getByText('Projects').closest('div')!
    expect(within(projectsRow).getByTitle('Unpin from Quick access')).toBeInTheDocument()
  })
})
