import React from 'react'
import { useExplorerStore } from '@/store/explorerStore'
import styles from './Skeleton.module.css'

/** Deterministic pseudo-random widths so name bars look natural without flicker. */
const NAME_WIDTHS = [62, 44, 78, 53, 70, 38, 84, 49, 66, 57, 73, 41]
const nameWidth = (i: number): string => `${NAME_WIDTHS[i % NAME_WIDTHS.length]}%`

const Block: React.FC<{ className?: string; style?: React.CSSProperties }> = ({
  className,
  style
}) => <span className={`${styles.block} ${className ?? ''}`} style={style} />

/** Shimmering placeholder shown while a folder is loading, matching the view mode. */
const Skeleton: React.FC = () => {
  const viewMode = useExplorerStore((s) => s.viewMode)
  const columnWidths = useExplorerStore((s) => s.columnWidths)

  if (viewMode === 'details') {
    const grid: React.CSSProperties = {
      gridTemplateColumns: `minmax(0, 1fr) ${columnWidths.date ?? 180}px ${
        columnWidths.type ?? 150
      }px ${columnWidths.size ?? 100}px`
    }
    return (
      <div className={styles.details} aria-busy="true">
        {Array.from({ length: 26 }).map((_, i) => (
          <div key={i} className={styles.detailRow} style={grid}>
            <div className={styles.detailName}>
              <Block className={styles.iconSm} />
              <Block style={{ width: nameWidth(i), height: 11 }} />
            </div>
            <Block style={{ width: '64%', height: 10 }} />
            <Block style={{ width: '52%', height: 10 }} />
            <Block style={{ width: '40%', height: 10 }} />
          </div>
        ))}
      </div>
    )
  }

  if (viewMode === 'list' || viewMode === 'small') {
    const cls = viewMode === 'small' ? styles.listSmall : styles.list
    return (
      <div className={cls} aria-busy="true">
        {Array.from({ length: 60 }).map((_, i) => (
          <div key={i} className={styles.listEntry}>
            <Block className={styles.iconSm} />
            <Block style={{ width: nameWidth(i), height: 11 }} />
          </div>
        ))}
      </div>
    )
  }

  if (viewMode === 'tiles') {
    return (
      <div className={styles.tiles} aria-busy="true">
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className={styles.tile}>
            <Block className={styles.iconMd} />
            <div className={styles.tileText}>
              <Block style={{ width: nameWidth(i), height: 11 }} />
              <Block style={{ width: '40%', height: 9 }} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Icon grids (medium / large / extra-large)
  const iconCls =
    viewMode === 'extra-large' ? styles.iconXl : viewMode === 'large' ? styles.iconLg : styles.iconMd
  const gridCls =
    viewMode === 'extra-large' ? styles.gridXl : viewMode === 'large' ? styles.gridLg : styles.gridMd
  return (
    <div className={gridCls} aria-busy="true">
      {Array.from({ length: 48 }).map((_, i) => (
        <div key={i} className={styles.gridTile}>
          <Block className={iconCls} />
          <Block style={{ width: nameWidth(i), height: 10 }} />
        </div>
      ))}
    </div>
  )
}

export default Skeleton
