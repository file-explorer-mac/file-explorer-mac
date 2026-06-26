import type { FileKind } from './types'

const EXT_MAP: Record<string, FileKind> = {}
const register = (kind: FileKind, exts: string[]): void => {
  for (const e of exts) EXT_MAP[e] = kind
}

register('image', ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'tiff', 'tif', 'heic', 'heif', 'ico', 'avif'])
register('video', ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v', 'mpg', 'mpeg', '3gp'])
register('audio', ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'aiff', 'opus'])
register('pdf', ['pdf'])
register('document', ['doc', 'docx', 'odt', 'rtf', 'pages'])
register('spreadsheet', ['xls', 'xlsx', 'ods', 'csv', 'numbers'])
register('presentation', ['ppt', 'pptx', 'odp', 'key'])
register('archive', ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz', 'zst'])
register('disk-image', ['dmg', 'iso', 'img'])
register('code', [
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'json', 'html', 'htm', 'css', 'scss', 'less',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'c', 'h', 'cpp', 'hpp', 'cc', 'cs', 'php', 'swift',
  'sh', 'bash', 'zsh', 'yml', 'yaml', 'toml', 'xml', 'sql', 'lua', 'r', 'dart', 'vue', 'svelte'
])
register('text', ['txt', 'md', 'markdown', 'log', 'ini', 'cfg', 'conf', 'env'])
register('font', ['ttf', 'otf', 'woff', 'woff2', 'eot'])
register('executable', ['exe', 'msi', 'bin', 'run', 'command'])

/** Classify a directory entry into a coarse kind used for icons and the Type column. */
export function classifyKind(opts: {
  isDirectory: boolean
  ext: string
  name: string
}): FileKind {
  const { isDirectory, ext, name } = opts
  if (isDirectory) {
    if (name.toLowerCase().endsWith('.app')) return 'app'
    return 'folder'
  }
  return EXT_MAP[ext] ?? 'file'
}

/** Human-readable type label for the "Type" column, using familiar file-manager phrasing. */
export function kindLabel(item: { kind: FileKind; ext: string }): string {
  switch (item.kind) {
    case 'folder':
      return 'File folder'
    case 'drive':
      return 'Local Disk'
    case 'app':
      return 'Application'
    case 'image':
      return item.ext ? `${item.ext.toUpperCase()} Image` : 'Image'
    case 'video':
      return item.ext ? `${item.ext.toUpperCase()} Video` : 'Video'
    case 'audio':
      return item.ext ? `${item.ext.toUpperCase()} Audio` : 'Audio'
    case 'pdf':
      return 'PDF Document'
    case 'document':
      return 'Document'
    case 'spreadsheet':
      return 'Spreadsheet'
    case 'presentation':
      return 'Presentation'
    case 'archive':
      return 'Archive'
    case 'disk-image':
      return 'Disk Image'
    case 'code':
      return item.ext ? `${item.ext.toUpperCase()} File` : 'Code File'
    case 'text':
      return item.ext ? `${item.ext.toUpperCase()} File` : 'Text Document'
    case 'font':
      return 'Font File'
    case 'executable':
      return 'Executable'
    default:
      return item.ext ? `${item.ext.toUpperCase()} File` : 'File'
  }
}
