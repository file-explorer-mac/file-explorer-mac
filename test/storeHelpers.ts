import { useExplorerStore } from '../src/renderer/src/store/explorerStore'

/**
 * Reset the (singleton) explorer store back to its creation-time state between
 * tests. zustand v5 exposes the initial state via `getInitialState()`; replacing
 * the whole state (second arg `true`) restores data fields while keeping the
 * action closures intact.
 */
export function resetExplorerStore(): void {
  useExplorerStore.setState(useExplorerStore.getInitialState(), true)
}
