import React, { useEffect, useState } from 'react'
import type { FileItem } from '@shared/types'
import { kindLabel } from '@shared/fileKinds'
import { useExplorerStore } from '@/store/explorerStore'
import { Icon } from '@/components/Icon'
import { Thumbnail } from '@/components/Thumbnail'
import { formatBytes, formatDateTime } from '@/utils/format'
import styles from './PreviewPane.module.css'

/** Right-side details/preview panel. */
const PreviewPane: React.FC = () => {
  const previewOpen = useExplorerStore((s) => s.previewOpen)
  const selection = useExplorerStore((s) => s.selection)
  const items = useExplorerStore((s) => s.items)
  const togglePreview = useExplorerStore((s) => s.togglePreview)

  const current: FileItem | undefined =
    selection.size === 1 ? items.find((i) => selection.has(i.path)) : undefined

  const isTextLike = current?.kind === 'text' || current?.kind === 'code'
  const textPath = isTextLike ? current!.path : null
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    setText(null)
    if (!textPath) return
    let alive = true
    void window.api.readTextPreview(textPath).then((res) => {
      if (!alive) return
      if (res.ok && res.data !== undefined) setText(res.data)
    })
    return () => {
      alive = false
    }
  }, [textPath])

  if (!previewOpen) return null

  return (
    <aside className={styles.pane}>
      <div className={styles.header}>
        <span className={styles.headerLabel}>Details</span>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={() => togglePreview()}
          title="Close preview pane"
          aria-label="Close preview pane"
        >
          <Icon name="close" size={14} />
        </button>
      </div>

      {!current ? (
        <div className={styles.empty}>
          {selection.size > 1 ? `${selection.size} items selected` : 'No file selected'}
        </div>
      ) : (
        <div className={styles.body}>
          <div className={styles.previewBox}>
            <Thumbnail item={current} size={220} />
          </div>
          <div className={styles.name}>{current.name}</div>

          <dl className={styles.meta}>
            <dt className={styles.metaKey}>Type</dt>
            <dd className={styles.metaVal}>{kindLabel(current)}</dd>

            <dt className={styles.metaKey}>Size</dt>
            <dd className={styles.metaVal}>
              {current.isDirectory ? '—' : formatBytes(current.size)}
            </dd>

            <dt className={styles.metaKey}>Date modified</dt>
            <dd className={styles.metaVal}>{formatDateTime(current.modified)}</dd>
          </dl>

          {isTextLike && text !== null && <pre className={styles.textPreview}>{text}</pre>}
        </div>
      )}
    </aside>
  )
}

export default PreviewPane
