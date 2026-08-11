import React, { useEffect, useRef, useState } from 'react'
import { useExplorerStore } from '@/store/explorerStore'
import { Icon, type IconName } from '@/components/Icon'
import { FileGlyph } from '@/components/FileGlyph'
import { Menu, type MenuItem } from '@/components/Menu'
import { basename } from '@/utils/pathUtils'
import type { FileItem, QuickLinkIcon, SidebarCategory } from '@shared/types'
import styles from './NavigationPane.module.css'

const QUICK_ICON: Record<QuickLinkIcon, IconName> = {
  home: 'home',
  desktop: 'desktop',
  documents: 'documents',
  downloads: 'downloads',
  pictures: 'pictures',
  music: 'music',
  videos: 'videos',
  applications: 'applications'
}

interface TreeNodeProps {
  path: string
  label: string
  depth: number
  icon: React.ReactNode
  onUnpin?: () => void
}

/** A folder row in the navigation tree; lazily loads its subfolders on expand. */
const TreeNode: React.FC<TreeNodeProps> = ({ path, label, depth, icon, onUnpin }) => {
  const currentPath = useExplorerStore((s) => s.currentPath)
  const navigateTo = useExplorerStore((s) => s.navigateTo)
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<FileItem[] | null>(null)
  const selected = currentPath === path

  const toggle = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (!expanded && children === null) {
      const showHidden = useExplorerStore.getState().showHidden
      const res = await window.api.readDirectory(path)
      const dirs =
        res.ok && res.data
          ? res.data
              .filter((i) => i.isDirectory && (showHidden || !i.isHidden))
              .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
          : []
      setChildren(dirs)
    }
    setExpanded((v) => !v)
  }

  return (
    <div className={styles.node}>
      <div
        className={`${styles.nodeRow} ${selected ? styles.selected : ''}`}
        style={{ paddingLeft: 4 + depth * 14 }}
        onClick={() => void navigateTo(path)}
        title={label}
      >
        <button
          type="button"
          className={styles.chevron}
          onClick={(e) => void toggle(e)}
          tabIndex={-1}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={12} />
        </button>
        <span className={styles.nodeIcon}>{icon}</span>
        <span className={styles.nodeLabel}>{label}</span>
        {onUnpin ? (
          <button
            type="button"
            className={styles.unpin}
            onClick={(e) => {
              e.stopPropagation()
              onUnpin()
            }}
            title="Unpin from Quick access"
            tabIndex={-1}
          >
            <Icon name="close" size={11} />
          </button>
        ) : null}
      </div>
      {expanded && children && children.length > 0 ? (
        <div>
          {children.map((c) => (
            <TreeNode
              key={c.path}
              path={c.path}
              label={c.name}
              depth={depth + 1}
              icon={<FileGlyph kind="folder" size={16} />}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Resolve dropped items to absolute paths, mirroring FileView's drop handling. */
function droppedPaths(dt: DataTransfer): string[] {
  return Array.from(dt.files)
    .map((f) => window.api.getPathForFile(f))
    .filter(Boolean)
}

/**
 * A file pinned into a category. Unlike a folder it has nothing to expand, so it
 * gets a spacer where the chevron would be and opens on click.
 */
const CategoryFileRow: React.FC<{ item: FileItem; onRemove: () => void }> = ({
  item,
  onRemove
}) => {
  const openItem = useExplorerStore((s) => s.openItem)
  return (
    <div className={styles.node}>
      <div
        className={styles.nodeRow}
        style={{ paddingLeft: 4 }}
        onClick={() => void openItem(item)}
        title={item.name}
      >
        <span className={styles.chevronSpacer} />
        <span className={styles.nodeIcon}>
          <FileGlyph kind={item.kind} ext={item.ext} size={16} />
        </span>
        <span className={styles.nodeLabel}>{item.name}</span>
        <button
          type="button"
          className={styles.unpin}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          title="Remove from category"
          tabIndex={-1}
        >
          <Icon name="close" size={11} />
        </button>
      </div>
    </div>
  )
}

interface CategorySectionProps {
  category: SidebarCategory
  onOpenMenu: (id: string, x: number, y: number) => void
}

/**
 * One user-made group: a collapsible header plus its folders. The header doubles
 * as a drop target so a folder can be dragged straight in from the file list.
 */
const CategorySection: React.FC<CategorySectionProps> = ({ category, onOpenMenu }) => {
  const toggleCategory = useExplorerStore((s) => s.toggleCategory)
  const renameCategory = useExplorerStore((s) => s.renameCategory)
  const addToCategory = useExplorerStore((s) => s.addToCategory)
  const removeFromCategory = useExplorerStore((s) => s.removeFromCategory)
  const renamingCategoryId = useExplorerStore((s) => s.renamingCategoryId)
  const [dragOver, setDragOver] = useState(false)
  const [resolved, setResolved] = useState<Record<string, FileItem>>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const renaming = renamingCategoryId === category.id

  // Resolve entries so files can be told from folders (and get a real glyph).
  const pathKey = category.paths.join(' ')
  useEffect(() => {
    let alive = true
    void Promise.all(category.paths.map((p) => window.api.getFileItem(p))).then((results) => {
      if (!alive) return
      const next: Record<string, FileItem> = {}
      results.forEach((r) => {
        if (r.ok && r.data) next[r.data.path] = r.data
      })
      setResolved(next)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey])

  // Select the whole name on entry so typing replaces the placeholder.
  useEffect(() => {
    if (renaming) inputRef.current?.select()
  }, [renaming])

  const commitRename = (): void => renameCategory(category.id, inputRef.current?.value ?? '')

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const paths = droppedPaths(e.dataTransfer)
    if (paths.length) addToCategory(category.id, paths)
  }

  return (
    <div className={styles.section}>
      <div
        className={`${styles.sectionHeader} ${styles.categoryHeader} ${
          dragOver ? styles.categoryDropTarget : ''
        }`}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          e.dataTransfer.dropEffect = 'link'
          if (!dragOver) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onContextMenu={(e) => {
          e.preventDefault()
          onOpenMenu(category.id, e.clientX, e.clientY)
        }}
      >
        <button
          type="button"
          // While renaming, the toggle shrinks to just its chevron so the input
          // starts right next to it instead of halfway across the pane.
          className={`${styles.sectionToggle} ${renaming ? styles.sectionToggleTight : ''}`}
          onClick={() => toggleCategory(category.id)}
          aria-expanded={!category.collapsed}
        >
          <Icon
            name={category.collapsed ? 'chevronRight' : 'chevronDown'}
            size={12}
            className={styles.sectionChevron}
          />
          {renaming ? null : <span className={styles.sectionLabel}>{category.name}</span>}
        </button>
        {renaming ? (
          <input
            ref={inputRef}
            className={styles.categoryInput}
            defaultValue={category.name}
            aria-label="Category name"
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              // Escape keeps the previous name by committing nothing.
              if (e.key === 'Escape') renameCategory(category.id, category.name)
            }}
          />
        ) : (
          <button
            type="button"
            className={styles.categoryMenuBtn}
            onClick={(e) => {
              e.stopPropagation()
              const r = e.currentTarget.getBoundingClientRect()
              onOpenMenu(category.id, r.left, r.bottom)
            }}
            title="Category options"
            aria-label={`Options for ${category.name}`}
          >
            <Icon name="more" size={14} />
          </button>
        )}
      </div>
      {!category.collapsed ? (
        <div className={styles.tree}>
          {category.paths.length === 0 ? (
            <div className={styles.categoryEmpty}>Drag files or folders here</div>
          ) : (
            category.paths.map((p) => {
              const item = resolved[p]
              // Folders expand and navigate; files just open. Until an entry
              // resolves, assume a folder so the row doesn't flicker.
              return item && !item.isDirectory ? (
                <CategoryFileRow
                  key={p}
                  item={item}
                  onRemove={() => removeFromCategory(category.id, p)}
                />
              ) : (
                <TreeNode
                  key={p}
                  path={p}
                  label={item?.name ?? basename(p)}
                  depth={0}
                  icon={<FileGlyph kind="folder" size={16} />}
                  onUnpin={() => removeFromCategory(category.id, p)}
                />
              )
            })
          )}
        </div>
      ) : null}
    </div>
  )
}

const NavigationPane: React.FC = () => {
  const quickLinks = useExplorerStore((s) => s.quickLinks)
  const pinnedLinks = useExplorerStore((s) => s.pinnedLinks)
  const drives = useExplorerStore((s) => s.drives)
  const cloudRoots = useExplorerStore((s) => s.cloudRoots)
  const unpinFromQuickAccess = useExplorerStore((s) => s.unpinFromQuickAccess)
  const sidebarWidth = useExplorerStore((s) => s.sidebarWidth)
  const setSidebarWidth = useExplorerStore((s) => s.setSidebarWidth)
  const categories = useExplorerStore((s) => s.categories)
  const addCategory = useExplorerStore((s) => s.addCategory)
  const deleteCategory = useExplorerStore((s) => s.deleteCategory)
  const beginRenameCategory = useExplorerStore((s) => s.beginRenameCategory)
  const pinToQuickAccess = useExplorerStore((s) => s.pinToQuickAccess)
  const [quickOpen, setQuickOpen] = useState(true)
  const [quickDragOver, setQuickDragOver] = useState(false)
  const [pcOpen, setPcOpen] = useState(true)
  const [headerMenu, setHeaderMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  const headerMenuItems = (id: string): MenuItem[] => [
    { label: 'Rename', icon: 'rename', onClick: () => beginRenameCategory(id) },
    {
      label: 'Delete category',
      icon: 'delete',
      danger: true,
      // Only the grouping goes away; the folders themselves are untouched.
      onClick: () => deleteCategory(id)
    }
  ]

  // The pane sits at the left edge, so dragging its grip right widens it.
  const startResize = (e: React.MouseEvent): void => {
    e.preventDefault()
    const startX = e.clientX
    const startW = sidebarWidth
    const onMove = (ev: MouseEvent): void => setSidebarWidth(startW + (ev.clientX - startX))
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <>
      <div className={styles.pane} style={{ width: sidebarWidth }}>
        <div className={styles.section}>
          <button
            type="button"
            className={`${styles.sectionHeader} ${quickDragOver ? styles.categoryDropTarget : ''}`}
            onClick={() => setQuickOpen((v) => !v)}
            // Quick access takes dropped folders too, same as a category.
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              e.dataTransfer.dropEffect = 'link'
              if (!quickDragOver) setQuickDragOver(true)
            }}
            onDragLeave={() => setQuickDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setQuickDragOver(false)
              for (const p of droppedPaths(e.dataTransfer)) pinToQuickAccess(p, basename(p))
            }}
          >
            <Icon
              name={quickOpen ? 'chevronDown' : 'chevronRight'}
              size={12}
              className={styles.sectionChevron}
            />
            <span className={styles.sectionLabel}>Quick access</span>
          </button>
          {quickOpen ? (
            <div className={styles.tree}>
              {quickLinks.map((l) => (
                <TreeNode
                  key={l.path}
                  path={l.path}
                  label={l.name}
                  depth={0}
                  icon={<Icon name={QUICK_ICON[l.icon]} size={16} className={styles.accentIcon} />}
                />
              ))}
              {pinnedLinks.map((l) => (
                <TreeNode
                  key={l.path}
                  path={l.path}
                  label={l.name}
                  depth={0}
                  icon={<FileGlyph kind="folder" size={16} />}
                  onUnpin={() => unpinFromQuickAccess(l.path)}
                />
              ))}
            </div>
          ) : null}
        </div>

        {categories.map((c) => (
          <CategorySection
            key={c.id}
            category={c}
            onOpenMenu={(id, x, y) => setHeaderMenu({ id, x, y })}
          />
        ))}

        {/*
          With no categories yet the row sits in place and explains itself; once
          there is one it demotes to a quiet ＋ in the pane's bottom corner.
        */}
        {categories.length === 0 ? (
          <button type="button" className={styles.newCategory} onClick={() => addCategory()}>
            <Icon name="add" size={14} />
            <span>New category</span>
          </button>
        ) : null}

        <div className={styles.section}>
          <button
            type="button"
            className={styles.sectionHeader}
            onClick={() => setPcOpen((v) => !v)}
          >
            <Icon
              name={pcOpen ? 'chevronDown' : 'chevronRight'}
              size={12}
              className={styles.sectionChevron}
            />
            <span className={styles.sectionLabel}>This PC</span>
          </button>
          {pcOpen ? (
            <div className={styles.tree}>
              {drives.map((d) => (
                <TreeNode
                  key={d.path}
                  path={d.path}
                  label={d.name}
                  depth={0}
                  icon={<FileGlyph kind="drive" size={18} />}
                />
              ))}
              {/* Dropbox, OneDrive, Google Drive, iCloud… detected at startup. */}
              {cloudRoots.map((c) => (
                <TreeNode
                  key={c.root}
                  path={c.root}
                  label={c.label}
                  depth={0}
                  icon={<Icon name="cloud" size={18} />}
                />
              ))}
            </div>
          ) : null}
        </div>

        {categories.length > 0 ? (
          <div className={styles.paneFooter}>
            <button
              type="button"
              className={styles.newCategoryMini}
              onClick={() => addCategory()}
              title="New category"
              aria-label="New category"
            >
              <Icon name="add" size={14} />
            </button>
          </div>
        ) : null}
      </div>
      {headerMenu ? (
        <Menu
          items={headerMenuItems(headerMenu.id)}
          x={headerMenu.x}
          y={headerMenu.y}
          minWidth={160}
          onClose={() => setHeaderMenu(null)}
        />
      ) : null}
      {/*
        A flex sibling rather than a child of the pane: the pane scrolls, and an
        absolutely-positioned grip inside it would scroll away with the tree.
      */}
      <div
        className={styles.resizer}
        onMouseDown={startResize}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize navigation pane"
      />
    </>
  )
}

export default NavigationPane
