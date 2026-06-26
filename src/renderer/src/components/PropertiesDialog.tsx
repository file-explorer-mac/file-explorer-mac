import React, { useEffect, useState } from 'react'
import type { FolderSize, PropertyInfo } from '@shared/types'
import { useExplorerStore } from '@/store/explorerStore'
import { FileGlyph } from '@/components/FileGlyph'
import { formatBytes, formatDateTime } from '@/utils/format'
import styles from './PropertiesDialog.module.css'

/** File/folder Properties modal. Reads `propertiesPath` from the store. */
const PropertiesDialog: React.FC = () => {
  const propertiesPath = useExplorerStore((s) => s.propertiesPath)
  const closeProperties = useExplorerStore((s) => s.closeProperties)

  const [info, setInfo] = useState<PropertyInfo | null>(null)
  const [folderSize, setFolderSize] = useState<string | null>(null)

  // Close on Escape.
  useEffect(() => {
    if (!propertiesPath) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeProperties()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [propertiesPath, closeProperties])

  // Load properties (and folder size for directories) whenever the target changes.
  useEffect(() => {
    if (!propertiesPath) {
      setInfo(null)
      setFolderSize(null)
      return
    }
    let cancelled = false
    setInfo(null)
    setFolderSize(null)
    const path = propertiesPath

    void window.api.getProperties(path).then((res) => {
      if (cancelled) return
      if (res.ok && res.data) {
        setInfo(res.data)
        if (res.data.isDirectory) {
          setFolderSize('Calculating…')
          void window.api.getFolderSize(path).then((sz) => {
            if (cancelled) return
            if (sz.ok && sz.data) setFolderSize(formatFolderSize(sz.data))
            else setFolderSize('Unavailable')
          })
        }
      }
    })

    return () => {
      cancelled = true
    }
  }, [propertiesPath])

  if (!propertiesPath) return null

  const onBackdrop = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) closeProperties()
  }

  const sizeValue = info
    ? info.isDirectory
      ? /* v8 ignore next -- defensive: folderSize is set to 'Calculating…' in the same batched render */
        (folderSize ?? 'Calculating…')
      : `${formatBytes(info.size)} (${info.size.toLocaleString()} bytes)`
    : ''

  return (
    <div className={styles.backdrop} onMouseDown={onBackdrop} role="presentation">
      <div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-label={info ? `${info.name} Properties` : 'Properties'}
      >
        <div className={styles.header}>
          <FileGlyph kind={info?.kind ?? 'file'} ext={undefined} size={40} />
          <div className={styles.name}>{info?.name ?? '…'}</div>
        </div>

        <div className={styles.divider} />

        {info ? (
          <dl className={styles.list}>
            <Row label="Type" value={info.typeLabel} />
            <Row label="Location" value={info.parent} />
            <Row label="Size" value={sizeValue} />
            {info.symlinkTarget ? <Row label="Target" value={info.symlinkTarget} /> : null}
            <Row label="Created" value={formatDateTime(info.created)} />
            <Row label="Modified" value={formatDateTime(info.modified)} />
            <Row label="Accessed" value={formatDateTime(info.accessed)} />
            <Row label="Permissions" value={info.mode} />
          </dl>
        ) : (
          <div className={styles.loading}>Loading…</div>
        )}

        <div className={styles.footer}>
          <button type="button" className={styles.okButton} onClick={() => closeProperties()}>
            OK
          </button>
        </div>
      </div>
    </div>
  )
}

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className={styles.row}>
    <dt className={styles.label}>{label}</dt>
    <dd className={styles.value}>{value}</dd>
  </div>
)

function formatFolderSize(fs: FolderSize): string {
  const prefix = fs.complete ? '' : '≥ '
  return `${prefix}${formatBytes(fs.size)} (${fs.files.toLocaleString()} files, ${fs.folders.toLocaleString()} folders)`
}

export default PropertiesDialog
