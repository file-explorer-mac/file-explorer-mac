import type { FileExplorerApi } from '../shared/types'

declare global {
  interface Window {
    api: FileExplorerApi
  }
}

export {}
