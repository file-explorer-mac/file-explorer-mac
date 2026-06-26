import { useEffect } from 'react'
import type { ConflictPolicy } from '@shared/types'
import { useExplorerStore } from '@/store/explorerStore'
import { FileGlyph } from '@/components/FileGlyph'
import styles from './ConflictDialog.module.css'

/** Modal that resolves name clashes when copying or moving items into a folder. */
export default function ConflictDialog(): JSX.Element | null {
  const pendingTransfer = useExplorerStore((s) => s.pendingTransfer)
  const resolveConflict = useExplorerStore((s) => s.resolveConflict)

  useEffect(() => {
    if (!pendingTransfer) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        void resolveConflict('cancel')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pendingTransfer, resolveConflict])

  if (!pendingTransfer) return null

  const { conflicts, op } = pendingTransfer
  const count = conflicts.length
  const title = `${count} item${count === 1 ? '' : 's'} already exist${count === 1 ? 's' : ''}`
  const subtitle = `${op === 'move' ? 'Moving' : 'Copying'} into this folder will clash with:`

  const choose = (policy: ConflictPolicy | 'cancel'): void => {
    void resolveConflict(policy)
  }

  return (
    <div className={styles.backdrop} onMouseDown={() => choose('cancel')}>
      <div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>

        <ul className={styles.list}>
          {conflicts.map((name) => (
            <li key={name} className={styles.row}>
              <FileGlyph kind="file" size={16} className={styles.glyph} />
              <span className={styles.name} title={name}>
                {name}
              </span>
            </li>
          ))}
        </ul>

        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => choose('replace')}>
            Replace
          </button>
          <button type="button" className={styles.secondary} onClick={() => choose('keep-both')}>
            Keep both
          </button>
          <button type="button" className={styles.secondary} onClick={() => choose('skip')}>
            Skip
          </button>
          <button type="button" className={styles.cancel} onClick={() => choose('cancel')}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
