import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useExplorerStore, selectVisibleItems, groupItems } from '@/store/explorerStore'
import type { SortKey } from '@/store/explorerStore'
import type { FileItem } from '@shared/types'
import { kindLabel } from '@shared/fileKinds'
import { Thumbnail } from '@/components/Thumbnail'
import { Icon } from '@/components/Icon'
import Skeleton from '@/components/Skeleton'
import { formatBytes, formatDateTime } from '@/utils/format'
import { basename } from '@/utils/pathUtils'
import {
  computeGridLayout,
  itemBox,
  visibleRange,
  revealOffset,
  itemsInRect
} from './fileViewLayout'
import styles from './FileView.module.css'

interface RenameInputProps {
  initialName: string
  onCommit: (value: string) => void
  onCancel: () => void
}

const RenameInput: React.FC<RenameInputProps> = ({ initialName, onCommit, onCancel }) => {
  const ref = useRef<HTMLInputElement>(null)
  const committed = useRef(false)

  useEffect(() => {
    const el = ref.current
    /* v8 ignore start -- defensive: the input ref is always attached when this mount effect runs */
    if (!el) return
    /* v8 ignore stop */
    el.focus()
    const dot = initialName.lastIndexOf('.')
    if (dot > 0) el.setSelectionRange(0, dot)
    else el.select()
  }, [initialName])

  const commit = (): void => {
    if (committed.current) return
    committed.current = true
    onCommit(ref.current?.value ?? initialName)
  }

  return (
    <input
      ref={ref}
      className={styles.renameInput}
      defaultValue={initialName}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          committed.current = true
          onCancel()
        }
      }}
      onBlur={commit}
    />
  )
}

const FileView: React.FC = () => {
  const items = useExplorerStore((s) => s.items)
  const showHidden = useExplorerStore((s) => s.showHidden)
  const sortKey = useExplorerStore((s) => s.sortKey)
  const sortDir = useExplorerStore((s) => s.sortDir)
  const viewMode = useExplorerStore((s) => s.viewMode)
  const selection = useExplorerStore((s) => s.selection)
  const anchorPath = useExplorerStore((s) => s.anchorPath)
  const renamingPath = useExplorerStore((s) => s.renamingPath)
  const loading = useExplorerStore((s) => s.loading)
  const error = useExplorerStore((s) => s.error)
  const errorCode = useExplorerStore((s) => s.errorCode)

  const clipboard = useExplorerStore((s) => s.clipboard)
  const groupBy = useExplorerStore((s) => s.groupBy)
  const columnWidths = useExplorerStore((s) => s.columnWidths)

  const setSort = useExplorerStore((s) => s.setSort)
  const setColumnWidth = useExplorerStore((s) => s.setColumnWidth)
  const clearSelection = useExplorerStore((s) => s.clearSelection)
  const openContextMenu = useExplorerStore((s) => s.openContextMenu)
  const commitRename = useExplorerStore((s) => s.commitRename)
  const cancelRename = useExplorerStore((s) => s.cancelRename)

  const visible = useMemo(
    () => selectVisibleItems({ items, showHidden, sortKey, sortDir }),
    [items, showHidden, sortKey, sortDir]
  )
  const groups = useMemo(() => groupItems(visible, groupBy), [visible, groupBy])

  // Slow second-click on an already-selected item begins rename (familiar file-manager behavior).
  const renameTimer = useRef<number | null>(null)
  const clearRenameTimer = (): void => {
    if (renameTimer.current !== null) {
      clearTimeout(renameTimer.current)
      renameTimer.current = null
    }
  }

  // Show a loading skeleton, but only once a load is slow enough to notice
  // (fast navigations swap straight to content with no flash).
  const [showSkeleton, setShowSkeleton] = useState(false)
  useEffect(() => {
    if (!loading) {
      setShowSkeleton(false)
      return
    }
    const t = window.setTimeout(() => setShowSkeleton(true), 100)
    return () => window.clearTimeout(t)
  }, [loading])

  const handleItemClick = (item: FileItem, e: React.MouseEvent): void => {
    const s = useExplorerStore.getState()
    if (e.metaKey || e.ctrlKey) {
      s.toggleSelect(item.path)
      return
    }
    if (e.shiftKey) {
      s.rangeSelectTo(item.path)
      return
    }
    const wasOnlySelected = s.selection.size === 1 && s.selection.has(item.path)
    s.selectOne(item.path)
    // Clicking again (slowly) on the already-sole-selected item starts a rename,
    // unless a double-click follows (handled below) — familiar file-manager behavior.
    clearRenameTimer()
    if (wasOnlySelected && s.renamingPath !== item.path) {
      renameTimer.current = window.setTimeout(() => {
        const st = useExplorerStore.getState()
        if (st.selection.size === 1 && st.selection.has(item.path)) st.beginRename(item.path)
      }, 500)
    }
  }

  const handleItemDoubleClick = (item: FileItem): void => {
    clearRenameTimer()
    void useExplorerStore.getState().openItem(item)
  }

  const handleItemContextMenu = (item: FileItem, e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    const s = useExplorerStore.getState()
    if (!s.selection.has(item.path)) s.selectOne(item.path)
    s.openContextMenu(e.clientX, e.clientY, item.path)
  }

  const rootRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    additive: boolean
    base: Set<string>
    moved: boolean
  } | null>(null)
  const [marquee, setMarquee] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  const [dragOverPath, setDragOverPath] = useState<string | null>(null)

  // Viewport size + scroll position, used to window (virtualize) large folders.
  const [vp, setVp] = useState({ width: 0, height: 0, scrollTop: 0 })
  const measure = useCallback((): void => {
    const root = rootRef.current
    /* v8 ignore start -- defensive: measure only runs while the root is mounted */
    if (!root) return
    /* v8 ignore stop */
    setVp({ width: root.clientWidth, height: root.clientHeight, scrollTop: root.scrollTop })
  }, [])

  useEffect(() => {
    measure()
    const root = rootRef.current
    /* v8 ignore start -- defensive: the root is always mounted when this effect runs */
    if (!root) return
    /* v8 ignore stop */
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    return () => ro.disconnect()
  }, [measure])

  const layout = useMemo(
    () => computeGridLayout(visible.length, viewMode, vp.width),
    [visible.length, viewMode, vp.width]
  )
  // Window only flat lists; grouped views and the size-less test environment fall
  // back to rendering every row (which keeps marquee/scroll working as before).
  const canWindow = groupBy === 'none' && vp.width > 0 && vp.height > 0 && visible.length > 0

  // Keep the keyboard/click "current" item in view when the list is windowed (the
  // target row may not be rendered, so a DOM scrollIntoView can't reach it).
  useEffect(() => {
    if (!canWindow || !anchorPath) return
    const root = rootRef.current
    /* v8 ignore start -- defensive: the root is mounted whenever a list is shown */
    if (!root) return
    /* v8 ignore stop */
    const idx = visible.findIndex((i) => i.path === anchorPath)
    /* v8 ignore start -- defensive: a set anchor is always one of the visible items */
    if (idx < 0) return
    /* v8 ignore stop */
    const off = revealOffset(idx, root.scrollTop, root.clientHeight, layout)
    if (off !== null) root.scrollTop = off
  }, [anchorPath, canWindow, visible, layout])

  // Live values read by the (stable) window mousemove handler during a marquee drag.
  const winRef = useRef({ canWindow, layout, visible })
  winRef.current = { canWindow, layout, visible }

  // Convert a viewport point to coordinates inside the (scrollable) content.
  const onWindowMouseMove = useCallback((e: MouseEvent): void => {
    const drag = dragRef.current
    const root = rootRef.current
    /* v8 ignore start -- defensive: this window listener is only attached while drag + root both exist */
    if (!drag || !root) return
    /* v8 ignore stop */
    const r = root.getBoundingClientRect()
    const curX = e.clientX - r.left + root.scrollLeft
    const curY = e.clientY - r.top + root.scrollTop
    if (!drag.moved && Math.hypot(curX - drag.startX, curY - drag.startY) < 4) return
    drag.moved = true
    const left = Math.min(drag.startX, curX)
    const top = Math.min(drag.startY, curY)
    const width = Math.abs(curX - drag.startX)
    const height = Math.abs(curY - drag.startY)
    setMarquee({ left, top, width, height })
    const hits = new Set(drag.base)
    const win = winRef.current
    if (win.canWindow) {
      // Off-screen rows aren't in the DOM, so hit-test against the layout geometry.
      for (const idx of itemsInRect({ left, top, width, height }, win.layout)) {
        hits.add(win.visible[idx].path)
      }
    } else {
      root.querySelectorAll<HTMLElement>('[data-path]').forEach((node) => {
        const nb = node.getBoundingClientRect()
        const nl = nb.left - r.left + root.scrollLeft
        const nt = nb.top - r.top + root.scrollTop
        if (nl < left + width && nl + nb.width > left && nt < top + height && nt + nb.height > top) {
          const p = node.dataset.path
          if (p) hits.add(p)
        }
      })
    }
    useExplorerStore.getState().setSelection([...hits])
  }, [])

  const onWindowMouseUp = useCallback((): void => {
    const drag = dragRef.current
    dragRef.current = null
    window.removeEventListener('mousemove', onWindowMouseMove)
    window.removeEventListener('mouseup', onWindowMouseUp)
    setMarquee(null)
    // A plain click on empty space (no drag) clears the selection, a familiar file-manager behavior.
    if (drag && !drag.moved && !drag.additive) clearSelection()
  }, [onWindowMouseMove, clearSelection])

  const handleRootMouseDown = (e: React.MouseEvent): void => {
    if (e.button !== 0) return
    const el = e.target as HTMLElement
    // Don't start a marquee when the press lands on an item row or a control.
    if (el.closest('[data-path]') || el.closest('input') || el.closest('button')) return
    const root = rootRef.current
    /* v8 ignore start -- defensive: the root's own mousedown can only fire while it is mounted */
    if (!root) return
    /* v8 ignore stop */
    const r = root.getBoundingClientRect()
    const additive = e.metaKey || e.ctrlKey
    dragRef.current = {
      startX: e.clientX - r.left + root.scrollLeft,
      startY: e.clientY - r.top + root.scrollTop,
      additive,
      base: additive ? new Set(useExplorerStore.getState().selection) : new Set<string>(),
      moved: false
    }
    window.addEventListener('mousemove', onWindowMouseMove)
    window.addEventListener('mouseup', onWindowMouseUp)
  }

  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', onWindowMouseMove)
      window.removeEventListener('mouseup', onWindowMouseUp)
    }
  }, [onWindowMouseMove, onWindowMouseUp])

  const handleRootContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    openContextMenu(e.clientX, e.clientY, null)
  }

  const sortCaret = (key: SortKey): React.ReactNode => {
    if (sortKey !== key) return null
    return (
      <Icon
        name="chevronDown"
        size={12}
        className={styles.caret}
        style={{ transform: sortDir === 'asc' ? 'rotate(180deg)' : 'none' }}
      />
    )
  }

  const renderName = (item: FileItem): React.ReactNode => {
    if (renamingPath === item.path) {
      return (
        <RenameInput
          initialName={basename(item.path)}
          onCommit={(v) => void commitRename(v)}
          onCancel={cancelRename}
        />
      )
    }
    return <span className={styles.name}>{item.name}</span>
  }

  // ---- drag & drop ----
  // Paths being dragged out of this window via the native OS drag. Used to tell an
  // in-app drop (= move) apart from a drop coming from Finder/VSCode (= copy).
  const dragSourceRef = useRef<Set<string>>(new Set())

  const onItemDragStart = (item: FileItem, e: React.DragEvent): void => {
    clearRenameTimer()
    const store = useExplorerStore.getState()
    const paths = store.selection.has(item.path) ? [...store.selection] : [item.path]
    if (!store.selection.has(item.path)) store.selectOne(item.path)
    dragSourceRef.current = new Set(paths)
    // Hand off to a real OS file drag so items can be dropped into other apps
    // (VSCode, Finder, mail, …). This replaces the HTML5 drag.
    e.preventDefault()
    window.api.startDrag(paths)
  }

  // Clear the source set once a native drag finishes (best effort).
  useEffect(() => {
    const clear = (): void => {
      dragSourceRef.current = new Set()
    }
    window.addEventListener('dragend', clear)
    return () => window.removeEventListener('dragend', clear)
  }, [])

  const handleDrop = async (destDir: string, e: React.DragEvent): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverPath(null)
    const store = useExplorerStore.getState()

    // Resolve real paths of the dropped files (works for our own drag and for
    // external drags from Finder/VSCode, via Electron webUtils).
    let paths: string[] = []
    const files = e.dataTransfer.files
    for (let i = 0; i < files.length; i++) {
      const p = window.api.getPathForFile(files[i])
      if (p) paths.push(p)
    }
    // Internal when every dropped path was part of this window's own drag.
    const source = dragSourceRef.current
    const internal = paths.length > 0 && source.size > 0 && paths.every((p) => source.has(p))
    dragSourceRef.current = new Set()

    paths = paths.filter((p) => p && p !== destDir)
    if (!paths.length) return
    // Route through the store so name-conflicts prompt, progress shows, and the
    // operation is undoable.
    await store.performTransfer(paths, destDir, internal ? 'move' : 'copy')
  }

  const itemHandlers = (
    item: FileItem
  ): React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean } => {
    const props: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean } = {
      onClick: (e) => handleItemClick(item, e),
      onDoubleClick: () => handleItemDoubleClick(item),
      onContextMenu: (e) => handleItemContextMenu(item, e),
      draggable: renamingPath !== item.path,
      onDragStart: (e) => onItemDragStart(item, e)
    }
    if (item.isDirectory) {
      props.onDragOver = (e) => {
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = dragSourceRef.current.size > 0 ? 'move' : 'copy'
        if (dragOverPath !== item.path) setDragOverPath(item.path)
      }
      props.onDragLeave = () => setDragOverPath((p) => (p === item.path ? null : p))
      props.onDrop = (e) => void handleDrop(item.path, e)
    }
    return props
  }

  const isCut = (path: string): boolean =>
    clipboard?.mode === 'cut' && clipboard.paths.includes(path)

  const itemClass = (item: FileItem, base: string): string =>
    [
      base,
      selection.has(item.path) ? styles.selected : '',
      dragOverPath === item.path ? styles.dropTarget : '',
      isCut(item.path) ? styles.cut : ''
    ]
      .filter(Boolean)
      .join(' ')

  // Resizable Details columns (persisted via the store).
  const colDate = columnWidths.date ?? 180
  const colType = columnWidths.type ?? 150
  const colSize = columnWidths.size ?? 100
  const detailGrid: React.CSSProperties = {
    gridTemplateColumns: `minmax(120px, 1fr) ${colDate}px ${colType}px ${colSize}px`
  }
  const startResize = (col: 'date' | 'type' | 'size', e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = col === 'date' ? colDate : col === 'type' ? colType : colSize
    const onMove = (ev: MouseEvent): void => setColumnWidth(col, startW + (ev.clientX - startX))
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const groupHeader = (label: string, count: number): React.ReactNode =>
    groupBy !== 'none' ? (
      <div className={styles.groupHeader}>
        <span>{label}</span>
        <span className={styles.groupCount}>({count})</span>
      </div>
    ) : null

  const detailsHeader = (style?: React.CSSProperties): React.ReactNode => (
    <div className={styles.headerRow} style={{ ...detailGrid, ...style }}>
      <button type="button" className={styles.headerCell} onClick={() => setSort('name')}>
        <span>Name</span>
        {sortCaret('name')}
      </button>
      <button type="button" className={styles.headerCellDate} onClick={() => setSort('modified')}>
        <span>Date modified</span>
        {sortCaret('modified')}
        <span
          className={styles.resizer}
          onMouseDown={(e) => startResize('date', e)}
          onClick={(e) => e.stopPropagation()}
        />
      </button>
      <button type="button" className={styles.headerCellType} onClick={() => setSort('type')}>
        <span>Type</span>
        {sortCaret('type')}
        <span
          className={styles.resizer}
          onMouseDown={(e) => startResize('type', e)}
          onClick={(e) => e.stopPropagation()}
        />
      </button>
      <button type="button" className={styles.headerCellSize} onClick={() => setSort('size')}>
        <span>Size</span>
        {sortCaret('size')}
        <span
          className={styles.resizer}
          onMouseDown={(e) => startResize('size', e)}
          onClick={(e) => e.stopPropagation()}
        />
      </button>
    </div>
  )

  const renderDetailsRow = (item: FileItem, style?: React.CSSProperties): React.ReactNode => (
    <div
      key={item.path}
      className={itemClass(item, styles.detailRow)}
      data-path={item.path}
      style={{ ...detailGrid, ...style }}
      {...itemHandlers(item)}
    >
      <div className={styles.detailName}>
        <Thumbnail item={item} size={18} />
        {renderName(item)}
      </div>
      <div className={styles.detailDate}>{formatDateTime(item.modified)}</div>
      <div className={styles.detailType}>{kindLabel(item)}</div>
      <div className={styles.detailSize}>{item.isDirectory ? '' : formatBytes(item.size)}</div>
    </div>
  )

  const renderListEntry = (item: FileItem, style?: React.CSSProperties): React.ReactNode => (
    <div
      key={item.path}
      className={itemClass(item, styles.listEntry)}
      data-path={item.path}
      style={style}
      {...itemHandlers(item)}
    >
      <Thumbnail item={item} size={16} />
      {renderName(item)}
    </div>
  )

  const renderTile = (item: FileItem, style?: React.CSSProperties): React.ReactNode => (
    <div
      key={item.path}
      className={itemClass(item, styles.tile)}
      data-path={item.path}
      style={style}
      {...itemHandlers(item)}
    >
      <Thumbnail item={item} size={40} />
      <div className={styles.tileText}>
        {renderName(item)}
        <span className={styles.tileMeta}>
          {kindLabel(item)}
          {item.isDirectory ? '' : ` ${formatBytes(item.size)}`}
        </span>
      </div>
    </div>
  )

  const renderGridTile =
    (glyphSize: number) =>
    (item: FileItem, style?: React.CSSProperties): React.ReactNode => (
      <div
        key={item.path}
        className={itemClass(item, styles.gridTile)}
        data-path={item.path}
        style={style}
        {...itemHandlers(item)}
      >
        <Thumbnail item={item} size={glyphSize} />
        {renderName(item)}
      </div>
    )

  const gridGlyphSize = viewMode === 'extra-large' ? 96 : viewMode === 'large' ? 72 : 48
  const renderItem = (item: FileItem, style?: React.CSSProperties): React.ReactNode => {
    if (viewMode === 'details') return renderDetailsRow(item, style)
    if (viewMode === 'tiles') return renderTile(item, style)
    if (viewMode === 'list' || viewMode === 'small') return renderListEntry(item, style)
    return renderGridTile(gridGlyphSize)(item, style)
  }

  const containerClass =
    viewMode === 'small'
      ? styles.listSmall
      : viewMode === 'tiles'
        ? styles.tiles
        : viewMode === 'extra-large'
          ? styles.gridXl
          : viewMode === 'large'
            ? styles.gridLg
            : viewMode === 'medium'
              ? styles.gridMd
              : styles.list

  let content: React.ReactNode = null

  if (canWindow) {
    // Windowed: render only the rows around the viewport, absolutely positioned
    // inside a full-height spacer so the scrollbar reflects the whole folder.
    const range = visibleRange(vp.scrollTop, vp.height, layout)
    const slice = visible.slice(range.start, range.end)
    content = (
      <div style={{ position: 'relative', height: layout.totalHeight, width: '100%' }}>
        {viewMode === 'details'
          ? detailsHeader({
              position: 'sticky',
              top: 0,
              paddingLeft: layout.padX,
              paddingRight: layout.padX,
              boxSizing: 'border-box'
            })
          : null}
        {slice.map((item, k) => {
          const box = itemBox(range.start + k, layout)
          return renderItem(item, {
            position: 'absolute',
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height
          })
        })}
      </div>
    )
  } else if (viewMode === 'details') {
    content = (
      <div className={styles.details}>
        {detailsHeader()}
        {groups.map((g) => (
          <React.Fragment key={g.label || '__all'}>
            {groupHeader(g.label, g.items.length)}
            {g.items.map((item) => renderDetailsRow(item))}
          </React.Fragment>
        ))}
      </div>
    )
  } else {
    content = (
      <div>
        {groups.map((g) => (
          <React.Fragment key={g.label || '__all'}>
            {groupHeader(g.label, g.items.length)}
            <div className={containerClass}>{g.items.map((item) => renderItem(item))}</div>
          </React.Fragment>
        ))}
      </div>
    )
  }

  const isPermissionError =
    !!error &&
    (errorCode === 'EPERM' ||
      errorCode === 'EACCES' ||
      /not permitted|permission denied/i.test(error))

  return (
    <div
      ref={rootRef}
      className={styles.root}
      tabIndex={0}
      onMouseDown={handleRootMouseDown}
      onContextMenu={handleRootContextMenu}
      onScroll={measure}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = dragSourceRef.current.size > 0 ? 'move' : 'copy'
      }}
      onDrop={(e) => void handleDrop(useExplorerStore.getState().currentPath, e)}
    >
      {isPermissionError ? (
        <div className={styles.permPanel}>
          <Icon name="lock" size={44} className={styles.permIcon} />
          <div className={styles.permTitle}>This location requires permission</div>
          <div className={styles.permText}>
            macOS is blocking access to this folder. Grant <b>Full Disk Access</b> to File Explorer
            in System&nbsp;Settings, then come back and try again.
          </div>
          <div className={styles.permButtons}>
            <button
              type="button"
              className={styles.permBtnPrimary}
              onClick={() => window.api.openFullDiskAccessSettings()}
            >
              Open Privacy Settings
            </button>
            <button
              type="button"
              className={styles.permBtn}
              onClick={() => void useExplorerStore.getState().refresh()}
            >
              Try again
            </button>
          </div>
        </div>
      ) : error ? (
        <div className={styles.message}>{error}</div>
      ) : showSkeleton ? (
        <Skeleton />
      ) : !loading && visible.length === 0 ? (
        <div className={styles.message}>This folder is empty</div>
      ) : (
        content
      )}
      {marquee ? (
        <div
          className={styles.marquee}
          style={{
            left: marquee.left,
            top: marquee.top,
            width: marquee.width,
            height: marquee.height
          }}
        />
      ) : null}
    </div>
  )
}

export default FileView
