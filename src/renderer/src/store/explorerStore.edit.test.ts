import { describe, it, expect, beforeEach } from 'vitest'
import { useExplorerStore } from './explorerStore'
import { HOME_PATH } from '@/utils/pathUtils'
import { resetExplorerStore } from '@test/storeHelpers'
import { installApiMock, type ApiMock } from '@test/apiMock'
import { makeFileItem, makeFolder } from '@test/factories'
import type { FileItem, Result } from '@shared/types'

let api: ApiMock
beforeEach(() => {
  resetExplorerStore()
  api = installApiMock()
})

const store = (): ReturnType<typeof useExplorerStore.getState> => useExplorerStore.getState()

const seedItems = (): void => {
  useExplorerStore.setState({
    currentPath: '/p',
    showHidden: true,
    sortKey: 'name',
    sortDir: 'asc',
    items: [
      makeFileItem({ name: 'a.txt', path: '/p/a.txt' }),
      makeFileItem({ name: 'b.txt', path: '/p/b.txt' }),
      makeFileItem({ name: 'c.txt', path: '/p/c.txt' })
    ]
  })
}

describe('selection', () => {
  it('setSelection sets paths and anchor (default last path)', () => {
    store().setSelection(['/p/a.txt', '/p/b.txt'])
    expect([...store().selection]).toEqual(['/p/a.txt', '/p/b.txt'])
    expect(store().anchorPath).toBe('/p/b.txt')
  })

  it('setSelection uses explicit anchor when given', () => {
    store().setSelection(['/p/a.txt'], '/p/x')
    expect(store().anchorPath).toBe('/p/x')
  })

  it('setSelection with empty paths sets null anchor', () => {
    store().setSelection([])
    expect(store().anchorPath).toBeNull()
  })

  it('selectOne replaces the selection', () => {
    store().selectOne('/p/a.txt')
    expect([...store().selection]).toEqual(['/p/a.txt'])
    expect(store().anchorPath).toBe('/p/a.txt')
  })

  it('toggleSelect adds then removes', () => {
    store().toggleSelect('/p/a.txt')
    expect(store().selection.has('/p/a.txt')).toBe(true)
    store().toggleSelect('/p/a.txt')
    expect(store().selection.has('/p/a.txt')).toBe(false)
  })

  it('rangeSelectTo selects from anchor to target', () => {
    seedItems()
    useExplorerStore.setState({ anchorPath: '/p/a.txt' })
    store().rangeSelectTo('/p/c.txt')
    expect([...store().selection]).toEqual(['/p/a.txt', '/p/b.txt', '/p/c.txt'])
  })

  it('rangeSelectTo selects backwards when the anchor is below the target', () => {
    seedItems()
    useExplorerStore.setState({ anchorPath: '/p/c.txt' })
    store().rangeSelectTo('/p/a.txt')
    expect([...store().selection].sort()).toEqual(['/p/a.txt', '/p/b.txt', '/p/c.txt'])
  })

  it('rangeSelectTo with no anchor uses first visible item', () => {
    seedItems()
    useExplorerStore.setState({ anchorPath: null })
    store().rangeSelectTo('/p/b.txt')
    expect([...store().selection]).toEqual(['/p/a.txt', '/p/b.txt'])
  })

  it('rangeSelectTo with target not found selects only the target', () => {
    seedItems()
    useExplorerStore.setState({ anchorPath: '/p/a.txt' })
    store().rangeSelectTo('/p/missing')
    expect([...store().selection]).toEqual(['/p/missing'])
    expect(store().anchorPath).toBe('/p/missing')
  })

  it('selectAll selects all visible items', () => {
    seedItems()
    store().selectAll()
    expect(store().selection.size).toBe(3)
  })

  it('invertSelection flips the current selection', () => {
    seedItems()
    useExplorerStore.setState({ selection: new Set(['/p/a.txt']) })
    store().invertSelection()
    expect([...store().selection].sort()).toEqual(['/p/b.txt', '/p/c.txt'])
  })

  it('clearSelection empties selection and anchor', () => {
    useExplorerStore.setState({ selection: new Set(['/p/a.txt']), anchorPath: '/p/a.txt' })
    store().clearSelection()
    expect(store().selection.size).toBe(0)
    expect(store().anchorPath).toBeNull()
  })
})

describe('clipboard', () => {
  it('copySelection is a no-op when empty', () => {
    store().copySelection()
    expect(store().clipboard).toBeNull()
  })

  it('cutSelection is a no-op when empty', () => {
    store().cutSelection()
    expect(store().clipboard).toBeNull()
  })

  it('copySelection captures the selection in copy mode', () => {
    useExplorerStore.setState({ selection: new Set(['/p/a.txt']) })
    store().copySelection()
    expect(store().clipboard).toEqual({ paths: ['/p/a.txt'], mode: 'copy' })
  })

  it('cutSelection captures the selection in cut mode', () => {
    useExplorerStore.setState({ selection: new Set(['/p/a.txt']) })
    store().cutSelection()
    expect(store().clipboard).toEqual({ paths: ['/p/a.txt'], mode: 'cut' })
  })

  it('paste no-ops with no clipboard', async () => {
    useExplorerStore.setState({ currentPath: '/p', clipboard: null })
    await store().paste()
    expect(api.listConflicts).not.toHaveBeenCalled()
  })

  it('paste no-ops on the Home page', async () => {
    useExplorerStore.setState({ currentPath: HOME_PATH, clipboard: { paths: ['/x'], mode: 'copy' } })
    await store().paste()
    expect(api.listConflicts).not.toHaveBeenCalled()
  })

  it('paste of a cut clipboard performs a move clearing cut', async () => {
    useExplorerStore.setState({
      currentPath: '/dest',
      clipboard: { paths: ['/p/a.txt'], mode: 'cut' }
    })
    await store().paste()
    expect(api.move).toHaveBeenCalledWith(['/p/a.txt'], '/dest', 'keep-both')
    expect(store().clipboard).toBeNull()
  })

  it('paste of a copy clipboard performs a copy', async () => {
    useExplorerStore.setState({
      currentPath: '/dest',
      clipboard: { paths: ['/p/a.txt'], mode: 'copy' }
    })
    await store().paste()
    expect(api.copy).toHaveBeenCalledWith(['/p/a.txt'], '/dest', 'keep-both')
  })
})

describe('rename', () => {
  it('beginRename sets the rename target and selects it', () => {
    store().beginRename('/p/a.txt')
    expect(store().renamingPath).toBe('/p/a.txt')
    expect([...store().selection]).toEqual(['/p/a.txt'])
  })

  it('commitRename no-ops when there is no target', async () => {
    useExplorerStore.setState({ renamingPath: null })
    await store().commitRename('new')
    expect(api.rename).not.toHaveBeenCalled()
  })

  it('commitRename ignores an unchanged name', async () => {
    useExplorerStore.setState({ renamingPath: '/p/a.txt' })
    await store().commitRename('a.txt')
    expect(api.rename).not.toHaveBeenCalled()
    expect(store().renamingPath).toBeNull()
  })

  it('commitRename ignores a blank name', async () => {
    useExplorerStore.setState({ renamingPath: '/p/a.txt' })
    await store().commitRename('   ')
    expect(api.rename).not.toHaveBeenCalled()
  })

  it('commitRename flashes on failure', async () => {
    api.rename.mockResolvedValue({ ok: false, error: 'nope' })
    useExplorerStore.setState({ renamingPath: '/p/a.txt', currentPath: '/p' })
    await store().commitRename('b.txt')
    expect(store().statusMessage).toBe('nope')
  })

  it('commitRename flashes default error when none provided', async () => {
    api.rename.mockResolvedValue({ ok: false })
    useExplorerStore.setState({ renamingPath: '/p/a.txt', currentPath: '/p' })
    await store().commitRename('b.txt')
    expect(store().statusMessage).toBe('Rename failed')
  })

  it('commitRename records undo and selects the renamed item on success', async () => {
    api.rename.mockResolvedValue({ ok: true, data: makeFileItem({ name: 'b.txt', path: '/p/b.txt' }) })
    useExplorerStore.setState({ renamingPath: '/p/a.txt', currentPath: '/p' })
    await store().commitRename('b.txt')
    expect(store().undoStack.at(-1)).toEqual({ type: 'rename', from: '/p/a.txt', to: '/p/b.txt' })
    expect([...store().selection]).toEqual(['/p/b.txt'])
  })

  it('commitRename succeeds without data (no undo, no selection change)', async () => {
    api.rename.mockResolvedValue({ ok: true })
    useExplorerStore.setState({ renamingPath: '/p/a.txt', currentPath: '/p', selection: new Set() })
    await store().commitRename('b.txt')
    expect(store().undoStack.length).toBe(0)
  })

  it('cancelRename clears the rename target', () => {
    useExplorerStore.setState({ renamingPath: '/p/a.txt' })
    store().cancelRename()
    expect(store().renamingPath).toBeNull()
  })
})

describe('createFolder / createTextFile', () => {
  it('createFolder guards the Home page', async () => {
    useExplorerStore.setState({ currentPath: HOME_PATH })
    await store().createFolder()
    expect(store().statusMessage).toBe("Can't create items on the Home page")
    expect(api.createFolder).not.toHaveBeenCalled()
  })

  it('createFolder sets pendingRename and refreshes on success', async () => {
    api.createFolder.mockResolvedValue({ ok: true, data: makeFolder({ name: 'New folder', path: '/p/New folder' }) })
    useExplorerStore.setState({ currentPath: '/p' })
    await store().createFolder()
    expect(api.createFolder).toHaveBeenCalledWith('/p', 'New folder')
    expect(api.readDirectory).toHaveBeenCalledWith('/p')
  })

  it('createFolder flashes on failure', async () => {
    api.createFolder.mockResolvedValue({ ok: false, error: 'denied' })
    useExplorerStore.setState({ currentPath: '/p' })
    await store().createFolder()
    expect(store().statusMessage).toBe('denied')
  })

  it('createFolder flashes default error when none provided', async () => {
    api.createFolder.mockResolvedValue({ ok: false })
    useExplorerStore.setState({ currentPath: '/p' })
    await store().createFolder()
    expect(store().statusMessage).toBe('Could not create folder')
  })

  it('createTextFile guards the Home page', async () => {
    useExplorerStore.setState({ currentPath: HOME_PATH })
    await store().createTextFile()
    expect(store().statusMessage).toBe("Can't create items on the Home page")
    expect(api.createTextFile).not.toHaveBeenCalled()
  })

  it('createTextFile sets pendingRename and refreshes on success', async () => {
    api.createTextFile.mockResolvedValue({ ok: true, data: makeFileItem({ name: 'New Text Document.txt', path: '/p/New Text Document.txt' }) })
    useExplorerStore.setState({ currentPath: '/p' })
    await store().createTextFile()
    expect(api.createTextFile).toHaveBeenCalledWith('/p', 'New Text Document.txt')
  })

  it('createTextFile flashes on failure', async () => {
    api.createTextFile.mockResolvedValue({ ok: false, error: 'nope' })
    useExplorerStore.setState({ currentPath: '/p' })
    await store().createTextFile()
    expect(store().statusMessage).toBe('nope')
  })

  it('createTextFile flashes default error when none provided', async () => {
    api.createTextFile.mockResolvedValue({ ok: false })
    useExplorerStore.setState({ currentPath: '/p' })
    await store().createTextFile()
    expect(store().statusMessage).toBe('Could not create file')
  })
})

describe('deleteSelection', () => {
  it('no-ops when nothing is selected', async () => {
    useExplorerStore.setState({ selection: new Set() })
    await store().deleteSelection()
    expect(api.moveToTrash).not.toHaveBeenCalled()
  })

  it('trashes the selection and refreshes', async () => {
    api.moveToTrash.mockResolvedValue({ ok: true })
    useExplorerStore.setState({ currentPath: '/p', selection: new Set(['/p/a.txt']) })
    await store().deleteSelection()
    expect(api.moveToTrash).toHaveBeenCalledWith(['/p/a.txt'])
    expect(store().selection.size).toBe(0)
  })

  it('flashes on failure', async () => {
    api.moveToTrash.mockResolvedValue({ ok: false, error: 'busy' })
    useExplorerStore.setState({ currentPath: '/p', selection: new Set(['/p/a.txt']) })
    await store().deleteSelection()
    expect(store().statusMessage).toBe('busy')
  })

  it('flashes default error when none provided', async () => {
    api.moveToTrash.mockResolvedValue({ ok: false })
    useExplorerStore.setState({ currentPath: '/p', selection: new Set(['/p/a.txt']) })
    await store().deleteSelection()
    expect(store().statusMessage).toBe('Delete failed')
  })
})

describe('revealSelectionInFinder', () => {
  it('reveals the first selected path', () => {
    useExplorerStore.setState({ selection: new Set(['/p/a.txt']) })
    store().revealSelectionInFinder()
    expect(api.revealInFinder).toHaveBeenCalledWith('/p/a.txt')
  })

  it('falls back to the current path when nothing is selected', () => {
    useExplorerStore.setState({ selection: new Set(), currentPath: '/p' })
    store().revealSelectionInFinder()
    expect(api.revealInFinder).toHaveBeenCalledWith('/p')
  })
})

describe('search', () => {
  it('setSearchQuery updates the query', () => {
    store().setSearchQuery('hello')
    expect(store().searchQuery).toBe('hello')
  })

  it('runSearch with an empty query clears search', async () => {
    useExplorerStore.setState({ searchQuery: '   ', currentPath: '/p', isSearchResults: true })
    await store().runSearch()
    expect(store().isSearchResults).toBe(false)
    expect(api.search).not.toHaveBeenCalled()
  })

  it('runSearch sets results on success', async () => {
    const hit = makeFileItem({ name: 'hit', path: '/p/hit' })
    api.search.mockResolvedValue({ ok: true, data: [hit] })
    useExplorerStore.setState({ searchQuery: 'hit', currentPath: '/p' })
    await store().runSearch()
    expect(store().items).toEqual([hit])
    expect(store().isSearchResults).toBe(true)
  })

  it('runSearch sets error on failure', async () => {
    api.search.mockResolvedValue({ ok: false, error: 'no', code: 'EX' })
    useExplorerStore.setState({ searchQuery: 'hit', currentPath: '/p' })
    await store().runSearch()
    expect(store().items).toEqual([])
    expect(store().error).toBe('no')
    expect(store().errorCode).toBe('EX')
  })

  it('runSearch uses default error message when none provided', async () => {
    api.search.mockResolvedValue({ ok: false })
    useExplorerStore.setState({ searchQuery: 'hit', currentPath: '/p' })
    await store().runSearch()
    expect(store().error).toBe('Search failed')
    expect(store().errorCode).toBeNull()
  })

  it('runSearch drops a stale result when superseded', async () => {
    let resolveFirst!: (v: Result<FileItem[]>) => void
    api.search.mockImplementationOnce(() => new Promise<Result<FileItem[]>>((res) => { resolveFirst = res }))
    api.search.mockResolvedValueOnce({ ok: true, data: [makeFileItem({ name: 'fresh', path: '/p/fresh' })] })
    useExplorerStore.setState({ searchQuery: 'a', currentPath: '/p' })
    const p1 = store().runSearch()
    const p2 = store().runSearch()
    await p2
    resolveFirst({ ok: true, data: [makeFileItem({ name: 'stale', path: '/p/stale' })] })
    await p1
    expect(store().items.map((i) => i.name)).toEqual(['fresh'])
  })

  it('clearSearch resets and reloads the directory', async () => {
    useExplorerStore.setState({ searchQuery: 'q', isSearchResults: true, currentPath: '/p' })
    store().clearSearch()
    expect(store().searchQuery).toBe('')
    expect(store().isSearchResults).toBe(false)
    expect(api.readDirectory).toHaveBeenCalledWith('/p')
  })
})

describe('context menu and status', () => {
  it('openContextMenu and closeContextMenu', () => {
    store().openContextMenu(10, 20, '/p/a.txt')
    expect(store().contextMenu).toEqual({ x: 10, y: 20, targetPath: '/p/a.txt' })
    store().closeContextMenu()
    expect(store().contextMenu).toBeNull()
  })

  it('flashStatus sets the message', () => {
    store().flashStatus('hi')
    expect(store().statusMessage).toBe('hi')
  })
})

describe('view / panel preferences', () => {
  it('setViewMode updates and closes the context menu', () => {
    useExplorerStore.setState({ contextMenu: { x: 0, y: 0, targetPath: null } })
    store().setViewMode('list')
    expect(store().viewMode).toBe('list')
    expect(store().contextMenu).toBeNull()
  })

  it('setSort toggles direction for the same key', () => {
    useExplorerStore.setState({ sortKey: 'name', sortDir: 'asc' })
    store().setSort('name')
    expect(store().sortDir).toBe('desc')
    store().setSort('name')
    expect(store().sortDir).toBe('asc')
  })

  it('setSort switches key and resets to asc', () => {
    useExplorerStore.setState({ sortKey: 'name', sortDir: 'desc' })
    store().setSort('size')
    expect(store().sortKey).toBe('size')
    expect(store().sortDir).toBe('asc')
  })

  it('toggleShowHidden flips the flag', () => {
    useExplorerStore.setState({ showHidden: false })
    store().toggleShowHidden()
    expect(store().showHidden).toBe(true)
  })

  it('setGroupBy updates and closes the context menu', () => {
    useExplorerStore.setState({ contextMenu: { x: 0, y: 0, targetPath: null } })
    store().setGroupBy('size')
    expect(store().groupBy).toBe('size')
    expect(store().contextMenu).toBeNull()
  })

  it('setColumnWidth clamps to a minimum of 60 and rounds', () => {
    store().setColumnWidth('name', 10.6)
    expect(store().columnWidths.name).toBe(60)
    store().setColumnWidth('size', 123.4)
    expect(store().columnWidths.size).toBe(123)
  })

  it('togglePreview flips the flag', () => {
    useExplorerStore.setState({ previewOpen: false })
    store().togglePreview()
    expect(store().previewOpen).toBe(true)
  })
})

describe('quick access pins', () => {
  it('pins a path once and reports it pinned', () => {
    store().pinToQuickAccess('/p', 'P')
    expect(store().isPinned('/p')).toBe(true)
    // pinning again is a no-op
    store().pinToQuickAccess('/p', 'P')
    expect(store().pinnedLinks.length).toBe(1)
  })

  it('unpins a path', () => {
    store().pinToQuickAccess('/p', 'P')
    store().unpinFromQuickAccess('/p')
    expect(store().isPinned('/p')).toBe(false)
  })
})

describe('recents and favorites', () => {
  it('recordRecent skips HOME_PATH', () => {
    store().recordRecent(HOME_PATH)
    expect(store().recents).toEqual([])
  })

  it('recordRecent prepends and dedupes, capping at MAX_RECENTS', () => {
    store().recordRecent('/a')
    store().recordRecent('/b')
    store().recordRecent('/a')
    expect(store().recents).toEqual(['/a', '/b'])

    for (let i = 0; i < 40; i++) store().recordRecent(`/x${i}`)
    expect(store().recents.length).toBe(30)
    expect(store().recents[0]).toBe('/x39')
  })

  it('removeRecent removes a path', () => {
    useExplorerStore.setState({ recents: ['/a', '/b'] })
    store().removeRecent('/a')
    expect(store().recents).toEqual(['/b'])
  })

  it('clearRecents empties the list', () => {
    useExplorerStore.setState({ recents: ['/a'] })
    store().clearRecents()
    expect(store().recents).toEqual([])
  })

  it('addFavorite skips HOME_PATH', () => {
    store().addFavorite(HOME_PATH)
    expect(store().favorites).toEqual([])
  })

  it('addFavorite prepends and dedupes', () => {
    store().addFavorite('/a')
    store().addFavorite('/a')
    store().addFavorite('/b')
    expect(store().favorites).toEqual(['/b', '/a'])
    expect(store().isFavorite('/a')).toBe(true)
  })

  it('removeFavorite removes a path', () => {
    useExplorerStore.setState({ favorites: ['/a', '/b'] })
    store().removeFavorite('/a')
    expect(store().favorites).toEqual(['/b'])
    expect(store().isFavorite('/a')).toBe(false)
  })
})
