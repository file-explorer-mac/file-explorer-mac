import type {
  DriveItem,
  FileItem,
  FolderSize,
  PropertyInfo,
  QuickLink
} from '../src/shared/types'

/** Build a FileItem with sensible defaults; override any field per test. */
export function makeFileItem(partial: Partial<FileItem> = {}): FileItem {
  const name = partial.name ?? 'file.txt'
  return {
    name,
    path: partial.path ?? `/Users/test/${name}`,
    isDirectory: false,
    isSymbolicLink: false,
    size: 1024,
    modified: 1_700_000_000_000,
    created: 1_700_000_000_000,
    ext: 'txt',
    isHidden: name.startsWith('.'),
    kind: 'text',
    ...partial
  }
}

/** Build a directory FileItem. */
export function makeFolder(partial: Partial<FileItem> = {}): FileItem {
  const name = partial.name ?? 'folder'
  return makeFileItem({
    name,
    path: partial.path ?? `/Users/test/${name}`,
    isDirectory: true,
    size: 0,
    ext: '',
    kind: 'folder',
    ...partial
  })
}

export function makeQuickLink(partial: Partial<QuickLink> = {}): QuickLink {
  return { name: 'Home', path: '/Users/test', icon: 'home', ...partial }
}

export function makeDrive(partial: Partial<DriveItem> = {}): DriveItem {
  return { name: 'Macintosh HD', path: '/', icon: 'drive', ...partial }
}

export function makePropertyInfo(partial: Partial<PropertyInfo> = {}): PropertyInfo {
  return {
    name: 'file.txt',
    path: '/Users/test/file.txt',
    parent: '/Users/test',
    isDirectory: false,
    isSymbolicLink: false,
    size: 1024,
    created: 1_700_000_000_000,
    modified: 1_700_000_000_000,
    accessed: 1_700_000_000_000,
    mode: '-rw-r--r--',
    kind: 'text',
    typeLabel: 'TXT File',
    ...partial
  }
}

export function makeFolderSize(partial: Partial<FolderSize> = {}): FolderSize {
  return { size: 4096, files: 3, folders: 1, complete: true, ...partial }
}
