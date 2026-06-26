import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useExplorerStore } from '@/store/explorerStore'
import { Icon } from '@/components/Icon'
import { displayName, toSegments, HOME_PATH } from '@/utils/pathUtils'
import { EDIT_ADDRESS_EVENT, FOCUS_SEARCH_EVENT } from '@/hooks/useKeyboardShortcuts'
import styles from './AddressBar.module.css'

const AddressBar: React.FC = () => {
  const currentPath = useExplorerStore((s) => s.currentPath)
  const homeDir = useExplorerStore((s) => s.homeDir)
  const tabs = useExplorerStore((s) => s.tabs)
  const activeTabId = useExplorerStore((s) => s.activeTabId)
  const searchQuery = useExplorerStore((s) => s.searchQuery)

  const goBack = useExplorerStore((s) => s.goBack)
  const goForward = useExplorerStore((s) => s.goForward)
  const goUp = useExplorerStore((s) => s.goUp)
  const navigateTo = useExplorerStore((s) => s.navigateTo)
  const refresh = useExplorerStore((s) => s.refresh)
  const setSearchQuery = useExplorerStore((s) => s.setSearchQuery)
  const runSearch = useExplorerStore((s) => s.runSearch)
  const clearSearch = useExplorerStore((s) => s.clearSearch)
  const flashStatus = useExplorerStore((s) => s.flashStatus)

  const isHome = currentPath === HOME_PATH
  const tab = tabs.find((t) => t.id === activeTabId)
  const canBack = tab ? tab.index > 0 : false
  const canForward = tab ? tab.index < tab.history.length - 1 : false
  const canUp = currentPath !== '/' && !isHome

  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // The Home page has no real path to edit — start blank so the user can just
  // type a destination (rather than seeing the "home://" sentinel).
  const beginEdit = (): void => {
    setEditValue(isHome ? '' : currentPath)
    setEditing(true)
  }

  // Edit-address shortcut / event.
  useEffect(() => {
    const onEdit = (): void => {
      const cur = useExplorerStore.getState().currentPath
      setEditValue(cur === HOME_PATH ? '' : cur)
      setEditing(true)
    }
    window.addEventListener(EDIT_ADDRESS_EVENT, onEdit)
    return () => window.removeEventListener(EDIT_ADDRESS_EVENT, onEdit)
  }, [])

  // Focus-search shortcut / event.
  useEffect(() => {
    const onFocusSearch = (): void => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }
    window.addEventListener(FOCUS_SEARCH_EVENT, onFocusSearch)
    return () => window.removeEventListener(FOCUS_SEARCH_EVENT, onFocusSearch)
  }, [])

  // Auto-focus + select when entering edit mode.
  useLayoutEffect(() => {
    if (editing) {
      editInputRef.current?.focus()
      editInputRef.current?.select()
    }
  }, [editing])

  const segments = toSegments(currentPath, homeDir)

  const commitEdit = async (): Promise<void> => {
    const value = editValue.trim()
    setEditing(false)
    if (!value) return
    // Expand ~ and resolve relative entries (e.g. a child folder name) against
    // the current folder, matching a familiar address bar.
    let target = value
    if (target === '~' || target.startsWith('~/')) target = homeDir + target.slice(1)
    const candidate = target.startsWith('/')
      ? target
      : await window.api.joinPath(currentPath, target)
    const ok = await window.api.pathExists(candidate)
    if (ok) void navigateTo(candidate)
    else flashStatus('Cannot find ' + value)
  }

  const onEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void commitEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setEditing(false)
    }
  }

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void runSearch()
    } else if (e.key === 'Escape' && searchQuery) {
      e.preventDefault()
      clearSearch()
    }
  }

  const onBreadcrumbMouseDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    // Enter edit mode when clicking anywhere that isn't a crumb / refresh button,
    // a familiar pattern where clicking the address bar background makes it editable.
    if (!(e.target as HTMLElement).closest('button')) {
      e.preventDefault()
      beginEdit()
    }
  }

  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.navButton}
        disabled={!canBack}
        onClick={goBack}
        title="Back"
        aria-label="Back"
      >
        <Icon name="back" size={16} />
      </button>
      <button
        type="button"
        className={styles.navButton}
        disabled={!canForward}
        onClick={goForward}
        title="Forward"
        aria-label="Forward"
      >
        <Icon name="forward" size={16} />
      </button>
      <button
        type="button"
        className={styles.navButton}
        disabled={!canUp}
        onClick={goUp}
        title="Up"
        aria-label="Up to parent"
      >
        <Icon name="up" size={16} />
      </button>

      {editing ? (
        <div className={styles.breadcrumb}>
          <input
            ref={editInputRef}
            className={styles.editInput}
            type="text"
            value={editValue}
            spellCheck={false}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={onEditKeyDown}
            onBlur={() => setEditing(false)}
            aria-label="Address"
          />
        </div>
      ) : (
        <div className={styles.breadcrumb} onMouseDown={onBreadcrumbMouseDown}>
          <div className={styles.crumbs}>
            {segments.map((seg, i) => {
              const isLast = i === segments.length - 1
              return (
                <React.Fragment key={seg.path}>
                  {isLast ? (
                    <span className={styles.crumbCurrent}>{seg.name}</span>
                  ) : (
                    <button
                      type="button"
                      className={styles.crumb}
                      onClick={() => void navigateTo(seg.path)}
                      title={seg.name}
                    >
                      {seg.name}
                    </button>
                  )}
                  {!isLast && (
                    <Icon
                      name="chevronRight"
                      size={12}
                      className={styles.chevron}
                    />
                  )}
                </React.Fragment>
              )
            })}
          </div>
          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => void refresh()}
            title="Refresh"
            aria-label="Refresh"
          >
            <Icon name="refresh" size={14} />
          </button>
        </div>
      )}

      <div className={styles.search}>
        <Icon name="search" size={14} className={styles.searchIcon} />
        <input
          ref={searchInputRef}
          className={styles.searchInput}
          type="text"
          value={searchQuery}
          spellCheck={false}
          disabled={isHome}
          placeholder={isHome ? 'Search' : 'Search ' + displayName(currentPath, homeDir)}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={onSearchKeyDown}
          aria-label="Search"
        />
        {searchQuery && (
          <button
            type="button"
            className={styles.searchClear}
            onClick={() => {
              clearSearch()
              setSearchQuery('')
            }}
            title="Clear search"
            aria-label="Clear search"
          >
            <Icon name="close" size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

export default AddressBar
