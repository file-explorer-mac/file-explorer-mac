import React, { useState } from 'react'
import { useExplorerStore } from '@/store/explorerStore'
import { Icon, type IconName } from '@/components/Icon'
import { FileGlyph } from '@/components/FileGlyph'
import type { FileItem, QuickLinkIcon } from '@shared/types'
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

const NavigationPane: React.FC = () => {
  const quickLinks = useExplorerStore((s) => s.quickLinks)
  const pinnedLinks = useExplorerStore((s) => s.pinnedLinks)
  const drives = useExplorerStore((s) => s.drives)
  const unpinFromQuickAccess = useExplorerStore((s) => s.unpinFromQuickAccess)
  const [quickOpen, setQuickOpen] = useState(true)
  const [pcOpen, setPcOpen] = useState(true)

  return (
    <div className={styles.pane}>
      <div className={styles.section}>
        <button
          type="button"
          className={styles.sectionHeader}
          onClick={() => setQuickOpen((v) => !v)}
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

      <div className={styles.section}>
        <button type="button" className={styles.sectionHeader} onClick={() => setPcOpen((v) => !v)}>
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
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default NavigationPane
