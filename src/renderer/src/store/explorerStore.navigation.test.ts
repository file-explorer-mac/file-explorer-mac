import { describe, it, expect, beforeEach } from 'vitest'
import { useExplorerStore } from './explorerStore'
import { HOME_PATH } from '@/utils/pathUtils'
import { resetExplorerStore } from '@test/storeHelpers'
import { installApiMock, type ApiMock } from '@test/apiMock'
import { makeFileItem, makeQuickLink, makeDrive } from '@test/factories'
import type { FileItem, OpProgress, Result } from '@shared/types'

let api: ApiMock
beforeEach(() => {
  resetExplorerStore()
  api = installApiMock()
})

const store = (): ReturnType<typeof useExplorerStore.getState> => useExplorerStore.getState()

describe('init', () => {
  it('subscribes to op progress once, remaps the home link, and keeps others', async () => {
    // The very first init in this file subscribes (progressSubscribed starts
    // false for this module instance); capture the callback to exercise it.
    let cb: ((p: OpProgress) => void) | undefined
    api.onOpProgress.mockImplementation((fn: (p: OpProgress) => void) => {
      cb = fn
      return () => {}
    })
    api.getHomeDir.mockResolvedValue('/Users/me')
    api.getQuickLinks.mockResolvedValue([
      makeQuickLink({ name: 'Home', icon: 'home', path: '/Users/me' }),
      // A non-home link is left untouched (the `: l` branch of the remap).
      makeQuickLink({ name: 'Docs', icon: 'documents', path: '/Users/me/Documents' })
    ])
    api.getDrives.mockResolvedValue([makeDrive()])
    api.startDir = ''
    await store().init()
    const s = store()
    expect(s.homeDir).toBe('/Users/me')
    // home-icon link remapped to HOME_PATH; the documents link is unchanged.
    expect(s.quickLinks[0].path).toBe(HOME_PATH)
    expect(s.quickLinks[1].path).toBe('/Users/me/Documents')
    expect(s.currentPath).toBe(HOME_PATH)
    expect(api.onOpProgress).toHaveBeenCalledTimes(1)

    // The progress callback pipes into operation state.
    expect(cb).toBeDefined()
    cb!({ op: 'copy', done: 1, total: 2, name: 'x' })
    expect(store().operation).toEqual({ op: 'copy', done: 1, total: 2, name: 'x' })

    // A second init does not re-subscribe (progressSubscribed module flag).
    await store().init()
    expect(api.onOpProgress).toHaveBeenCalledTimes(1)
  })

  it('falls back to the first tab when the active tab id is unknown (activeTab guard)', async () => {
    // Drives the `?? state.tabs[0]` fallback in activeTab via canGoBack.
    useExplorerStore.setState({ activeTabId: 'ghost' })
    expect(store().canGoBack()).toBe(false)
    expect(store().canGoForward()).toBe(false)
  })

  it('navigateTo falls back to the first tab when active id is unknown', async () => {
    useExplorerStore.setState({ activeTabId: 'ghost' })
    await store().navigateTo('/x')
    expect(store().currentPath).toBe('/x')
  })

  it('uses startDir when it exists', async () => {
    api.startDir = '/Users/me/Documents'
    api.pathExists.mockResolvedValue(true)
    api.readDirectory.mockResolvedValue({ ok: true, data: [] })
    await store().init()
    expect(store().currentPath).toBe('/Users/me/Documents')
    expect(api.pathExists).toHaveBeenCalledWith('/Users/me/Documents')
  })

  it('falls back to home when startDir does not exist', async () => {
    api.startDir = '/nope'
    api.pathExists.mockResolvedValue(false)
    await store().init()
    expect(store().currentPath).toBe(HOME_PATH)
  })
})

describe('loadDir', () => {
  it('short-circuits HOME_PATH to an empty listing', async () => {
    useExplorerStore.setState({ items: [makeFileItem()], pendingRenamePath: 'x' })
    await store().loadDir(HOME_PATH)
    expect(store().items).toEqual([])
    expect(store().pendingRenamePath).toBeNull()
    expect(api.readDirectory).not.toHaveBeenCalled()
  })

  it('loads directory contents on success', async () => {
    const item = makeFileItem({ name: 'a.txt', path: '/p/a.txt' })
    api.readDirectory.mockResolvedValue({ ok: true, data: [item] })
    await store().loadDir('/p')
    expect(store().items).toEqual([item])
    expect(store().loading).toBe(false)
    expect(store().error).toBeNull()
  })

  it('sets error state on failure', async () => {
    api.readDirectory.mockResolvedValue({ ok: false, error: 'denied', code: 'EPERM' })
    await store().loadDir('/p')
    expect(store().items).toEqual([])
    expect(store().error).toBe('denied')
    expect(store().errorCode).toBe('EPERM')
  })

  it('uses default error message and null code when absent', async () => {
    api.readDirectory.mockResolvedValue({ ok: false })
    await store().loadDir('/p')
    expect(store().error).toBe('Unable to open this location.')
    expect(store().errorCode).toBeNull()
  })

  it('enters rename mode for a pending created item that exists', async () => {
    const created = makeFileItem({ name: 'New', path: '/p/New' })
    api.readDirectory.mockResolvedValue({ ok: true, data: [created] })
    useExplorerStore.setState({ pendingRenamePath: '/p/New' })
    await store().loadDir('/p')
    expect(store().renamingPath).toBe('/p/New')
    expect(store().pendingRenamePath).toBeNull()
    expect([...store().selection]).toEqual(['/p/New'])
  })

  it('clears pending rename when created item is absent', async () => {
    const other = makeFileItem({ name: 'other', path: '/p/other' })
    api.readDirectory.mockResolvedValue({ ok: true, data: [other] })
    const existingSel = new Set(['/p/keep'])
    useExplorerStore.setState({ pendingRenamePath: '/p/missing', selection: existingSel })
    await store().loadDir('/p')
    expect(store().renamingPath).toBeNull()
    expect(store().pendingRenamePath).toBeNull()
    // selection preserved (uses current selection)
    expect([...store().selection]).toEqual(['/p/keep'])
  })

  it('drops a stale load when a newer load supersedes it', async () => {
    let resolveFirst!: (v: Result<FileItem[]>) => void
    api.readDirectory.mockImplementationOnce(
      () => new Promise<Result<FileItem[]>>((res) => { resolveFirst = res })
    )
    const firstItem = makeFileItem({ name: 'stale', path: '/p/stale' })
    const secondItem = makeFileItem({ name: 'fresh', path: '/q/fresh' })
    api.readDirectory.mockResolvedValueOnce({ ok: true, data: [secondItem] })

    const p1 = store().loadDir('/p')
    const p2 = store().loadDir('/q')
    await p2
    // Now resolve the first (stale) load.
    resolveFirst({ ok: true, data: [firstItem] })
    await p1
    // The fresh result wins; stale is dropped.
    expect(store().items).toEqual([secondItem])
  })
})

describe('refresh', () => {
  it('re-runs search when showing search results', async () => {
    api.search.mockResolvedValue({ ok: true, data: [makeFileItem({ name: 's', path: '/p/s' })] })
    useExplorerStore.setState({ isSearchResults: true, searchQuery: 'foo', currentPath: '/p' })
    await store().refresh()
    expect(api.search).toHaveBeenCalledWith('/p', 'foo')
  })

  it('re-loads the directory when not showing search results', async () => {
    useExplorerStore.setState({ isSearchResults: false, currentPath: '/p' })
    await store().refresh()
    expect(api.readDirectory).toHaveBeenCalledWith('/p')
  })
})

describe('navigateTo', () => {
  it('pushes onto history and resets transient state', async () => {
    useExplorerStore.setState({
      selection: new Set(['x']),
      isSearchResults: true,
      searchQuery: 'q'
    })
    await store().navigateTo('/a')
    const tab = store().tabs.find((t) => t.id === store().activeTabId)!
    expect(tab.history[tab.index]).toBe('/a')
    expect(store().currentPath).toBe('/a')
    expect([...store().selection]).toEqual([])
    expect(store().isSearchResults).toBe(false)
    expect(store().searchQuery).toBe('')
  })

  it('replaces the current history entry when replace is set', async () => {
    await store().navigateTo('/a')
    const before = store().tabs.find((t) => t.id === store().activeTabId)!.history.length
    await store().navigateTo('/b', { replace: true })
    const tab = store().tabs.find((t) => t.id === store().activeTabId)!
    expect(tab.history.length).toBe(before)
    expect(tab.history[tab.index]).toBe('/b')
  })

  it('truncates forward history on a fresh push', async () => {
    await store().navigateTo('/a')
    await store().navigateTo('/b')
    store().goBack()
    await store().navigateTo('/c')
    const tab = store().tabs.find((t) => t.id === store().activeTabId)!
    expect(tab.history).toEqual([HOME_PATH, '/a', '/c'])
  })
})

describe('goBack / goForward / goUp and guards', () => {
  it('goBack does nothing at the start of history', () => {
    expect(store().canGoBack()).toBe(false)
    store().goBack()
    expect(store().currentPath).toBe(HOME_PATH)
  })

  it('goBack and goForward move through history', async () => {
    await store().navigateTo('/a')
    await store().navigateTo('/b')
    expect(store().canGoBack()).toBe(true)
    store().goBack()
    expect(store().currentPath).toBe('/a')
    expect(store().canGoForward()).toBe(true)
    store().goForward()
    expect(store().currentPath).toBe('/b')
  })

  it('goBack/goForward leave other tabs untouched (ternary else branch)', async () => {
    // A background tab exists so the history map hits the non-active `: t` branch.
    store().newTab('/other') // active = tab2
    await store().navigateTo('/a')
    await store().navigateTo('/b')
    const bgId = store().tabs[0].id
    const bgBefore = store().tabs.find((t) => t.id === bgId)!.index
    store().goBack()
    expect(store().tabs.find((t) => t.id === bgId)!.index).toBe(bgBefore)
    store().goForward()
    expect(store().tabs.find((t) => t.id === bgId)!.index).toBe(bgBefore)
  })

  it('goForward does nothing at the end of history', async () => {
    await store().navigateTo('/a')
    expect(store().canGoForward()).toBe(false)
    store().goForward()
    expect(store().currentPath).toBe('/a')
  })

  it('goUp navigates to parent', async () => {
    await store().navigateTo('/Users/me/docs')
    store().goUp()
    expect(store().currentPath).toBe('/Users/me')
  })

  it('goUp does nothing on the Home page', async () => {
    await store().navigateTo(HOME_PATH)
    store().goUp()
    expect(store().currentPath).toBe(HOME_PATH)
  })

  it('goUp does nothing at the root (parent === current)', async () => {
    await store().navigateTo('/')
    store().goUp()
    expect(store().currentPath).toBe('/')
  })

  it('canGoUp is false at root and home, true elsewhere', async () => {
    await store().navigateTo('/')
    expect(store().canGoUp()).toBe(false)
    await store().navigateTo(HOME_PATH)
    expect(store().canGoUp()).toBe(false)
    await store().navigateTo('/Users/me')
    expect(store().canGoUp()).toBe(true)
  })
})

describe('tabs', () => {
  it('newTab adds a tab defaulting to HOME_PATH and activates it', () => {
    store().newTab()
    const s = store()
    expect(s.tabs.length).toBe(2)
    expect(s.currentPath).toBe(HOME_PATH)
    expect(s.activeTabId).toBe(s.tabs[1].id)
  })

  it('newTab honors a provided path', () => {
    store().newTab('/Users/me')
    expect(store().currentPath).toBe('/Users/me')
  })

  it('closeTab on the last tab closes the window', () => {
    const id = store().tabs[0].id
    store().closeTab(id)
    expect(api.windowClose).toHaveBeenCalled()
  })

  it('closeTab on a background tab leaves the active view alone', () => {
    store().newTab('/a') // tab2 active
    const active = store().activeTabId
    const bg = store().tabs[0].id
    useExplorerStore.setState({ selection: new Set(['keep']) })
    store().closeTab(bg)
    expect(store().activeTabId).toBe(active)
    expect([...store().selection]).toEqual(['keep'])
    expect(store().tabs.length).toBe(1)
  })

  it('closeTab on the active tab switches to the next', () => {
    store().newTab('/a') // tab2
    store().newTab('/b') // tab3 active
    const activeId = store().activeTabId
    store().closeTab(activeId)
    // After removing tab3 (idx 2), next = tabs[min(2,1)] = tab2 ('/a')
    expect(store().currentPath).toBe('/a')
  })

  it('setActiveTab no-ops on the same id', () => {
    const id = store().activeTabId
    store().setActiveTab(id)
    expect(store().activeTabId).toBe(id)
  })

  it('setActiveTab no-ops on a missing id', () => {
    const id = store().activeTabId
    store().setActiveTab('does-not-exist')
    expect(store().activeTabId).toBe(id)
  })

  it('setActiveTab switches and loads the tab path', () => {
    store().newTab('/a') // tab2 active
    const first = store().tabs[0].id
    store().setActiveTab(first)
    expect(store().activeTabId).toBe(first)
    expect(store().currentPath).toBe(HOME_PATH)
  })
})

describe('openItem', () => {
  it('navigates and records a recent for a directory', async () => {
    const dir = makeFileItem({ name: 'docs', path: '/Users/me/docs', isDirectory: true })
    await store().openItem(dir)
    expect(store().currentPath).toBe('/Users/me/docs')
    expect(store().recents).toContain('/Users/me/docs')
  })

  it('opens a file via openPath', async () => {
    api.openPath.mockResolvedValue({ ok: true })
    const file = makeFileItem({ name: 'a.txt', path: '/p/a.txt' })
    await store().openItem(file)
    expect(api.openPath).toHaveBeenCalledWith('/p/a.txt')
  })

  it('flashes a status message when opening a file fails', async () => {
    api.openPath.mockResolvedValue({ ok: false, error: 'boom' })
    const file = makeFileItem({ name: 'a.txt', path: '/p/a.txt' })
    await store().openItem(file)
    expect(store().statusMessage).toBe('boom')
  })

  it('uses a default error message when openPath fails without one', async () => {
    api.openPath.mockResolvedValue({ ok: false })
    const file = makeFileItem({ name: 'a.txt', path: '/p/a.txt' })
    await store().openItem(file)
    expect(store().statusMessage).toBe('Could not open file')
  })
})
