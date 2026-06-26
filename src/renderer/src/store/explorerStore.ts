import { create } from 'zustand'
import type { ConflictPolicy, DriveItem, FileItem, OpProgress, QuickLink } from '@shared/types'
import { kindLabel } from '@shared/fileKinds'
import { basename, parentPath, HOME_PATH } from '@/utils/pathUtils'

export type ViewMode =
  | 'extra-large'
  | 'large'
  | 'medium'
  | 'small'
  | 'list'
  | 'details'
  | 'tiles'

export type SortKey = 'name' | 'modified' | 'type' | 'size'
export type SortDir = 'asc' | 'desc'
export type GroupKey = 'none' | 'name' | 'type' | 'modified' | 'size'

/** A reversible file operation for Undo (Ctrl/Cmd+Z). */
export type UndoEntry =
  | { type: 'rename'; from: string; to: string }
  | { type: 'move'; moves: { from: string; to: string }[] }
  | { type: 'copy'; created: string[] }

export interface PendingTransfer {
  srcPaths: string[]
  destDir: string
  op: 'copy' | 'move'
  conflicts: string[]
  clearCut: boolean
}

/** Persisted user preferences (localStorage). */
interface Prefs {
  pinnedLinks: QuickLink[]
  previewOpen: boolean
  groupBy: GroupKey
  columnWidths: Record<string, number>
  viewMode: ViewMode
  sortKey: SortKey
  sortDir: SortDir
  showHidden: boolean
  /** Absolute paths of recently opened files/folders, most-recent first. */
  recents: string[]
  /** Absolute paths the user pinned to the Home "Favorites" tab. */
  favorites: string[]
}

/** How many recently opened items to remember on the Home page. */
const MAX_RECENTS = 30

const PREFS_KEY = 'fe.prefs.v1'

function loadPrefs(): Partial<Prefs> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') as Partial<Prefs>
  } catch {
    return {}
  }
}

function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {
    /* storage unavailable */
  }
}

export interface Tab {
  id: string
  history: string[]
  index: number
}

export interface Clipboard {
  paths: string[]
  mode: 'copy' | 'cut'
}

export interface ContextMenuState {
  x: number
  y: number
  /** Path the menu was opened on; null = empty area (background) menu. */
  targetPath: string | null
}

interface ExplorerState {
  // Navigation
  tabs: Tab[]
  activeTabId: string
  currentPath: string

  // Directory contents
  items: FileItem[]
  loading: boolean
  error: string | null
  /** errno code of the last failed load (e.g. 'EPERM'/'EACCES' = TCC denial). */
  errorCode: string | null

  // Sidebar data
  quickLinks: QuickLink[]
  drives: DriveItem[]
  homeDir: string

  // View settings
  viewMode: ViewMode
  sortKey: SortKey
  sortDir: SortDir
  showHidden: boolean
  groupBy: GroupKey
  columnWidths: Record<string, number>

  // Panels & pins
  previewOpen: boolean
  pinnedLinks: QuickLink[]

  // Home page ("Home" with Recent + Favorites tabs)
  recents: string[]
  favorites: string[]

  // File-operation infrastructure
  undoStack: UndoEntry[]
  pendingTransfer: PendingTransfer | null
  operation: OpProgress | null
  propertiesPath: string | null

  // Selection (set of absolute paths)
  selection: Set<string>
  /** Anchor for shift-range selection. */
  anchorPath: string | null

  // Clipboard
  clipboard: Clipboard | null

  // Search
  searchQuery: string
  isSearchResults: boolean

  // Inline rename
  renamingPath: string | null
  /** A freshly created item to auto-enter rename on once it appears. */
  pendingRenamePath: string | null

  // Context menu
  contextMenu: ContextMenuState | null

  // Status flash message
  statusMessage: string | null

  // ---- actions ----
  init: () => Promise<void>
  loadDir: (path: string) => Promise<void>
  refresh: () => Promise<void>
  navigateTo: (path: string, opts?: { replace?: boolean }) => Promise<void>
  goBack: () => void
  goForward: () => void
  goUp: () => void
  canGoBack: () => boolean
  canGoForward: () => boolean
  canGoUp: () => boolean

  newTab: (path?: string) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void

  setViewMode: (mode: ViewMode) => void
  setSort: (key: SortKey) => void
  toggleShowHidden: () => void

  setSelection: (paths: string[], anchor?: string | null) => void
  selectOne: (path: string) => void
  toggleSelect: (path: string) => void
  rangeSelectTo: (path: string) => void
  selectAll: () => void
  invertSelection: () => void
  clearSelection: () => void

  openItem: (item: FileItem) => Promise<void>

  copySelection: () => void
  cutSelection: () => void
  paste: () => Promise<void>

  beginRename: (path: string) => void
  commitRename: (newName: string) => Promise<void>
  cancelRename: () => void

  createFolder: () => Promise<void>
  createTextFile: () => Promise<void>
  deleteSelection: () => Promise<void>
  revealSelectionInFinder: () => void

  setSearchQuery: (q: string) => void
  runSearch: () => Promise<void>
  clearSearch: () => void

  openContextMenu: (x: number, y: number, targetPath: string | null) => void
  closeContextMenu: () => void

  flashStatus: (msg: string) => void

  // View/panel preferences
  setGroupBy: (key: GroupKey) => void
  setColumnWidth: (col: string, width: number) => void
  togglePreview: () => void

  // Quick access pins
  pinToQuickAccess: (path: string, name: string) => void
  unpinFromQuickAccess: (path: string) => void
  isPinned: (path: string) => boolean

  // Home page: recently opened items + favorites
  recordRecent: (path: string) => void
  removeRecent: (path: string) => void
  clearRecents: () => void
  addFavorite: (path: string) => void
  removeFavorite: (path: string) => void
  isFavorite: (path: string) => boolean

  // Conflict-aware transfers + undo
  performTransfer: (
    srcPaths: string[],
    destDir: string,
    op: 'copy' | 'move',
    clearCut?: boolean
  ) => Promise<void>
  doTransfer: (
    srcPaths: string[],
    destDir: string,
    op: 'copy' | 'move',
    policy: ConflictPolicy,
    clearCut: boolean
  ) => Promise<void>
  resolveConflict: (policy: ConflictPolicy | 'cancel') => Promise<void>
  recordUndo: (entry: UndoEntry) => void
  undo: () => Promise<void>

  // Archive + open actions
  compressSelection: () => Promise<void>
  extractSelection: () => Promise<void>
  openWithSelection: () => Promise<void>
  openTerminalHere: () => void
  copyPathSelection: () => void

  // Properties dialog
  openProperties: (path?: string) => void
  closeProperties: () => void
}

let tabCounter = 0
const newTabId = (): string => `tab-${++tabCounter}`

// Monotonic token: every items-producing async op (loadDir/runSearch) bumps it,
// and only the most recent op is allowed to commit results. Kills stale-load races.
let loadSeq = 0

function activeTab(state: ExplorerState): Tab {
  return state.tabs.find((t) => t.id === state.activeTabId) ?? state.tabs[0]
}

const initialPrefs = loadPrefs()
let progressSubscribed = false

/** Persist the subset of state we remember across launches. */
function persist(s: ExplorerState): void {
  savePrefs({
    pinnedLinks: s.pinnedLinks,
    previewOpen: s.previewOpen,
    groupBy: s.groupBy,
    columnWidths: s.columnWidths,
    viewMode: s.viewMode,
    sortKey: s.sortKey,
    sortDir: s.sortDir,
    showHidden: s.showHidden,
    recents: s.recents,
    favorites: s.favorites
  })
}

export const useExplorerStore = create<ExplorerState>((set, get) => ({
  tabs: [{ id: newTabId(), history: [HOME_PATH], index: 0 }],
  activeTabId: 'tab-1',
  currentPath: HOME_PATH,

  items: [],
  loading: false,
  error: null,
  errorCode: null,

  quickLinks: [],
  drives: [],
  homeDir: '',

  viewMode: initialPrefs.viewMode ?? 'details',
  sortKey: initialPrefs.sortKey ?? 'name',
  sortDir: initialPrefs.sortDir ?? 'asc',
  showHidden: initialPrefs.showHidden ?? false,
  groupBy: initialPrefs.groupBy ?? 'none',
  columnWidths: initialPrefs.columnWidths ?? {},

  previewOpen: initialPrefs.previewOpen ?? false,
  pinnedLinks: initialPrefs.pinnedLinks ?? [],

  recents: initialPrefs.recents ?? [],
  favorites: initialPrefs.favorites ?? [],

  undoStack: [],
  pendingTransfer: null,
  operation: null,
  propertiesPath: null,

  selection: new Set<string>(),
  anchorPath: null,

  clipboard: null,

  searchQuery: '',
  isSearchResults: false,

  renamingPath: null,
  pendingRenamePath: null,

  contextMenu: null,
  statusMessage: null,

  init: async () => {
    if (!progressSubscribed) {
      progressSubscribed = true
      window.api.onOpProgress((p) => set({ operation: p }))
    }
    const [homeDir, rawQuickLinks, drives] = await Promise.all([
      window.api.getHomeDir(),
      window.api.getQuickLinks(),
      window.api.getDrives()
    ])
    // The "Home" shortcut points at the virtual Home page, not the home folder
    // (Home is a landing page, not a directory).
    const quickLinks = rawQuickLinks.map((l) =>
      l.icon === 'home' ? { ...l, path: HOME_PATH } : l
    )
    // Seed the first tab at the Home page (or FE_START_DIR when provided & valid).
    let startPath = HOME_PATH
    const desired = window.api.startDir
    if (desired && (await window.api.pathExists(desired))) startPath = desired
    set((s) => {
      const tab = activeTab(s)
      tab.history = [startPath]
      tab.index = 0
      return { homeDir, quickLinks, drives, currentPath: startPath, tabs: [...s.tabs] }
    })
    await get().loadDir(startPath)
  },

  loadDir: async (path) => {
    // Bump the token first so any in-flight real load is discarded when we land
    // on the virtual Home page (which has no directory to read).
    const seq = ++loadSeq
    if (path === HOME_PATH) {
      set({ items: [], loading: false, error: null, errorCode: null, pendingRenamePath: null })
      return
    }
    set({ loading: true, error: null, errorCode: null })
    const res = await window.api.readDirectory(path)
    // A newer load or search has superseded this one — drop the stale result.
    if (seq !== loadSeq) return
    if (res.ok && res.data) {
      set({ items: res.data, loading: false, error: null, errorCode: null })
      // If we just created an item, drop into rename mode for it.
      const pending = get().pendingRenamePath
      if (pending) {
        const exists = res.data.some((i) => i.path === pending)
        set({
          renamingPath: exists ? pending : null,
          pendingRenamePath: null,
          selection: exists ? new Set([pending]) : get().selection
        })
      }
    } else {
      set({
        items: [],
        loading: false,
        error: res.error ?? 'Unable to open this location.',
        errorCode: res.code ?? null
      })
    }
  },

  refresh: async () => {
    const { currentPath, isSearchResults } = get()
    if (isSearchResults) {
      await get().runSearch()
    } else {
      await get().loadDir(currentPath)
    }
  },

  navigateTo: async (path, opts) => {
    const replace = opts?.replace ?? false
    set((s) => {
      const tabs = s.tabs.map((t) => ({ ...t, history: [...t.history] }))
      const tab = tabs.find((t) => t.id === s.activeTabId) ?? tabs[0]
      if (replace) {
        tab.history[tab.index] = path
      } else {
        tab.history = tab.history.slice(0, tab.index + 1)
        tab.history.push(path)
        tab.index = tab.history.length - 1
      }
      return {
        tabs,
        currentPath: path,
        selection: new Set<string>(),
        anchorPath: null,
        isSearchResults: false,
        searchQuery: '',
        renamingPath: null,
        contextMenu: null
      }
    })
    await get().loadDir(path)
  },

  goBack: () => {
    const s = get()
    const tab = activeTab(s)
    if (tab.index <= 0) return
    const tabs = s.tabs.map((t) => (t.id === tab.id ? { ...t, index: t.index - 1 } : t))
    const path = tab.history[tab.index - 1]
    set({ tabs, currentPath: path, selection: new Set(), isSearchResults: false, searchQuery: '' })
    void get().loadDir(path)
  },

  goForward: () => {
    const s = get()
    const tab = activeTab(s)
    if (tab.index >= tab.history.length - 1) return
    const tabs = s.tabs.map((t) => (t.id === tab.id ? { ...t, index: t.index + 1 } : t))
    const path = tab.history[tab.index + 1]
    set({ tabs, currentPath: path, selection: new Set(), isSearchResults: false, searchQuery: '' })
    void get().loadDir(path)
  },

  goUp: () => {
    const { currentPath } = get()
    if (currentPath === HOME_PATH) return
    const parent = parentPath(currentPath)
    if (parent !== currentPath) void get().navigateTo(parent)
  },

  canGoBack: () => activeTab(get()).index > 0,
  canGoForward: () => {
    const t = activeTab(get())
    return t.index < t.history.length - 1
  },
  canGoUp: () => get().currentPath !== '/' && get().currentPath !== HOME_PATH,

  newTab: (path) => {
    const target = path ?? HOME_PATH
    const id = newTabId()
    set((s) => ({
      tabs: [...s.tabs, { id, history: [target], index: 0 }],
      activeTabId: id,
      currentPath: target,
      selection: new Set(),
      isSearchResults: false,
      searchQuery: ''
    }))
    void get().loadDir(target)
  },

  closeTab: (id) => {
    const s = get()
    if (s.tabs.length === 1) {
      // Closing the last tab closes the window.
      window.api.windowClose()
      return
    }
    const idx = s.tabs.findIndex((t) => t.id === id)
    const tabs = s.tabs.filter((t) => t.id !== id)
    if (id !== s.activeTabId) {
      // Closing a background tab must not disturb the active view or selection.
      set({ tabs })
      return
    }
    const next = tabs[Math.min(idx, tabs.length - 1)]
    const path = next.history[next.index]
    set({ tabs, activeTabId: next.id, currentPath: path, selection: new Set() })
    void get().loadDir(path)
  },

  setActiveTab: (id) => {
    const s = get()
    if (id === s.activeTabId) return
    const tab = s.tabs.find((t) => t.id === id)
    if (!tab) return
    const path = tab.history[tab.index]
    set({
      activeTabId: id,
      currentPath: path,
      selection: new Set(),
      isSearchResults: false,
      searchQuery: ''
    })
    void get().loadDir(path)
  },

  setViewMode: (mode) => {
    set({ viewMode: mode, contextMenu: null })
    persist(get())
  },

  setSort: (key) => {
    set((s) => {
      if (s.sortKey === key) return { sortDir: s.sortDir === 'asc' ? 'desc' : 'asc' }
      return { sortKey: key, sortDir: 'asc' }
    })
    persist(get())
  },

  toggleShowHidden: () => {
    set((s) => ({ showHidden: !s.showHidden }))
    persist(get())
  },

  setSelection: (paths, anchor) =>
    set({ selection: new Set(paths), anchorPath: anchor ?? paths[paths.length - 1] ?? null }),

  selectOne: (path) => set({ selection: new Set([path]), anchorPath: path }),

  toggleSelect: (path) =>
    set((s) => {
      const next = new Set(s.selection)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return { selection: next, anchorPath: path }
    }),

  rangeSelectTo: (path) => {
    const s = get()
    const visible = selectVisibleItems(s).map((i) => i.path)
    const anchor = s.anchorPath ?? visible[0]
    const a = visible.indexOf(anchor)
    const b = visible.indexOf(path)
    if (a === -1 || b === -1) {
      set({ selection: new Set([path]), anchorPath: path })
      return
    }
    const [lo, hi] = a < b ? [a, b] : [b, a]
    set({ selection: new Set(visible.slice(lo, hi + 1)) })
  },

  selectAll: () =>
    set((s) => ({ selection: new Set(selectVisibleItems(s).map((i) => i.path)) })),

  invertSelection: () =>
    set((s) => {
      const next = new Set<string>()
      for (const i of selectVisibleItems(s)) if (!s.selection.has(i.path)) next.add(i.path)
      return { selection: next }
    }),

  clearSelection: () => set({ selection: new Set(), anchorPath: null }),

  openItem: async (item) => {
    // Opening an item (file or folder) is what makes it "recent" — plain
    // navigation (breadcrumbs, sidebar, back/forward) deliberately does not.
    get().recordRecent(item.path)
    if (item.isDirectory) {
      await get().navigateTo(item.path)
    } else {
      const res = await window.api.openPath(item.path)
      if (!res.ok) get().flashStatus(res.error ?? 'Could not open file')
    }
  },

  copySelection: () => {
    const paths = [...get().selection]
    if (paths.length) set({ clipboard: { paths, mode: 'copy' } })
  },

  cutSelection: () => {
    const paths = [...get().selection]
    if (paths.length) set({ clipboard: { paths, mode: 'cut' } })
  },

  paste: async () => {
    const { clipboard, currentPath } = get()
    if (!clipboard || !clipboard.paths.length || currentPath === HOME_PATH) return
    const op = clipboard.mode === 'cut' ? 'move' : 'copy'
    await get().performTransfer(clipboard.paths, currentPath, op, clipboard.mode === 'cut')
  },

  beginRename: (path) => set({ renamingPath: path, selection: new Set([path]) }),

  commitRename: async (newName) => {
    const target = get().renamingPath
    set({ renamingPath: null })
    if (!target) return
    if (!newName.trim() || newName === basename(target)) return
    const res = await window.api.rename(target, newName)
    if (!res.ok) {
      get().flashStatus(res.error ?? 'Rename failed')
    } else if (res.data) {
      get().recordUndo({ type: 'rename', from: target, to: res.data.path })
    }
    await get().refresh()
    if (res.ok && res.data) set({ selection: new Set([res.data.path]) })
  },

  cancelRename: () => set({ renamingPath: null }),

  createFolder: async () => {
    const { currentPath } = get()
    if (currentPath === HOME_PATH) {
      get().flashStatus("Can't create items on the Home page")
      return
    }
    const res = await window.api.createFolder(currentPath, 'New folder')
    if (res.ok && res.data) {
      set({ pendingRenamePath: res.data.path })
      await get().refresh()
    } else {
      get().flashStatus(res.error ?? 'Could not create folder')
    }
  },

  createTextFile: async () => {
    const { currentPath } = get()
    if (currentPath === HOME_PATH) {
      get().flashStatus("Can't create items on the Home page")
      return
    }
    const res = await window.api.createTextFile(currentPath, 'New Text Document.txt')
    if (res.ok && res.data) {
      set({ pendingRenamePath: res.data.path })
      await get().refresh()
    } else {
      get().flashStatus(res.error ?? 'Could not create file')
    }
  },

  deleteSelection: async () => {
    const paths = [...get().selection]
    if (!paths.length) return
    const res = await window.api.moveToTrash(paths)
    if (!res.ok) get().flashStatus(res.error ?? 'Delete failed')
    set({ selection: new Set() })
    await get().refresh()
  },

  revealSelectionInFinder: () => {
    const first = [...get().selection][0] ?? get().currentPath
    void window.api.revealInFinder(first)
  },

  setSearchQuery: (q) => set({ searchQuery: q }),

  runSearch: async () => {
    const { searchQuery, currentPath } = get()
    const q = searchQuery.trim()
    if (!q) {
      get().clearSearch()
      return
    }
    const seq = ++loadSeq
    set({ loading: true, isSearchResults: true, selection: new Set() })
    const res = await window.api.search(currentPath, q)
    if (seq !== loadSeq) return
    if (res.ok && res.data) {
      set({ items: res.data, loading: false, error: null, errorCode: null })
    } else {
      set({ items: [], loading: false, error: res.error ?? 'Search failed', errorCode: res.code ?? null })
    }
  },

  clearSearch: () => {
    set({ searchQuery: '', isSearchResults: false })
    void get().loadDir(get().currentPath)
  },

  openContextMenu: (x, y, targetPath) => set({ contextMenu: { x, y, targetPath } }),
  closeContextMenu: () => set({ contextMenu: null }),

  flashStatus: (msg) => {
    set({ statusMessage: msg })
  },

  setGroupBy: (key) => {
    set({ groupBy: key, contextMenu: null })
    persist(get())
  },

  setColumnWidth: (col, width) => {
    set((s) => ({ columnWidths: { ...s.columnWidths, [col]: Math.max(60, Math.round(width)) } }))
    persist(get())
  },

  togglePreview: () => {
    set((s) => ({ previewOpen: !s.previewOpen }))
    persist(get())
  },

  pinToQuickAccess: (path, name) => {
    set((s) =>
      s.pinnedLinks.some((l) => l.path === path)
        ? {}
        : { pinnedLinks: [...s.pinnedLinks, { name, path, icon: 'documents' }] }
    )
    persist(get())
  },

  unpinFromQuickAccess: (path) => {
    set((s) => ({ pinnedLinks: s.pinnedLinks.filter((l) => l.path !== path) }))
    persist(get())
  },

  isPinned: (path) => get().pinnedLinks.some((l) => l.path === path),

  recordRecent: (path) => {
    if (path === HOME_PATH) return
    set((s) => ({ recents: [path, ...s.recents.filter((p) => p !== path)].slice(0, MAX_RECENTS) }))
    persist(get())
  },

  removeRecent: (path) => {
    set((s) => ({ recents: s.recents.filter((p) => p !== path) }))
    persist(get())
  },

  clearRecents: () => {
    set({ recents: [] })
    persist(get())
  },

  addFavorite: (path) => {
    if (path === HOME_PATH) return
    set((s) => (s.favorites.includes(path) ? {} : { favorites: [path, ...s.favorites] }))
    persist(get())
  },

  removeFavorite: (path) => {
    set((s) => ({ favorites: s.favorites.filter((p) => p !== path) }))
    persist(get())
  },

  isFavorite: (path) => get().favorites.includes(path),

  performTransfer: async (srcPaths, destDir, op, clearCut = false) => {
    if (!srcPaths.length) return
    const conf = await window.api.listConflicts(srcPaths, destDir)
    const conflicts = conf.ok && conf.data ? conf.data : []
    if (conflicts.length) {
      set({ pendingTransfer: { srcPaths, destDir, op, conflicts, clearCut } })
    } else {
      await get().doTransfer(srcPaths, destDir, op, 'keep-both', clearCut)
    }
  },

  resolveConflict: async (policy) => {
    const pt = get().pendingTransfer
    set({ pendingTransfer: null })
    if (!pt || policy === 'cancel') return
    await get().doTransfer(pt.srcPaths, pt.destDir, pt.op, policy, pt.clearCut)
  },

  doTransfer: async (srcPaths, destDir, op, policy, clearCut) => {
    set({ operation: { op, done: 0, total: srcPaths.length, name: '' } })
    const res =
      op === 'copy'
        ? await window.api.copy(srcPaths, destDir, policy)
        : await window.api.move(srcPaths, destDir, policy)
    set({ operation: null })
    if (clearCut) set({ clipboard: null })
    if (!res.ok) {
      get().flashStatus(res.error ?? 'Operation failed')
    } else if (res.data && res.data.moves.length) {
      if (op === 'move') get().recordUndo({ type: 'move', moves: res.data.moves })
      else get().recordUndo({ type: 'copy', created: res.data.moves.map((m) => m.to) })
    }
    await get().refresh()
  },

  recordUndo: (entry) => set((s) => ({ undoStack: [...s.undoStack.slice(-49), entry] })),

  undo: async () => {
    const stack = get().undoStack
    if (!stack.length) {
      get().flashStatus('Nothing to undo')
      return
    }
    const entry = stack[stack.length - 1]
    set({ undoStack: stack.slice(0, -1) })
    if (entry.type === 'rename') {
      await window.api.rename(entry.to, basename(entry.from))
    } else if (entry.type === 'move') {
      const byDir = new Map<string, string[]>()
      for (const m of entry.moves) {
        const dir = parentPath(m.from)
        byDir.set(dir, [...(byDir.get(dir) ?? []), m.to])
      }
      for (const [dir, tos] of byDir) await window.api.move(tos, dir, 'keep-both')
    } else {
      await window.api.moveToTrash(entry.created)
    }
    await get().refresh()
  },

  compressSelection: async () => {
    const paths = [...get().selection]
    if (!paths.length) return
    set({ operation: { op: 'copy', done: 0, total: 1, name: 'Compressing…' } })
    const res = await window.api.compressZip(paths, get().currentPath)
    set({ operation: null })
    if (!res.ok) get().flashStatus(res.error ?? 'Compress failed')
    else if (res.data) set({ pendingRenamePath: res.data.path })
    await get().refresh()
  },

  extractSelection: async () => {
    const archives = get().items.filter((i) => get().selection.has(i.path) && i.ext === 'zip')
    if (!archives.length) {
      get().flashStatus('Select a .zip archive to extract')
      return
    }
    set({ operation: { op: 'copy', done: 0, total: archives.length, name: 'Extracting…' } })
    for (const it of archives) {
      const res = await window.api.extractZip(it.path, get().currentPath)
      if (!res.ok) get().flashStatus(res.error ?? 'Extract failed')
    }
    set({ operation: null })
    await get().refresh()
  },

  openWithSelection: async () => {
    const first = [...get().selection][0]
    if (!first) return
    const res = await window.api.openWith(first)
    if (!res.ok) get().flashStatus(res.error ?? 'Could not open with that app')
  },

  openTerminalHere: () => {
    void window.api.openInTerminal(get().currentPath)
  },

  copyPathSelection: () => {
    const paths = [...get().selection]
    const text = paths.length ? paths.join('\n') : get().currentPath
    void navigator.clipboard.writeText(text)
    get().flashStatus('Path copied')
  },

  openProperties: (path) => {
    const target = path ?? [...get().selection][0] ?? get().currentPath
    set({ propertiesPath: target, contextMenu: null })
  },

  closeProperties: () => set({ propertiesPath: null })
}))

// Reused collators. Building one Intl.Collator and calling .compare is far
// cheaper than String.localeCompare(_, _, options), which can rebuild a collator
// on every comparison — the difference is large when sorting thousands of items.
const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const typeCollator = new Intl.Collator(undefined, { numeric: true })

function computeVisibleItems(state: {
  items: FileItem[]
  showHidden: boolean
  sortKey: SortKey
  sortDir: SortDir
}): FileItem[] {
  const filtered = state.showHidden ? state.items : state.items.filter((i) => !i.isHidden)
  const dir = state.sortDir === 'asc' ? 1 : -1
  const sorted = [...filtered].sort((a, b) => {
    // Folders always come before files (familiar file-manager behavior), regardless of sort dir.
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    let cmp = 0
    switch (state.sortKey) {
      case 'name':
        cmp = nameCollator.compare(a.name, b.name)
        break
      case 'modified':
        cmp = a.modified - b.modified
        break
      case 'size':
        cmp = a.size - b.size
        break
      case 'type':
        cmp =
          a.kind.localeCompare(b.kind) ||
          a.ext.localeCompare(b.ext) ||
          typeCollator.compare(a.name, b.name)
        break
    }
    return cmp * dir
  })
  return sorted
}

// Single-entry memo: the visible list only changes when the items array, the
// hidden-file filter, or the sort changes — none of which happen on a keystroke.
// Caching it keeps arrow-key / type-ahead navigation from re-sorting a large
// folder on every press.
let visibleCache: {
  items: FileItem[]
  showHidden: boolean
  sortKey: SortKey
  sortDir: SortDir
  result: FileItem[]
} | null = null

/** Apply hidden-file filter + sort to produce the list the UI should render. */
export function selectVisibleItems(state: {
  items: FileItem[]
  showHidden: boolean
  sortKey: SortKey
  sortDir: SortDir
}): FileItem[] {
  if (
    visibleCache &&
    visibleCache.items === state.items &&
    visibleCache.showHidden === state.showHidden &&
    visibleCache.sortKey === state.sortKey &&
    visibleCache.sortDir === state.sortDir
  ) {
    return visibleCache.result
  }
  const result = computeVisibleItems(state)
  visibleCache = {
    items: state.items,
    showHidden: state.showHidden,
    sortKey: state.sortKey,
    sortDir: state.sortDir,
    result
  }
  return result
}

function nameGroup(name: string): string {
  const c = (name[0] ?? '#').toUpperCase()
  return /[A-Z]/.test(c) ? c : '#'
}

function sizeGroup(size: number, isDir: boolean): string {
  if (isDir) return 'Folders'
  if (size === 0) return 'Empty'
  if (size < 16 * 1024) return 'Tiny (0–16 KB)'
  if (size < 1024 * 1024) return 'Small (16 KB–1 MB)'
  if (size < 128 * 1024 * 1024) return 'Medium (1–128 MB)'
  if (size < 1024 * 1024 * 1024) return 'Large (128 MB–1 GB)'
  return 'Huge (> 1 GB)'
}

function modifiedGroup(ms: number): string {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = 86_400_000
  if (ms >= startOfToday) return 'Today'
  if (ms >= startOfToday - day) return 'Yesterday'
  if (ms >= startOfToday - 7 * day) return 'Earlier this week'
  if (ms >= startOfToday - 30 * day) return 'Earlier this month'
  if (ms >= startOfToday - 365 * day) return 'Earlier this year'
  return 'A long time ago'
}

/** Partition the visible items into groups for "Group by" (preserves sort order). */
export function groupItems(
  items: FileItem[],
  key: GroupKey
): { label: string; items: FileItem[] }[] {
  if (key === 'none') return [{ label: '', items }]
  const groups = new Map<string, FileItem[]>()
  const order: string[] = []
  for (const it of items) {
    let label = ''
    switch (key) {
      case 'name':
        label = nameGroup(it.name)
        break
      case 'type':
        label = it.isDirectory ? 'Folders' : kindLabel(it)
        break
      case 'size':
        label = sizeGroup(it.size, it.isDirectory)
        break
      case 'modified':
        label = modifiedGroup(it.modified)
        break
    }
    if (!groups.has(label)) {
      groups.set(label, [])
      order.push(label)
    }
    groups.get(label)!.push(it)
  }
  return order.map((label) => ({ label, items: groups.get(label)! }))
}
