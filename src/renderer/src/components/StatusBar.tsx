import { useMemo } from 'react'
import { useExplorerStore, selectVisibleItems } from '@/store/explorerStore'
import { formatBytes } from '@/utils/format'
import { HOME_PATH } from '@/utils/pathUtils'
import { Icon } from '@/components/Icon'
import styles from './StatusBar.module.css'

export default function StatusBar(): React.JSX.Element {
  const items = useExplorerStore((s) => s.items)
  const showHidden = useExplorerStore((s) => s.showHidden)
  const sortKey = useExplorerStore((s) => s.sortKey)
  const sortDir = useExplorerStore((s) => s.sortDir)
  const selection = useExplorerStore((s) => s.selection)
  const viewMode = useExplorerStore((s) => s.viewMode)
  const setViewMode = useExplorerStore((s) => s.setViewMode)
  const isHome = useExplorerStore((s) => s.currentPath === HOME_PATH)

  const visible = useMemo(
    () => selectVisibleItems({ items, showHidden, sortKey, sortDir }),
    [items, showHidden, sortKey, sortDir]
  )

  const leftText = useMemo(() => {
    // The Home page is a dashboard, not a directory — no item count to show.
    if (isHome) return ''
    if (selection.size === 0) {
      return `${visible.length} items`
    }
    let text = `${selection.size} of ${visible.length} items selected`
    const selectedFiles = visible.filter((i) => selection.has(i.path) && !i.isDirectory)
    if (selectedFiles.length > 0) {
      const totalSize = selectedFiles.reduce((sum, i) => sum + i.size, 0)
      text += `  ${formatBytes(totalSize)}`
    }
    return text
  }, [selection, visible, isHome])

  const isDetails = viewMode === 'details'

  return (
    <div className={styles.root}>
      <span className={styles.left}>{leftText}</span>
      <div className={styles.right}>
        <button
          type="button"
          className={styles.viewButton}
          aria-label="Details view"
          title="Details"
          aria-pressed={isDetails}
          style={isDetails ? { color: 'var(--accent)' } : undefined}
          onClick={() => setViewMode('details')}
        >
          <Icon name="details" size={16} />
        </button>
        <button
          type="button"
          className={styles.viewButton}
          aria-label="Large icons view"
          title="Large icons"
          aria-pressed={!isDetails}
          style={!isDetails ? { color: 'var(--accent)' } : undefined}
          onClick={() => setViewMode('large')}
        >
          <Icon name="gridLarge" size={16} />
        </button>
      </div>
    </div>
  )
}
