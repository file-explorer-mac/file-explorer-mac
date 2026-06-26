import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from '../shared/types'
import type { FileExplorerApi, OpProgress, UpdateState } from '../shared/types'

const api: FileExplorerApi = {
  startDir: process.env['FE_START_DIR'] || '',
  readDirectory: (p) => ipcRenderer.invoke(IPC.readDirectory, p),
  getHomeDir: () => ipcRenderer.invoke(IPC.getHomeDir),
  getQuickLinks: () => ipcRenderer.invoke(IPC.getQuickLinks),
  getDrives: () => ipcRenderer.invoke(IPC.getDrives),
  getFileItem: (p) => ipcRenderer.invoke(IPC.getFileItem, p),
  pathExists: (p) => ipcRenderer.invoke(IPC.pathExists, p),
  parentOf: (p) => ipcRenderer.invoke(IPC.parentOf, p),
  joinPath: (base, ...parts) => ipcRenderer.invoke(IPC.joinPath, base, parts),

  openPath: (p) => ipcRenderer.invoke(IPC.openPath, p),
  revealInFinder: (p) => ipcRenderer.invoke(IPC.revealInFinder, p),
  getThumbnail: (p, size) => ipcRenderer.invoke(IPC.getThumbnail, p, size),
  startDrag: (paths) => ipcRenderer.send(IPC.startDrag, paths),
  openFullDiskAccessSettings: () => ipcRenderer.send(IPC.openFullDiskAccessSettings),

  createFolder: (dir, name) => ipcRenderer.invoke(IPC.createFolder, dir, name),
  createTextFile: (dir, name) => ipcRenderer.invoke(IPC.createTextFile, dir, name),
  rename: (p, name) => ipcRenderer.invoke(IPC.rename, p, name),
  moveToTrash: (paths) => ipcRenderer.invoke(IPC.moveToTrash, paths),
  listConflicts: (src, dest) => ipcRenderer.invoke(IPC.listConflicts, src, dest),
  copy: (src, dest, policy) => ipcRenderer.invoke(IPC.copy, src, dest, policy),
  move: (src, dest, policy) => ipcRenderer.invoke(IPC.move, src, dest, policy),

  search: (root, q) => ipcRenderer.invoke(IPC.search, root, q),

  getProperties: (p) => ipcRenderer.invoke(IPC.getProperties, p),
  getFolderSize: (p) => ipcRenderer.invoke(IPC.getFolderSize, p),
  readTextPreview: (p, max) => ipcRenderer.invoke(IPC.readTextPreview, p, max),
  compressZip: (src, dest) => ipcRenderer.invoke(IPC.compressZip, src, dest),
  extractZip: (zip, dest) => ipcRenderer.invoke(IPC.extractZip, zip, dest),
  openWith: (p) => ipcRenderer.invoke(IPC.openWith, p),
  openInTerminal: (dir) => ipcRenderer.invoke(IPC.openInTerminal, dir),

  getPathForFile: (file) => webUtils.getPathForFile(file),

  windowMinimize: () => ipcRenderer.send(IPC.windowMinimize),
  windowToggleMaximize: () => ipcRenderer.send(IPC.windowToggleMaximize),
  windowClose: () => ipcRenderer.send(IPC.windowClose),
  windowNew: () => ipcRenderer.send(IPC.windowNew),
  onMaximizeChange: (cb) => {
    const listener = (_e: unknown, isMax: boolean): void => cb(isMax)
    ipcRenderer.on(IPC.windowMaximizeChanged, listener)
    return () => ipcRenderer.removeListener(IPC.windowMaximizeChanged, listener)
  },
  onOpProgress: (cb) => {
    const listener = (_e: unknown, p: OpProgress): void => cb(p)
    ipcRenderer.on(IPC.opProgress, listener)
    return () => ipcRenderer.removeListener(IPC.opProgress, listener)
  },
  onOpenPath: (cb) => {
    const listener = (_e: unknown, p: string): void => cb(p)
    ipcRenderer.on(IPC.navigateToPath, listener)
    return () => ipcRenderer.removeListener(IPC.navigateToPath, listener)
  },

  checkForUpdates: () => ipcRenderer.send(IPC.updateCheck),
  installUpdate: () => ipcRenderer.send(IPC.updateInstall),
  onUpdateStatus: (cb) => {
    const listener = (_e: unknown, state: UpdateState): void => cb(state)
    ipcRenderer.on(IPC.updateStatus, listener)
    return () => ipcRenderer.removeListener(IPC.updateStatus, listener)
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  // @ts-ignore — fallback when context isolation is disabled.
  window.api = api
}
