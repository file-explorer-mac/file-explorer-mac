/**
 * Shared types used across the main, preload, and renderer processes.
 * This file is the single source of truth for the IPC contract.
 */

/** A single file or directory entry. */
export interface FileItem {
  name: string
  /** Absolute path. */
  path: string
  isDirectory: boolean
  isSymbolicLink: boolean
  /** Size in bytes (0 for directories). */
  size: number
  /** Last modified time, epoch milliseconds. */
  modified: number
  /** Creation/birth time, epoch milliseconds. */
  created: number
  /** Lower-cased extension without the leading dot (empty for none / dirs). */
  ext: string
  /** Whether the OS / convention considers this hidden (dotfile, etc.). */
  isHidden: boolean
  /** Coarse file kind used for icon + "Type" column. */
  kind: FileKind
}

export type FileKind =
  | 'folder'
  | 'drive'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'pdf'
  | 'spreadsheet'
  | 'presentation'
  | 'archive'
  | 'code'
  | 'text'
  | 'executable'
  | 'app'
  | 'font'
  | 'disk-image'
  | 'file'

/** Sidebar / "This PC" location. */
export interface DriveItem {
  name: string
  path: string
  /** Total capacity in bytes (volumes only). */
  total?: number
  /** Free space in bytes (volumes only). */
  free?: number
  /** Icon hint for the renderer. */
  icon: QuickLinkIcon | 'drive'
}

export type QuickLinkIcon =
  | 'home'
  | 'desktop'
  | 'documents'
  | 'downloads'
  | 'pictures'
  | 'music'
  | 'videos'
  | 'applications'

/** A pinned Quick-access location. */
export interface QuickLink {
  name: string
  path: string
  icon: QuickLinkIcon
}

/** Result envelope so the renderer can surface errors without try/catch noise. */
export interface Result<T> {
  ok: boolean
  data?: T
  error?: string
  /** errno code when available (e.g. 'EPERM', 'EACCES') so the UI can react. */
  code?: string
}

/** Detailed metadata for the Properties dialog / preview pane. */
export interface PropertyInfo {
  name: string
  path: string
  parent: string
  isDirectory: boolean
  isSymbolicLink: boolean
  symlinkTarget?: string
  /** Size in bytes (files); for folders this is 0 until computed via getFolderSize. */
  size: number
  created: number
  modified: number
  accessed: number
  /** Unix permission string, e.g. "drwxr-xr-x". */
  mode: string
  kind: FileKind
  typeLabel: string
}

/** Recursive folder size + counts (may be partial if it hit the time cap). */
export interface FolderSize {
  size: number
  files: number
  folders: number
  complete: boolean
}

/** How to resolve a name clash during copy/move. */
export type ConflictPolicy = 'replace' | 'skip' | 'keep-both'

/** Progress update emitted during a copy/move operation. */
export interface OpProgress {
  op: 'copy' | 'move'
  done: number
  total: number
  name: string
}

/** Source→destination mapping returned by copy/move (used for Undo). */
export interface TransferResult {
  moves: { from: string; to: string }[]
}

/**
 * Auto-update lifecycle, pushed from main → renderer so the UI can show a
 * banner. `manual` is true when the user explicitly chose "Check for Updates…",
 * which lets the renderer surface "you're up to date" / errors only when asked.
 */
export type UpdateState =
  | { status: 'checking'; manual: boolean }
  | { status: 'available'; version: string; manual: boolean }
  | { status: 'not-available'; manual: boolean }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string; manual: boolean }

/** The API surface exposed on `window.api` by the preload script. */
export interface FileExplorerApi {
  /** Optional initial directory from the FE_START_DIR env var ('' when unset). */
  startDir: string
  readDirectory(path: string): Promise<Result<FileItem[]>>
  getHomeDir(): Promise<string>
  getQuickLinks(): Promise<QuickLink[]>
  getDrives(): Promise<DriveItem[]>
  getFileItem(path: string): Promise<Result<FileItem>>
  pathExists(path: string): Promise<boolean>
  parentOf(path: string): Promise<string>
  joinPath(base: string, ...parts: string[]): Promise<string>

  openPath(path: string): Promise<Result<void>>
  revealInFinder(path: string): Promise<void>
  /** OS-generated thumbnail (images/video/pdf) as a data: URL. */
  getThumbnail(path: string, size: number): Promise<Result<string>>
  /** Begin a native OS file drag so items can be dropped into other apps. */
  startDrag(paths: string[]): void
  /** Opens System Settings at Privacy & Security > Full Disk Access. */
  openFullDiskAccessSettings(): void

  createFolder(parentDir: string, name: string): Promise<Result<FileItem>>
  createTextFile(parentDir: string, name: string): Promise<Result<FileItem>>
  rename(targetPath: string, newName: string): Promise<Result<FileItem>>
  /** Moves the given paths to the system Trash. */
  moveToTrash(paths: string[]): Promise<Result<void>>
  /** Names in destDir that already exist among the sources (for the conflict dialog). */
  listConflicts(srcPaths: string[], destDir: string): Promise<Result<string[]>>
  copy(srcPaths: string[], destDir: string, policy?: ConflictPolicy): Promise<Result<TransferResult>>
  move(srcPaths: string[], destDir: string, policy?: ConflictPolicy): Promise<Result<TransferResult>>

  search(rootPath: string, query: string): Promise<Result<FileItem[]>>

  getProperties(path: string): Promise<Result<PropertyInfo>>
  /** Recursively computes folder size + counts (bounded by a time cap). */
  getFolderSize(path: string): Promise<Result<FolderSize>>
  /** First chunk of a text file for the preview pane. */
  readTextPreview(path: string, maxBytes?: number): Promise<Result<string>>

  /** Compress sources into a single .zip in destDir; resolves to the new archive. */
  compressZip(srcPaths: string[], destDir: string): Promise<Result<FileItem>>
  extractZip(zipPath: string, destDir: string): Promise<Result<void>>

  /** Open the file with an application the user picks via a dialog. */
  openWith(path: string): Promise<Result<void>>
  /** Open Terminal at the given directory. */
  openInTerminal(dir: string): Promise<void>

  /** Resolve the absolute path of a File from a drop/transfer (Electron webUtils). */
  getPathForFile(file: File): string

  // Frameless window controls (custom title-bar chrome).
  windowMinimize(): void
  windowToggleMaximize(): void
  windowClose(): void
  /** Opens a new, independent File Explorer window. */
  windowNew(): void
  onMaximizeChange(cb: (isMaximized: boolean) => void): () => void
  /** Subscribe to copy/move progress; returns an unsubscribe function. */
  onOpProgress(cb: (p: OpProgress) => void): () => void
  /** Fired when the OS asks this app to open a folder (default-handler / "Open With"). */
  onOpenPath(cb: (path: string) => void): () => void

  /** Manually check GitHub Releases for a newer version (the menu item). */
  checkForUpdates(): void
  /** Quit and install an already-downloaded update (the banner's Restart button). */
  installUpdate(): void
  /** Subscribe to auto-update lifecycle events; returns an unsubscribe function. */
  onUpdateStatus(cb: (state: UpdateState) => void): () => void
}

/** IPC channel names — kept in one place so main & preload never drift. */
export const IPC = {
  readDirectory: 'fs:readDirectory',
  getHomeDir: 'fs:getHomeDir',
  getQuickLinks: 'fs:getQuickLinks',
  getDrives: 'fs:getDrives',
  getFileItem: 'fs:getFileItem',
  pathExists: 'fs:pathExists',
  parentOf: 'fs:parentOf',
  joinPath: 'fs:joinPath',
  openPath: 'fs:openPath',
  revealInFinder: 'fs:revealInFinder',
  getThumbnail: 'fs:getThumbnail',
  startDrag: 'dnd:startDrag',
  openFullDiskAccessSettings: 'app:openFullDiskAccessSettings',
  createFolder: 'fs:createFolder',
  createTextFile: 'fs:createTextFile',
  rename: 'fs:rename',
  moveToTrash: 'fs:moveToTrash',
  listConflicts: 'fs:listConflicts',
  copy: 'fs:copy',
  move: 'fs:move',
  search: 'fs:search',
  getProperties: 'fs:getProperties',
  getFolderSize: 'fs:getFolderSize',
  readTextPreview: 'fs:readTextPreview',
  compressZip: 'fs:compressZip',
  extractZip: 'fs:extractZip',
  openWith: 'fs:openWith',
  openInTerminal: 'fs:openInTerminal',
  opProgress: 'fs:opProgress',
  windowMinimize: 'win:minimize',
  windowToggleMaximize: 'win:toggleMaximize',
  windowClose: 'win:close',
  windowNew: 'win:new',
  windowMaximizeChanged: 'win:maximizeChanged',
  navigateToPath: 'app:navigateToPath',
  updateCheck: 'update:check',
  updateInstall: 'update:install',
  updateStatus: 'update:status'
} as const
