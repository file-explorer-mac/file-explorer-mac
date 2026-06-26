import { useEffect, useState } from 'react'
import type { UpdateState } from '@shared/types'
import styles from './UpdateBanner.module.css'

/**
 * Surfaces auto-update progress pushed from the main process.
 *
 * The persistent case is `downloaded`: a banner inviting the user to restart and
 * install. Manual checks ("Check for Updates…") additionally get transient
 * feedback — "Checking…", "You're up to date", or an error — which auto-clears.
 * Auto (background) checks that find nothing stay silent.
 */
export default function UpdateBanner(): JSX.Element | null {
  const [state, setState] = useState<UpdateState | null>(null)

  useEffect(() => {
    return window.api.onUpdateStatus(setState)
  }, [])

  // Auto-dismiss the transient manual-check outcomes; keep `downloaded` pinned.
  useEffect(() => {
    if (!state) return
    const transient =
      state.status === 'not-available' ||
      (state.status === 'error' && state.manual) ||
      (state.status === 'checking' && state.manual)
    if (!transient) return
    const t = setTimeout(() => setState(null), 5000)
    return () => clearTimeout(t)
  }, [state])

  if (!state) return null

  // Background (non-manual) noise never shows a banner.
  switch (state.status) {
    case 'checking':
      if (!state.manual) return null
      return <Bar tone="info" message="Checking for updates…" />
    case 'available':
      // While auto-downloading we stay quiet unless the user asked.
      if (!state.manual) return null
      return <Bar tone="info" message={`Downloading version ${state.version}…`} />
    case 'downloading':
      return null
    case 'not-available':
      return state.manual ? <Bar tone="info" message="You're up to date." /> : null
    case 'error':
      return state.manual ? <Bar tone="error" message={`Update failed: ${state.message}`} /> : null
    case 'downloaded':
      return (
        <Bar
          tone="action"
          message={`Version ${state.version} is ready to install.`}
          action={{ label: 'Restart', onClick: () => window.api.installUpdate() }}
          onDismiss={() => setState(null)}
        />
      )
    default:
      return null
  }
}

interface BarProps {
  tone: 'info' | 'error' | 'action'
  message: string
  action?: { label: string; onClick: () => void }
  onDismiss?: () => void
}

function Bar({ tone, message, action, onDismiss }: BarProps): JSX.Element {
  return (
    <div className={`${styles.banner} ${styles[tone]}`} role="status">
      <span className={styles.message}>{message}</span>
      {action ? (
        <button type="button" className={styles.action} onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
      {onDismiss ? (
        <button
          type="button"
          className={styles.dismiss}
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          ✕
        </button>
      ) : null}
    </div>
  )
}
