import React, { useState } from 'react'
import { Icon, type IconName } from './Icon'
import { Menu, type MenuItem } from './Menu'
import { useExplorerStore, type ViewMode, type SortKey } from '@/store/explorerStore'
import styles from './Toolbar.module.css'

type MenuName = 'new' | 'sort' | 'view' | 'more'

interface OpenMenu {
  name: MenuName
  x: number
  y: number
  trigger: HTMLElement
}

const Toolbar: React.FC = () => {
  const selection = useExplorerStore((s) => s.selection)
  const clipboard = useExplorerStore((s) => s.clipboard)
  const viewMode = useExplorerStore((s) => s.viewMode)
  const sortKey = useExplorerStore((s) => s.sortKey)
  const sortDir = useExplorerStore((s) => s.sortDir)
  const showHidden = useExplorerStore((s) => s.showHidden)
  const undoStack = useExplorerStore((s) => s.undoStack)
  const previewOpen = useExplorerStore((s) => s.previewOpen)

  const [openMenu, setOpenMenu] = useState<OpenMenu | null>(null)

  const toggleMenu = (name: MenuName) => (e: React.MouseEvent<HTMLButtonElement>): void => {
    if (openMenu?.name === name) {
      setOpenMenu(null)
      return
    }
    const r = e.currentTarget.getBoundingClientRect()
    setOpenMenu({ name, x: r.left, y: r.bottom + 2, trigger: e.currentTarget })
  }

  const closeMenu = (): void => setOpenMenu(null)

  const hasSelection = selection.size > 0
  const singleSelection = selection.size === 1

  const newItems: MenuItem[] = [
    {
      label: 'Folder',
      icon: 'newFolder',
      shortcut: 'Ctrl+Shift+N',
      onClick: () => void useExplorerStore.getState().createFolder()
    },
    {
      label: 'Text Document',
      icon: 'documents',
      onClick: () => void useExplorerStore.getState().createTextFile()
    }
  ]

  const sortKeys: { key: SortKey; label: string }[] = [
    { key: 'name', label: 'Name' },
    { key: 'modified', label: 'Date modified' },
    { key: 'type', label: 'Type' },
    { key: 'size', label: 'Size' }
  ]

  const sortItems: MenuItem[] = [
    { type: 'header', label: 'Sort by' },
    ...sortKeys.map<MenuItem>(({ key, label }) => ({
      label,
      checked: sortKey === key,
      onClick: () => useExplorerStore.getState().setSort(key)
    })),
    { type: 'separator' },
    {
      label: 'Ascending',
      checked: sortDir === 'asc',
      onClick: () => {
        if (sortDir !== 'asc') useExplorerStore.getState().setSort(sortKey)
      }
    },
    {
      label: 'Descending',
      checked: sortDir === 'desc',
      onClick: () => {
        if (sortDir !== 'desc') useExplorerStore.getState().setSort(sortKey)
      }
    }
  ]

  const viewModes: { mode: ViewMode; label: string; icon: IconName }[] = [
    { mode: 'extra-large', label: 'Extra large icons', icon: 'extraLarge' },
    { mode: 'large', label: 'Large icons', icon: 'gridLarge' },
    { mode: 'medium', label: 'Medium icons', icon: 'gridMedium' },
    { mode: 'small', label: 'Small icons', icon: 'gridSmall' },
    { mode: 'list', label: 'List', icon: 'list' },
    { mode: 'details', label: 'Details', icon: 'details' },
    { mode: 'tiles', label: 'Tiles', icon: 'tiles' }
  ]

  const viewItems: MenuItem[] = [
    ...viewModes.map<MenuItem>(({ mode, label, icon }) => ({
      label,
      icon,
      checked: viewMode === mode,
      onClick: () => useExplorerStore.getState().setViewMode(mode)
    })),
    { type: 'separator' },
    {
      label: 'Show hidden items',
      checked: showHidden,
      onClick: () => useExplorerStore.getState().toggleShowHidden()
    }
  ]

  const moreItems: MenuItem[] = [
    {
      label: 'Select all',
      shortcut: 'Ctrl+A',
      onClick: () => useExplorerStore.getState().selectAll()
    },
    { label: 'Invert selection', onClick: () => useExplorerStore.getState().invertSelection() },
    { type: 'separator' },
    {
      label: 'Reveal in Finder',
      onClick: () => useExplorerStore.getState().revealSelectionInFinder()
    }
  ]

  return (
    <div className={styles.toolbar}>
      {/* New */}
      <button
        type="button"
        className={`${styles.button} ${styles.labeled} ${openMenu?.name === 'new' ? styles.active : ''}`}
        onClick={toggleMenu('new')}
      >
        <Icon name="newFolder" size={16} />
        <span className={styles.label}>New</span>
        <Icon name="chevronDown" size={12} />
      </button>

      <span className={styles.divider} />

      {/* Edit actions */}
      <button
        type="button"
        className={styles.button}
        title="Cut  Ctrl+X"
        disabled={!hasSelection}
        onClick={() => useExplorerStore.getState().cutSelection()}
      >
        <Icon name="cut" size={16} />
      </button>
      <button
        type="button"
        className={styles.button}
        title="Copy  Ctrl+C"
        disabled={!hasSelection}
        onClick={() => useExplorerStore.getState().copySelection()}
      >
        <Icon name="copy" size={16} />
      </button>
      <button
        type="button"
        className={styles.button}
        title="Paste  Ctrl+V"
        disabled={clipboard === null}
        onClick={() => void useExplorerStore.getState().paste()}
      >
        <Icon name="paste" size={16} />
      </button>
      <button
        type="button"
        className={styles.button}
        title="Rename  F2"
        disabled={!singleSelection}
        onClick={() => useExplorerStore.getState().beginRename([...selection][0])}
      >
        <Icon name="rename" size={16} />
      </button>
      <button
        type="button"
        className={styles.button}
        title="Share"
        disabled={!hasSelection}
        onClick={() => useExplorerStore.getState().revealSelectionInFinder()}
      >
        <Icon name="share" size={16} />
      </button>
      <button
        type="button"
        className={styles.button}
        title="Delete  Del"
        disabled={!hasSelection}
        onClick={() => void useExplorerStore.getState().deleteSelection()}
      >
        <Icon name="delete" size={16} />
      </button>
      <button
        type="button"
        className={styles.button}
        title="Undo  Ctrl+Z"
        disabled={undoStack.length === 0}
        onClick={() => void useExplorerStore.getState().undo()}
      >
        <Icon name="undo" size={16} />
      </button>

      <span className={styles.divider} />

      {/* Sort */}
      <button
        type="button"
        className={`${styles.button} ${styles.labeled} ${openMenu?.name === 'sort' ? styles.active : ''}`}
        onClick={toggleMenu('sort')}
      >
        <Icon name="sort" size={16} />
        <span className={styles.label}>Sort</span>
        <Icon name="chevronDown" size={12} />
      </button>

      {/* View */}
      <button
        type="button"
        className={`${styles.button} ${styles.labeled} ${openMenu?.name === 'view' ? styles.active : ''}`}
        onClick={toggleMenu('view')}
      >
        <Icon name="layout" size={16} />
        <span className={styles.label}>View</span>
        <Icon name="chevronDown" size={12} />
      </button>

      {/* Details / preview pane toggle */}
      <button
        type="button"
        className={`${styles.button} ${styles.right} ${previewOpen ? styles.active : ''}`}
        title="Details pane"
        onClick={() => useExplorerStore.getState().togglePreview()}
      >
        <Icon name="info" size={16} />
      </button>

      {/* See more */}
      <button
        type="button"
        className={`${styles.button} ${openMenu?.name === 'more' ? styles.active : ''}`}
        title="See more"
        onClick={toggleMenu('more')}
      >
        <Icon name="more" size={16} />
      </button>

      {openMenu?.name === 'new' ? (
        <Menu items={newItems} x={openMenu.x} y={openMenu.y} onClose={closeMenu} ignore={openMenu.trigger} />
      ) : null}
      {openMenu?.name === 'sort' ? (
        <Menu items={sortItems} x={openMenu.x} y={openMenu.y} onClose={closeMenu} ignore={openMenu.trigger} />
      ) : null}
      {openMenu?.name === 'view' ? (
        <Menu items={viewItems} x={openMenu.x} y={openMenu.y} onClose={closeMenu} ignore={openMenu.trigger} />
      ) : null}
      {openMenu?.name === 'more' ? (
        <Menu items={moreItems} x={openMenu.x} y={openMenu.y} onClose={closeMenu} ignore={openMenu.trigger} />
      ) : null}
    </div>
  )
}

export default Toolbar
