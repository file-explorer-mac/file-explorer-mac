import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StatusBar from './StatusBar'
import { useExplorerStore } from '@/store/explorerStore'
import { HOME_PATH } from '@/utils/pathUtils'
import { resetExplorerStore } from '@test/storeHelpers'
import { makeFileItem, makeFolder } from '@test/factories'

beforeEach(() => {
  resetExplorerStore()
})

describe('StatusBar (component / harness validation)', () => {
  it('shows nothing on the Home page', () => {
    useExplorerStore.setState({ currentPath: HOME_PATH })
    const { container } = render(<StatusBar />)
    expect(container.querySelector('.left')!.textContent).toBe('')
  })

  it('shows an item count when nothing is selected', () => {
    useExplorerStore.setState({
      currentPath: '/Users/test',
      items: [makeFolder({ name: 'docs' }), makeFileItem({ name: 'a.txt' })]
    })
    render(<StatusBar />)
    expect(screen.getByText('2 items')).toBeInTheDocument()
  })

  it('summarizes selection with total size, counting only selected files', () => {
    const file = makeFileItem({ name: 'a.txt', path: '/p/a.txt', size: 1024 })
    const dir = makeFolder({ name: 'sub', path: '/p/sub' })
    const other = makeFileItem({ name: 'b.txt', path: '/p/b.txt', size: 4096 })
    useExplorerStore.setState({
      currentPath: '/p',
      items: [dir, file, other],
      // A selected file and a selected directory; `other` stays unselected.
      selection: new Set(['/p/a.txt', '/p/sub'])
    })
    render(<StatusBar />)
    // Size total reflects the file only (1 KB), not the directory.
    expect(screen.getByText(/2 of 3 items selected/)).toBeInTheDocument()
    expect(screen.getByText(/1 KB/)).toBeInTheDocument()
  })

  it('omits the size suffix when only directories are selected', () => {
    const dir = makeFolder({ name: 'sub', path: '/p/sub' })
    useExplorerStore.setState({
      currentPath: '/p',
      items: [dir],
      selection: new Set(['/p/sub'])
    })
    render(<StatusBar />)
    expect(screen.getByText('1 of 1 items selected')).toBeInTheDocument()
  })

  it('switches the view mode from either button', async () => {
    const user = userEvent.setup()
    useExplorerStore.setState({ currentPath: '/p', viewMode: 'details' })
    render(<StatusBar />)
    await user.click(screen.getByRole('button', { name: 'Large icons view' }))
    expect(useExplorerStore.getState().viewMode).toBe('large')
    await user.click(screen.getByRole('button', { name: 'Details view' }))
    expect(useExplorerStore.getState().viewMode).toBe('details')
  })
})
