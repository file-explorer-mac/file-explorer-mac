import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ContextMenu from './ContextMenu'
import { useExplorerStore } from '@/store/explorerStore'
import { resetExplorerStore } from '@test/storeHelpers'
import { installApiMock, type ApiMock } from '@test/apiMock'
import { makeFileItem, makeFolder } from '@test/factories'

let api: ApiMock

beforeEach(() => {
  resetExplorerStore()
  api = installApiMock()
})

/** Open the item (target) context menu seeded with the given item. */
function openItemMenu(
  item = makeFileItem({ name: 'a.txt', path: '/p/a.txt' }),
  extra: Record<string, unknown> = {}
): void {
  useExplorerStore.setState({
    currentPath: '/p',
    items: [item],
    selection: new Set([item.path]),
    contextMenu: { x: 10, y: 20, targetPath: item.path },
    ...extra
  })
}

/** Spy on a store action, returning the spy. */
function spyAction<K extends keyof ReturnType<typeof useExplorerStore.getState>>(
  name: K
): ReturnType<typeof vi.fn> {
  const spy = vi.fn()
  useExplorerStore.setState({ [name]: spy } as never)
  return spy
}

async function clickItem(label: string | RegExp): Promise<void> {
  const user = userEvent.setup()
  await user.click(screen.getByText(label))
}

describe('ContextMenu', () => {
  it('renders nothing when contextMenu is null', () => {
    const { container } = render(<ContextMenu />)
    expect(container.firstChild).toBeNull()
  })

  describe('item (target) menu', () => {
    it('renders the item menu and runs Open for the target item', async () => {
      const item = makeFileItem({ name: 'a.txt', path: '/p/a.txt' })
      const openItem = spyAction('openItem')
      openItemMenu(item)
      render(<ContextMenu />)
      expect(screen.getByText('Open')).toBeInTheDocument()
      await clickItem('Open')
      expect(openItem).toHaveBeenCalledWith(item)
    })

    it('Open with… is disabled for a directory and enabled for a file', async () => {
      const openWithSelection = spyAction('openWithSelection')
      // File: enabled
      openItemMenu(makeFileItem({ name: 'a.txt', path: '/p/a.txt' }))
      const { unmount } = render(<ContextMenu />)
      const fileRow = screen.getByText('Open with…').closest('[role="menuitem"]')!
      expect(fileRow).toHaveAttribute('aria-disabled', 'false')
      await clickItem('Open with…')
      expect(openWithSelection).toHaveBeenCalledTimes(1)
      unmount()

      // Directory: disabled, and "Open in Terminal" appears (canPin)
      const dir = makeFolder({ name: 'd', path: '/p/d' })
      openItemMenu(dir)
      render(<ContextMenu />)
      const dirRow = screen.getByText('Open with…').closest('[role="menuitem"]')!
      expect(dirRow).toHaveAttribute('aria-disabled', 'true')
    })

    it('runs Open in Terminal for a directory target via window.api', async () => {
      const dir = makeFolder({ name: 'd', path: '/p/d' })
      openItemMenu(dir)
      render(<ContextMenu />)
      await clickItem('Open in Terminal')
      expect(api.openInTerminal).toHaveBeenCalledWith('/p/d')
    })

    it('runs Cut and Copy', async () => {
      const cutSelection = spyAction('cutSelection')
      openItemMenu()
      render(<ContextMenu />)
      await clickItem('Cut')
      expect(cutSelection).toHaveBeenCalledTimes(1)
    })

    it('Copy triggers copySelection', async () => {
      const copySelection = spyAction('copySelection')
      openItemMenu()
      render(<ContextMenu />)
      await clickItem('Copy')
      expect(copySelection).toHaveBeenCalledTimes(1)
    })

    it('Paste is disabled with empty clipboard', async () => {
      const paste = spyAction('paste')
      openItemMenu(makeFileItem({ name: 'a.txt', path: '/p/a.txt' }), { clipboard: null })
      render(<ContextMenu />)
      const row = screen.getByText('Paste').closest('[role="menuitem"]')!
      expect(row).toHaveAttribute('aria-disabled', 'true')
      await clickItem('Paste')
      expect(paste).not.toHaveBeenCalled()
    })

    it('Paste runs when the clipboard is populated', async () => {
      const paste = spyAction('paste')
      openItemMenu(makeFileItem({ name: 'a.txt', path: '/p/a.txt' }), {
        clipboard: { paths: ['/p/x'], mode: 'copy' }
      })
      render(<ContextMenu />)
      await clickItem('Paste')
      expect(paste).toHaveBeenCalledTimes(1)
    })

    it('Rename is enabled for a single selection and runs beginRename', async () => {
      const beginRename = spyAction('beginRename')
      openItemMenu(makeFileItem({ name: 'a.txt', path: '/p/a.txt' }))
      render(<ContextMenu />)
      await clickItem('Rename')
      expect(beginRename).toHaveBeenCalledWith('/p/a.txt')
    })

    it('Rename is disabled when more than one item is selected', async () => {
      const beginRename = spyAction('beginRename')
      const a = makeFileItem({ name: 'a.txt', path: '/p/a.txt' })
      const b = makeFileItem({ name: 'b.txt', path: '/p/b.txt' })
      useExplorerStore.setState({
        currentPath: '/p',
        items: [a, b],
        selection: new Set([a.path, b.path]),
        contextMenu: { x: 0, y: 0, targetPath: a.path }
      })
      render(<ContextMenu />)
      const row = screen.getByText('Rename').closest('[role="menuitem"]')!
      expect(row).toHaveAttribute('aria-disabled', 'true')
      await clickItem('Rename')
      expect(beginRename).not.toHaveBeenCalled()
    })

    it('Compress to ZIP runs compressSelection', async () => {
      const compressSelection = spyAction('compressSelection')
      openItemMenu()
      render(<ContextMenu />)
      await clickItem('Compress to ZIP')
      expect(compressSelection).toHaveBeenCalledTimes(1)
    })

    it('Extract here is absent for a non-zip and present + runs for a zip', async () => {
      // Non-zip: no Extract entry
      openItemMenu(makeFileItem({ name: 'a.txt', path: '/p/a.txt', ext: 'txt' }))
      const { unmount } = render(<ContextMenu />)
      expect(screen.queryByText('Extract here')).not.toBeInTheDocument()
      unmount()

      const extractSelection = spyAction('extractSelection')
      const zip = makeFileItem({ name: 'a.zip', path: '/p/a.zip', ext: 'zip' })
      openItemMenu(zip)
      render(<ContextMenu />)
      await clickItem('Extract here')
      expect(extractSelection).toHaveBeenCalledTimes(1)
    })

    it('pins a directory not yet pinned', async () => {
      const pinToQuickAccess = spyAction('pinToQuickAccess')
      const dir = makeFolder({ name: 'd', path: '/p/d' })
      useExplorerStore.setState({
        currentPath: '/p',
        items: [dir],
        selection: new Set([dir.path]),
        pinnedLinks: [],
        contextMenu: { x: 0, y: 0, targetPath: dir.path }
      })
      render(<ContextMenu />)
      expect(screen.getByText('Pin to Quick access')).toBeInTheDocument()
      await clickItem('Pin to Quick access')
      expect(pinToQuickAccess).toHaveBeenCalledWith('/p/d', 'd')
    })

    it('unpins a directory already pinned', async () => {
      const unpinFromQuickAccess = spyAction('unpinFromQuickAccess')
      const dir = makeFolder({ name: 'd', path: '/p/d' })
      useExplorerStore.setState({
        currentPath: '/p',
        items: [dir],
        selection: new Set([dir.path]),
        pinnedLinks: [{ name: 'd', path: '/p/d', icon: 'documents' }],
        contextMenu: { x: 0, y: 0, targetPath: dir.path }
      })
      render(<ContextMenu />)
      expect(screen.getByText('Unpin from Quick access')).toBeInTheDocument()
      await clickItem('Unpin from Quick access')
      expect(unpinFromQuickAccess).toHaveBeenCalledWith('/p/d')
    })

    it('adds a target to Favorites when not yet favorited', async () => {
      const addFavorite = spyAction('addFavorite')
      openItemMenu(makeFileItem({ name: 'a.txt', path: '/p/a.txt' }), { favorites: [] })
      render(<ContextMenu />)
      expect(screen.getByText('Add to Favorites')).toBeInTheDocument()
      await clickItem('Add to Favorites')
      expect(addFavorite).toHaveBeenCalledWith('/p/a.txt')
    })

    it('removes a target from Favorites when already favorited', async () => {
      const removeFavorite = spyAction('removeFavorite')
      openItemMenu(makeFileItem({ name: 'a.txt', path: '/p/a.txt' }), {
        favorites: ['/p/a.txt']
      })
      render(<ContextMenu />)
      expect(screen.getByText('Remove from Favorites')).toBeInTheDocument()
      await clickItem('Remove from Favorites')
      expect(removeFavorite).toHaveBeenCalledWith('/p/a.txt')
    })

    it('Copy as path runs copyPathSelection', async () => {
      const copyPathSelection = spyAction('copyPathSelection')
      openItemMenu()
      render(<ContextMenu />)
      await clickItem('Copy as path')
      expect(copyPathSelection).toHaveBeenCalledTimes(1)
    })

    it('Reveal in Finder runs revealSelectionInFinder', async () => {
      const revealSelectionInFinder = spyAction('revealSelectionInFinder')
      openItemMenu()
      render(<ContextMenu />)
      await clickItem('Reveal in Finder')
      expect(revealSelectionInFinder).toHaveBeenCalledTimes(1)
    })

    it('Delete runs deleteSelection', async () => {
      const deleteSelection = spyAction('deleteSelection')
      openItemMenu()
      render(<ContextMenu />)
      await clickItem('Delete')
      expect(deleteSelection).toHaveBeenCalledTimes(1)
    })

    it('Properties opens properties for the target path', async () => {
      const openProperties = spyAction('openProperties')
      openItemMenu(makeFileItem({ name: 'a.txt', path: '/p/a.txt' }))
      render(<ContextMenu />)
      await clickItem('Properties')
      expect(openProperties).toHaveBeenCalledWith('/p/a.txt')
    })

    it('Open is a no-op when the target item is missing from items', async () => {
      const openItem = spyAction('openItem')
      // targetPath points at a path not present in items → targetItem undefined.
      useExplorerStore.setState({
        currentPath: '/p',
        items: [],
        selection: new Set(),
        contextMenu: { x: 0, y: 0, targetPath: '/p/ghost' }
      })
      render(<ContextMenu />)
      await clickItem('Open')
      expect(openItem).not.toHaveBeenCalled()
    })
  })

  describe('background (no target) menu', () => {
    function openBgMenu(extra: Record<string, unknown> = {}): void {
      useExplorerStore.setState({
        currentPath: '/p',
        items: [],
        selection: new Set(),
        contextMenu: { x: 5, y: 5, targetPath: null },
        ...extra
      })
    }

    it('switches the view mode from the View submenu', async () => {
      const setViewMode = spyAction('setViewMode')
      openBgMenu({ viewMode: 'details' })
      render(<ContextMenu />)
      const user = userEvent.setup()
      await user.hover(screen.getByText('View'))
      await user.click(screen.getByText('Large icons'))
      expect(setViewMode).toHaveBeenCalledWith('large')
    })

    it('Sort by submenu: choosing a key and toggling Ascending/Descending', async () => {
      const setSort = spyAction('setSort')
      openBgMenu({ sortKey: 'name', sortDir: 'asc' })
      render(<ContextMenu />)
      const user = userEvent.setup()
      await user.hover(screen.getByText('Sort by'))
      await user.click(screen.getByText('Size'))
      expect(setSort).toHaveBeenCalledWith('size')
    })

    it('Descending toggles sort when currently ascending', async () => {
      const setSort = spyAction('setSort')
      openBgMenu({ sortKey: 'name', sortDir: 'asc' })
      render(<ContextMenu />)
      const user = userEvent.setup()
      await user.hover(screen.getByText('Sort by'))
      await user.click(screen.getByText('Descending'))
      expect(setSort).toHaveBeenCalledWith('name')
    })

    it('Descending is a no-op when already descending', async () => {
      const setSort = spyAction('setSort')
      openBgMenu({ sortKey: 'name', sortDir: 'desc' })
      render(<ContextMenu />)
      const user = userEvent.setup()
      await user.hover(screen.getByText('Sort by'))
      await user.click(screen.getByText('Descending'))
      expect(setSort).not.toHaveBeenCalled()
    })

    it('Ascending toggles sort when currently descending', async () => {
      const setSort = spyAction('setSort')
      openBgMenu({ sortKey: 'name', sortDir: 'desc' })
      render(<ContextMenu />)
      const user = userEvent.setup()
      await user.hover(screen.getByText('Sort by'))
      await user.click(screen.getByText('Ascending'))
      expect(setSort).toHaveBeenCalledWith('name')
    })

    it('Ascending is a no-op when already ascending', async () => {
      const setSort = spyAction('setSort')
      openBgMenu({ sortKey: 'name', sortDir: 'asc' })
      render(<ContextMenu />)
      const user = userEvent.setup()
      await user.hover(screen.getByText('Sort by'))
      await user.click(screen.getByText('Ascending'))
      expect(setSort).not.toHaveBeenCalled()
    })

    it('Group by submenu selects a grouping key', async () => {
      const setGroupBy = spyAction('setGroupBy')
      openBgMenu({ groupBy: 'none' })
      render(<ContextMenu />)
      const user = userEvent.setup()
      await user.hover(screen.getByText('Group by'))
      // "Type" exists in the Group by submenu.
      await user.click(screen.getByText('Type'))
      expect(setGroupBy).toHaveBeenCalledWith('type')
    })

    it('Refresh runs refresh', async () => {
      const refresh = spyAction('refresh')
      openBgMenu()
      render(<ContextMenu />)
      await clickItem('Refresh')
      expect(refresh).toHaveBeenCalledTimes(1)
    })

    it('New > Folder and New > Text Document create items', async () => {
      const createFolder = spyAction('createFolder')
      openBgMenu()
      const { unmount } = render(<ContextMenu />)
      const user = userEvent.setup()
      await user.hover(screen.getByText('New'))
      await user.click(screen.getByText('Folder'))
      expect(createFolder).toHaveBeenCalledTimes(1)
      unmount()

      const createTextFile = spyAction('createTextFile')
      openBgMenu()
      render(<ContextMenu />)
      const user2 = userEvent.setup()
      await user2.hover(screen.getByText('New'))
      await user2.click(screen.getByText('Text Document'))
      expect(createTextFile).toHaveBeenCalledTimes(1)
    })

    it('background Paste disabled with empty clipboard, enabled otherwise', async () => {
      const paste = spyAction('paste')
      openBgMenu({ clipboard: null })
      const { unmount } = render(<ContextMenu />)
      expect(screen.getByText('Paste').closest('[role="menuitem"]')).toHaveAttribute(
        'aria-disabled',
        'true'
      )
      unmount()

      openBgMenu({ clipboard: { paths: ['/p/x'], mode: 'copy' } })
      render(<ContextMenu />)
      await clickItem('Paste')
      expect(paste).toHaveBeenCalledTimes(1)
    })

    it('Undo disabled with an empty stack, enabled and runs otherwise', async () => {
      const undo = spyAction('undo')
      openBgMenu({ undoStack: [] })
      const { unmount } = render(<ContextMenu />)
      expect(screen.getByText('Undo').closest('[role="menuitem"]')).toHaveAttribute(
        'aria-disabled',
        'true'
      )
      unmount()

      openBgMenu({
        undoStack: [{ type: 'rename', from: '/p/a', to: '/p/b' }]
      })
      render(<ContextMenu />)
      await clickItem('Undo')
      expect(undo).toHaveBeenCalledTimes(1)
    })

    it('Open in Terminal runs openTerminalHere', async () => {
      const openTerminalHere = spyAction('openTerminalHere')
      openBgMenu()
      render(<ContextMenu />)
      await clickItem('Open in Terminal')
      expect(openTerminalHere).toHaveBeenCalledTimes(1)
    })

    it('Show hidden items toggles showHidden', async () => {
      const toggleShowHidden = spyAction('toggleShowHidden')
      openBgMenu({ showHidden: false })
      render(<ContextMenu />)
      await clickItem('Show hidden items')
      expect(toggleShowHidden).toHaveBeenCalledTimes(1)
    })

    it('Reveal in Finder calls window.api with the current path', async () => {
      openBgMenu({ currentPath: '/p/here' })
      render(<ContextMenu />)
      await clickItem('Reveal in Finder')
      expect(api.revealInFinder).toHaveBeenCalledWith('/p/here')
    })

    it('Select all runs selectAll', async () => {
      const selectAll = spyAction('selectAll')
      openBgMenu()
      render(<ContextMenu />)
      await clickItem('Select all')
      expect(selectAll).toHaveBeenCalledTimes(1)
    })

    it('Properties opens properties for the current path', async () => {
      const openProperties = spyAction('openProperties')
      openBgMenu({ currentPath: '/p/here' })
      render(<ContextMenu />)
      await clickItem('Properties')
      expect(openProperties).toHaveBeenCalledWith('/p/here')
    })
  })

  describe('closing behavior', () => {
    it('closes on Escape', async () => {
      const closeContextMenu = spyAction('closeContextMenu')
      openItemMenu()
      render(<ContextMenu />)
      const user = userEvent.setup()
      await user.keyboard('{Escape}')
      expect(closeContextMenu).toHaveBeenCalled()
    })

    it('closes on an outside click', async () => {
      const closeContextMenu = spyAction('closeContextMenu')
      openItemMenu()
      render(<ContextMenu />)
      // Defer past the setTimeout(0) that arms the outside-click listener.
      await new Promise((r) => setTimeout(r, 5))
      const user = userEvent.setup()
      await user.click(document.body)
      expect(closeContextMenu).toHaveBeenCalled()
    })
  })
})
