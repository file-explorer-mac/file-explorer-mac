import React from 'react'
import { Menu, type MenuItem } from '@/components/Menu'
import { useExplorerStore } from '@/store/explorerStore'
import type { GroupKey, SortKey, ViewMode } from '@/store/explorerStore'

const VIEW_MODES: { mode: ViewMode; label: string }[] = [
  { mode: 'extra-large', label: 'Extra large icons' },
  { mode: 'large', label: 'Large icons' },
  { mode: 'medium', label: 'Medium icons' },
  { mode: 'small', label: 'Small icons' },
  { mode: 'list', label: 'List' },
  { mode: 'details', label: 'Details' },
  { mode: 'tiles', label: 'Tiles' }
]

const SORT_KEYS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'modified', label: 'Date modified' },
  { key: 'type', label: 'Type' },
  { key: 'size', label: 'Size' }
]

const GROUP_KEYS: { key: GroupKey; label: string }[] = [
  { key: 'none', label: '(None)' },
  { key: 'name', label: 'Name' },
  { key: 'modified', label: 'Date modified' },
  { key: 'type', label: 'Type' },
  { key: 'size', label: 'Size' }
]

/** Right-click flyout, driven by store.contextMenu and rendered via the shared Menu primitive. */
const ContextMenu: React.FC = () => {
  const contextMenu = useExplorerStore((s) => s.contextMenu)
  const items = useExplorerStore((s) => s.items)
  const selection = useExplorerStore((s) => s.selection)
  const clipboard = useExplorerStore((s) => s.clipboard)
  const viewMode = useExplorerStore((s) => s.viewMode)
  const sortKey = useExplorerStore((s) => s.sortKey)
  const sortDir = useExplorerStore((s) => s.sortDir)
  const showHidden = useExplorerStore((s) => s.showHidden)

  const currentPath = useExplorerStore((s) => s.currentPath)
  const undoStack = useExplorerStore((s) => s.undoStack)
  const closeContextMenu = useExplorerStore((s) => s.closeContextMenu)
  const openItem = useExplorerStore((s) => s.openItem)
  const cutSelection = useExplorerStore((s) => s.cutSelection)
  const copySelection = useExplorerStore((s) => s.copySelection)
  const paste = useExplorerStore((s) => s.paste)
  const beginRename = useExplorerStore((s) => s.beginRename)
  const deleteSelection = useExplorerStore((s) => s.deleteSelection)
  const revealSelectionInFinder = useExplorerStore((s) => s.revealSelectionInFinder)
  const refresh = useExplorerStore((s) => s.refresh)
  const createFolder = useExplorerStore((s) => s.createFolder)
  const createTextFile = useExplorerStore((s) => s.createTextFile)
  const selectAll = useExplorerStore((s) => s.selectAll)
  const setViewMode = useExplorerStore((s) => s.setViewMode)
  const setSort = useExplorerStore((s) => s.setSort)
  const toggleShowHidden = useExplorerStore((s) => s.toggleShowHidden)
  const openProperties = useExplorerStore((s) => s.openProperties)
  const openWithSelection = useExplorerStore((s) => s.openWithSelection)
  const openTerminalHere = useExplorerStore((s) => s.openTerminalHere)
  const copyPathSelection = useExplorerStore((s) => s.copyPathSelection)
  const compressSelection = useExplorerStore((s) => s.compressSelection)
  const extractSelection = useExplorerStore((s) => s.extractSelection)
  const pinToQuickAccess = useExplorerStore((s) => s.pinToQuickAccess)
  const unpinFromQuickAccess = useExplorerStore((s) => s.unpinFromQuickAccess)
  const isPinned = useExplorerStore((s) => s.isPinned)
  const favorites = useExplorerStore((s) => s.favorites)
  const addFavorite = useExplorerStore((s) => s.addFavorite)
  const removeFavorite = useExplorerStore((s) => s.removeFavorite)
  const undo = useExplorerStore((s) => s.undo)
  const groupBy = useExplorerStore((s) => s.groupBy)
  const setGroupBy = useExplorerStore((s) => s.setGroupBy)

  if (contextMenu === null) return null

  const target = contextMenu.targetPath
  const targetItem = target ? items.find((i) => i.path === target) : undefined
  const isZip = !!targetItem && targetItem.ext === 'zip'
  const canPin = !!targetItem && targetItem.isDirectory

  let menuItems: MenuItem[]

  if (target) {
    menuItems = [
      { label: 'Open', onClick: () => targetItem && void openItem(targetItem) },
      {
        label: 'Open with…',
        disabled: !!targetItem && targetItem.isDirectory,
        onClick: () => void openWithSelection()
      },
      ...(canPin
        ? [
            {
              label: 'Open in Terminal',
              onClick: () => void window.api.openInTerminal(target)
            } as MenuItem
          ]
        : []),
      { type: 'separator' },
      { label: 'Cut', icon: 'cut', shortcut: 'Ctrl+X', onClick: cutSelection },
      { label: 'Copy', icon: 'copy', shortcut: 'Ctrl+C', onClick: copySelection },
      {
        label: 'Paste',
        icon: 'paste',
        shortcut: 'Ctrl+V',
        disabled: clipboard === null,
        onClick: () => void paste()
      },
      {
        label: 'Rename',
        icon: 'rename',
        shortcut: 'F2',
        disabled: selection.size > 1,
        onClick: () => beginRename(target)
      },
      { type: 'separator' },
      { label: 'Compress to ZIP', onClick: () => void compressSelection() },
      ...(isZip
        ? [{ label: 'Extract here', onClick: () => void extractSelection() } as MenuItem]
        : []),
      ...(canPin
        ? [
            {
              label: isPinned(target) ? 'Unpin from Quick access' : 'Pin to Quick access',
              icon: 'star',
              onClick: () =>
                isPinned(target)
                  ? unpinFromQuickAccess(target)
                  : pinToQuickAccess(target, targetItem!.name)
            } as MenuItem
          ]
        : []),
      {
        label: favorites.includes(target) ? 'Remove from Favorites' : 'Add to Favorites',
        icon: 'star',
        onClick: () =>
          favorites.includes(target) ? removeFavorite(target) : addFavorite(target)
      },
      { type: 'separator' },
      { label: 'Copy as path', onClick: copyPathSelection },
      { label: 'Reveal in Finder', onClick: revealSelectionInFinder },
      { type: 'separator' },
      {
        label: 'Delete',
        icon: 'delete',
        shortcut: 'Del',
        danger: true,
        onClick: () => void deleteSelection()
      },
      { label: 'Properties', icon: 'info', shortcut: 'Cmd+I', onClick: () => openProperties(target) }
    ]
  } else {
    menuItems = [
      {
        label: 'View',
        icon: 'layout',
        submenu: VIEW_MODES.map(({ mode, label }) => ({
          label,
          checked: viewMode === mode,
          onClick: () => setViewMode(mode)
        }))
      },
      {
        label: 'Sort by',
        icon: 'sort',
        submenu: [
          ...SORT_KEYS.map(({ key, label }) => ({
            label,
            checked: sortKey === key,
            onClick: () => setSort(key)
          })),
          { type: 'separator' as const },
          {
            label: 'Ascending',
            checked: sortDir === 'asc',
            onClick: () => {
              if (sortDir !== 'asc') setSort(sortKey)
            }
          },
          {
            label: 'Descending',
            checked: sortDir === 'desc',
            onClick: () => {
              if (sortDir !== 'desc') setSort(sortKey)
            }
          }
        ]
      },
      {
        label: 'Group by',
        icon: 'group',
        submenu: GROUP_KEYS.map(({ key, label }) => ({
          label,
          checked: groupBy === key,
          onClick: () => setGroupBy(key)
        }))
      },
      { label: 'Refresh', icon: 'refresh', shortcut: 'F5', onClick: () => void refresh() },
      { type: 'separator' },
      {
        label: 'New',
        icon: 'newFolder',
        submenu: [
          { label: 'Folder', icon: 'newFolder', onClick: () => void createFolder() },
          { label: 'Text Document', icon: 'documents', onClick: () => void createTextFile() }
        ]
      },
      {
        label: 'Paste',
        icon: 'paste',
        shortcut: 'Ctrl+V',
        disabled: clipboard === null,
        onClick: () => void paste()
      },
      {
        label: 'Undo',
        icon: 'undo',
        shortcut: 'Ctrl+Z',
        disabled: undoStack.length === 0,
        onClick: () => void undo()
      },
      { type: 'separator' },
      { label: 'Open in Terminal', onClick: openTerminalHere },
      { label: 'Show hidden items', checked: showHidden, onClick: toggleShowHidden },
      { label: 'Reveal in Finder', onClick: () => void window.api.revealInFinder(currentPath) },
      { label: 'Select all', shortcut: 'Ctrl+A', onClick: selectAll },
      { type: 'separator' },
      { label: 'Properties', icon: 'info', shortcut: 'Cmd+I', onClick: () => openProperties(currentPath) }
    ]
  }

  return (
    <Menu items={menuItems} x={contextMenu.x} y={contextMenu.y} onClose={closeContextMenu} />
  )
}

export default ContextMenu
