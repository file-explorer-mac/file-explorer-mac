import React, { useEffect, useState } from 'react'
import { useExplorerStore } from '@/store/explorerStore'
import { FileGlyph } from '@/components/FileGlyph'
import { Icon } from '@/components/Icon'
import { displayName } from '@/utils/pathUtils'
import type { Tab } from '@/store/explorerStore'
import styles from './TitleBar.module.css'

const TabButton: React.FC<{ tab: Tab; active: boolean; showClose: boolean }> = ({
  tab,
  active,
  showClose
}) => {
  const homeDir = useExplorerStore((s) => s.homeDir)
  const label = displayName(tab.history[tab.index], homeDir)

  const onActivate = (): void => {
    useExplorerStore.getState().setActiveTab(tab.id)
  }

  const onClose = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation()
    useExplorerStore.getState().closeTab(tab.id)
  }

  // Middle-click (mouse wheel button) closes the tab, like a browser.
  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.button === 1) {
      e.preventDefault()
      useExplorerStore.getState().closeTab(tab.id)
    }
  }

  return (
    <div
      className={`app-no-drag ${styles.tab} ${active ? styles.tabActive : ''}`}
      onClick={onActivate}
      onMouseDown={onMouseDown}
      onAuxClick={(e) => e.button === 1 && e.preventDefault()}
      title={label}
      role="tab"
      aria-selected={active}
    >
      <FileGlyph kind="folder" size={14} className={styles.tabGlyph} />
      <span className={styles.tabLabel}>{label}</span>
      {showClose && (
        <button
          type="button"
          className={`app-no-drag ${styles.tabClose}`}
          onClick={onClose}
          aria-label="Close tab"
          tabIndex={-1}
        >
          <Icon name="close" size={12} />
        </button>
      )}
    </div>
  )
}

const TitleBar: React.FC = () => {
  const tabs = useExplorerStore((s) => s.tabs)
  const activeTabId = useExplorerStore((s) => s.activeTabId)
  const newTab = useExplorerStore((s) => s.newTab)

  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const off = window.api.onMaximizeChange((m) => setMaximized(m))
    return off
  }, [])

  const showClose = tabs.length > 1

  return (
    <div className={`app-drag ${styles.bar}`}>
      <FileGlyph kind="folder" size={18} className={styles.appIcon} />

      <div className={styles.tabStrip}>
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            active={tab.id === activeTabId}
            showClose={showClose}
          />
        ))}
        <button
          type="button"
          className={`app-no-drag ${styles.newTab}`}
          onClick={() => newTab()}
          aria-label="New tab"
        >
          <Icon name="add" size={16} />
        </button>
      </div>

      <div className={styles.winControls}>
        <button
          type="button"
          className={`app-no-drag ${styles.winBtn}`}
          onClick={() => window.api.windowMinimize()}
          aria-label="Minimize"
        >
          <Icon name="minimize" size={16} />
        </button>
        <button
          type="button"
          className={`app-no-drag ${styles.winBtn}`}
          onClick={() => window.api.windowToggleMaximize()}
          aria-label={maximized ? 'Restore' : 'Maximize'}
        >
          <Icon name={maximized ? 'restore' : 'maximize'} size={16} />
        </button>
        <button
          type="button"
          className={`app-no-drag ${styles.winBtn} ${styles.winBtnClose}`}
          onClick={() => window.api.windowClose()}
          aria-label="Close"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    </div>
  )
}

export default TitleBar
