import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NavigationPane from './NavigationPane'
import {
  useExplorerStore,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH
} from '@/store/explorerStore'
import { resetExplorerStore } from '@test/storeHelpers'
import { installApiMock, type ApiMock } from '@test/apiMock'
import { makeQuickLink, makeDrive, makeFolder, makeFileItem } from '@test/factories'
import type { SidebarCategory } from '@shared/types'

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

describe('NavigationPane — resizing', () => {
  it('renders at the stored width', () => {
    useExplorerStore.setState({ sidebarWidth: 260 })
    const { container } = render(<NavigationPane />)
    expect((container.querySelector('div') as HTMLElement).style.width).toBe('260px')
  })

  it('widens as the grip is dragged right, since the pane hugs the left edge', () => {
    useExplorerStore.setState({ sidebarWidth: 240 })
    const { container } = render(<NavigationPane />)
    const grip = container.querySelector('[role="separator"]') as HTMLElement
    fireEvent.mouseDown(grip, { clientX: 100 })
    fireEvent.mouseMove(window, { clientX: 180 })
    fireEvent.mouseUp(window)
    expect(useExplorerStore.getState().sidebarWidth).toBe(320)
  })

  it('clamps to the min and max widths', () => {
    useExplorerStore.setState({ sidebarWidth: 240 })
    const { container } = render(<NavigationPane />)
    const grip = container.querySelector('[role="separator"]') as HTMLElement

    fireEvent.mouseDown(grip, { clientX: 0 })
    fireEvent.mouseMove(window, { clientX: 5000 })
    fireEvent.mouseUp(window)
    expect(useExplorerStore.getState().sidebarWidth).toBe(SIDEBAR_MAX_WIDTH)

    fireEvent.mouseDown(grip, { clientX: 0 })
    fireEvent.mouseMove(window, { clientX: -5000 })
    fireEvent.mouseUp(window)
    expect(useExplorerStore.getState().sidebarWidth).toBe(SIDEBAR_MIN_WIDTH)
  })

  it('stops tracking the mouse after the drag ends', () => {
    useExplorerStore.setState({ sidebarWidth: 240 })
    const { container } = render(<NavigationPane />)
    const grip = container.querySelector('[role="separator"]') as HTMLElement
    fireEvent.mouseDown(grip, { clientX: 100 })
    fireEvent.mouseUp(window)
    fireEvent.mouseMove(window, { clientX: 400 })
    expect(useExplorerStore.getState().sidebarWidth).toBe(240)
  })
})

describe('NavigationPane — categories', () => {
  const seed = (over: Partial<SidebarCategory> = {}): SidebarCategory => ({
    id: 'c1',
    name: 'Work',
    paths: ['/p/docs'],
    collapsed: false,
    ...over
  })

  it('lists categories between Quick access and This PC', () => {
    useExplorerStore.setState({ categories: [seed()] })
    const { container } = render(<NavigationPane />)
    const labels = Array.from(container.querySelectorAll('.sectionLabel')).map((n) => n.textContent)
    expect(labels).toEqual(['Quick access', 'Work', 'This PC'])
  })

  it('shows a category’s folders by their basename', () => {
    useExplorerStore.setState({ categories: [seed({ paths: ['/p/docs', '/q/photos'] })] })
    render(<NavigationPane />)
    expect(screen.getByText('docs')).toBeInTheDocument()
    expect(screen.getByText('photos')).toBeInTheDocument()
  })

  it('collapses and expands from the header toggle', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({ categories: [seed()] })
    render(<NavigationPane />)
    await user.click(screen.getByText('Work'))
    expect(useExplorerStore.getState().categories[0].collapsed).toBe(true)
  })

  it('hides the folders while collapsed', () => {
    useExplorerStore.setState({ categories: [seed({ collapsed: true })] })
    render(<NavigationPane />)
    expect(screen.queryByText('docs')).toBeNull()
  })

  it('tells an empty category what it is for', () => {
    useExplorerStore.setState({ categories: [seed({ paths: [] })] })
    render(<NavigationPane />)
    expect(screen.getByText('Drag folders here')).toBeInTheDocument()
  })

  it('creates a category from the New category row', async () => {
    const user = userEvent.setup()
    render(<NavigationPane />)
    await user.click(screen.getByText('New category'))
    expect(useExplorerStore.getState().categories).toHaveLength(1)
  })

  it('removes a folder from its category', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({ categories: [seed()] })
    const { container } = render(<NavigationPane />)
    await user.click(container.querySelector('.unpin') as HTMLElement)
    expect(useExplorerStore.getState().categories[0].paths).toEqual([])
  })

  describe('inline rename', () => {
    it('edits the title in place and commits on Enter', async () => {
      const user = userEvent.setup()
      useExplorerStore.setState({ categories: [seed()], renamingCategoryId: 'c1' })
      render(<NavigationPane />)
      const input = screen.getByLabelText('Category name')
      await user.clear(input)
      await user.type(input, 'Clients{Enter}')
      expect(useExplorerStore.getState().categories[0].name).toBe('Clients')
      expect(useExplorerStore.getState().renamingCategoryId).toBeNull()
    })

    it('keeps the old name on Escape', async () => {
      const user = userEvent.setup()
      useExplorerStore.setState({ categories: [seed()], renamingCategoryId: 'c1' })
      render(<NavigationPane />)
      const input = screen.getByLabelText('Category name')
      await user.clear(input)
      await user.type(input, 'Nope{Escape}')
      expect(useExplorerStore.getState().categories[0].name).toBe('Work')
      expect(useExplorerStore.getState().renamingCategoryId).toBeNull()
    })

    it('commits on blur so clicking away does not strand the editor', () => {
      useExplorerStore.setState({ categories: [seed()], renamingCategoryId: 'c1' })
      render(<NavigationPane />)
      const input = screen.getByLabelText('Category name') as HTMLInputElement
      input.value = 'Archive'
      fireEvent.blur(input)
      expect(useExplorerStore.getState().categories[0].name).toBe('Archive')
    })
  })

  describe('drag and drop', () => {
    const dt = (paths: string[]): DataTransfer =>
      ({ files: paths.map((p) => new File([''], p)), dropEffect: 'none' }) as unknown as DataTransfer

    it('adds a dropped folder to the category', () => {
      api.getPathForFile.mockReturnValue('/dropped/folder')
      useExplorerStore.setState({ categories: [seed({ paths: [] })] })
      const { container } = render(<NavigationPane />)
      const header = container.querySelector('.categoryHeader') as HTMLElement
      fireEvent.dragOver(header, { dataTransfer: dt(['/dropped/folder']) })
      expect(header.className).toMatch(/categoryDropTarget/)
      fireEvent.drop(header, { dataTransfer: dt(['/dropped/folder']) })
      expect(useExplorerStore.getState().categories[0].paths).toEqual(['/dropped/folder'])
    })

    it('pins a folder dropped on the Quick access header', () => {
      api.getPathForFile.mockReturnValue('/dropped/reports')
      const { container } = render(<NavigationPane />)
      const header = container.querySelector('.sectionHeader') as HTMLElement
      fireEvent.dragOver(header, { dataTransfer: dt(['/dropped/reports']) })
      expect(header.className).toMatch(/categoryDropTarget/)
      fireEvent.drop(header, { dataTransfer: dt(['/dropped/reports']) })
      expect(useExplorerStore.getState().pinnedLinks).toEqual([
        { name: 'reports', path: '/dropped/reports', icon: 'documents' }
      ])
      expect(header.className).not.toMatch(/categoryDropTarget/)
    })

    it('clears the Quick access highlight on drag leave', () => {
      const { container } = render(<NavigationPane />)
      const header = container.querySelector('.sectionHeader') as HTMLElement
      fireEvent.dragOver(header, { dataTransfer: dt(['/x']) })
      fireEvent.dragLeave(header)
      expect(header.className).not.toMatch(/categoryDropTarget/)
    })

    it('clears the highlight on drag leave', () => {
      useExplorerStore.setState({ categories: [seed()] })
      const { container } = render(<NavigationPane />)
      const header = container.querySelector('.categoryHeader') as HTMLElement
      fireEvent.dragOver(header, { dataTransfer: dt(['/x']) })
      expect(header.className).toMatch(/categoryDropTarget/)
      fireEvent.dragLeave(header)
      expect(header.className).not.toMatch(/categoryDropTarget/)
    })

    it('ignores a drop that resolves to no paths', () => {
      api.getPathForFile.mockReturnValue('')
      useExplorerStore.setState({ categories: [seed({ paths: [] })] })
      const { container } = render(<NavigationPane />)
      const header = container.querySelector('.categoryHeader') as HTMLElement
      fireEvent.drop(header, { dataTransfer: dt(['/x']) })
      expect(useExplorerStore.getState().categories[0].paths).toEqual([])
    })
  })

  describe('header menu', () => {
    it('renames from the options button', async () => {
      const user = userEvent.setup()
      useExplorerStore.setState({ categories: [seed()] })
      render(<NavigationPane />)
      await user.click(screen.getByLabelText('Options for Work'))
      await user.click(screen.getByText('Rename'))
      expect(useExplorerStore.getState().renamingCategoryId).toBe('c1')
    })

    it('deletes the category, leaving the folders alone', async () => {
      const user = userEvent.setup()
      useExplorerStore.setState({ categories: [seed()] })
      render(<NavigationPane />)
      await user.click(screen.getByLabelText('Options for Work'))
      await user.click(screen.getByText('Delete category'))
      expect(useExplorerStore.getState().categories).toEqual([])
    })

    it('opens from a right-click on the header', () => {
      useExplorerStore.setState({ categories: [seed()] })
      const { container } = render(<NavigationPane />)
      fireEvent.contextMenu(container.querySelector('.categoryHeader') as HTMLElement)
      expect(screen.getByText('Delete category')).toBeInTheDocument()
    })
  })
})
