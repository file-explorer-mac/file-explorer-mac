import { useEffect } from 'react'
import { useExplorerStore } from '@/store/explorerStore'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import TitleBar from '@/components/TitleBar'
import Toolbar from '@/components/Toolbar'
import AddressBar from '@/components/AddressBar'
import NavigationPane from '@/components/NavigationPane'
import FileView from '@/components/FileView'
import HomeView from '@/components/HomeView'
import PreviewPane from '@/components/PreviewPane'
import { HOME_PATH } from '@/utils/pathUtils'
import StatusBar from '@/components/StatusBar'
import ContextMenu from '@/components/ContextMenu'
import PropertiesDialog from '@/components/PropertiesDialog'
import ConflictDialog from '@/components/ConflictDialog'
import ProgressOverlay from '@/components/ProgressOverlay'
import UpdateBanner from '@/components/UpdateBanner'
import styles from './App.module.css'

// Gated demo hook (used only by FE_DEMO screenshots) to exercise interactive state.
declare global {
  interface Window {
    __feDemo?: (mode: string) => void
  }
}
if (typeof window !== 'undefined') {
  window.__feDemo = (mode: string): void => {
    const s = useExplorerStore.getState()
    const visible = s.items.filter((i) => s.showHidden || !i.isHidden)
    const firstFile = visible.find((i) => !i.isDirectory) ?? visible[0]
    if (firstFile && /select|preview|properties/.test(mode)) s.selectOne(firstFile.path)
    if (/preview/.test(mode) && !s.previewOpen) s.togglePreview()
    if (/group/.test(mode)) s.setGroupBy('type')
    if (/properties/.test(mode) && firstFile) s.openProperties(firstFile.path)
    if (/skeleton/.test(mode)) useExplorerStore.setState({ loading: true })
    if (/perf/.test(mode)) {
      const dir = window.api.startDir
      const t0 = performance.now()
      void useExplorerStore
        .getState()
        .navigateTo(dir)
        .then(() => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const n = useExplorerStore.getState().items.length
              // eslint-disable-next-line no-console
              console.log(`[perf] nav+render ${n} items in ${(performance.now() - t0).toFixed(0)}ms`)
            })
          )
        })
    }
  }
}

function App(): JSX.Element {
  const init = useExplorerStore((s) => s.init)
  const statusMessage = useExplorerStore((s) => s.statusMessage)
  const isHome = useExplorerStore((s) => s.currentPath === HOME_PATH)
  useKeyboardShortcuts()

  useEffect(() => {
    void init()
  }, [init])

  // Open folders handed to us by the OS (default folder handler / "Open With").
  useEffect(() => {
    return window.api.onOpenPath((p) => {
      useExplorerStore.getState().newTab(p)
    })
  }, [])

  // Auto-clear transient status/error flashes.
  useEffect(() => {
    if (!statusMessage) return
    const t = setTimeout(() => useExplorerStore.setState({ statusMessage: null }), 4000)
    return () => clearTimeout(t)
  }, [statusMessage])

  return (
    <div className={styles.shell}>
      <TitleBar />
      <Toolbar />
      <AddressBar />
      <div className={styles.body}>
        <NavigationPane />
        {isHome ? <HomeView /> : <FileView />}
        <PreviewPane />
      </div>
      <StatusBar />
      <ContextMenu />
      <PropertiesDialog />
      <ConflictDialog />
      <ProgressOverlay />
      <UpdateBanner />
      {statusMessage ? <div className={styles.toast}>{statusMessage}</div> : null}
    </div>
  )
}

export default App
