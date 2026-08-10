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
  const previewWidth = useExplorerStore((s) => s.previewWidth)
  const setPreviewWidth = useExplorerStore((s) => s.setPreviewWidth)
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

  // The pane sits at the right edge, so dragging its grip left widens it.
  const startResize = (e: React.MouseEvent): void => {
    e.preventDefault()
    const startX = e.clientX
    const startW = previewWidth
    const onMove = (ev: MouseEvent): void => setPreviewWidth(startW - (ev.clientX - startX))
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  if (!previewOpen) return null

  return (
    <>
      {/*
        A flex sibling rather than a child of the pane: the pane scrolls, and an
        absolutely-positioned grip inside it would scroll away with the content.
      */}
      <div
        className={styles.resizer}
        onMouseDown={startResize}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize details pane"
      />
      <aside className={styles.pane} style={{ width: previewWidth }}>
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
              {/* 'contain' so the preview never distorts or crops the picture. */}
              <Thumbnail item={current} size={previewWidth - 40} fit="contain" />
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
    </>
  )
}

export default PreviewPane
