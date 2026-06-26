import { useExplorerStore } from '@/store/explorerStore'
import styles from './ProgressOverlay.module.css'

/**
 * Floating progress card for copy/move/compress/extract operations.
 * Reads `operation` (OpProgress | null) from the store. Renders nothing for
 * tiny single-item ops to avoid a distracting flash.
 */
export default function ProgressOverlay(): JSX.Element | null {
  const operation = useExplorerStore((s) => s.operation)

  if (!operation) return null

  const isPhrase = operation.name.endsWith('…')
  // Suppress for trivial single-item ops that lack a phrase label.
  if (operation.total <= 1 && !isPhrase) return null

  const determinate = operation.total > 1
  const percent = determinate ? Math.round((operation.done / operation.total) * 100) : 0
  const title = isPhrase
    ? operation.name
    : operation.op === 'move'
      ? 'Moving items'
      : 'Copying items'
  const currentName = !isPhrase && operation.name ? operation.name : null

  return (
    <div className={styles.scrim}>
      <div className={styles.card} role="status" aria-live="polite">
        <div className={styles.title}>{title}</div>
        {currentName && <div className={styles.itemName}>{currentName}</div>}
        <div className={styles.track}>
          {determinate ? (
            <div className={styles.fill} style={{ width: `${percent}%` }} />
          ) : (
            <div className={styles.fillIndeterminate} />
          )}
        </div>
        {determinate && (
          <div className={styles.count}>
            {operation.done} of {operation.total}
          </div>
        )}
      </div>
    </div>
  )
}
