import { describe, it, expect, beforeEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import UpdateBanner from './UpdateBanner'
import type { UpdateState } from '@shared/types'
import type { ApiMock } from '@test/apiMock'

function api(): ApiMock {
  return (window as unknown as { api: ApiMock }).api
}

/** Push an update state through the listener the component registered. */
function emit(state: UpdateState): void {
  const cb = api().onUpdateStatus.mock.calls[0][0] as (s: UpdateState) => void
  act(() => cb(state))
}

describe('UpdateBanner', () => {
  beforeEach(() => {
    render(<UpdateBanner />)
  })

  it('renders nothing before any update event', () => {
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('stays silent for background (non-manual) checks that find nothing', () => {
    emit({ status: 'checking', manual: false })
    expect(screen.queryByRole('status')).toBeNull()
    emit({ status: 'not-available', manual: false })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('confirms "up to date" only for a manual check', () => {
    emit({ status: 'not-available', manual: true })
    expect(screen.getByText(/up to date/i)).toBeInTheDocument()
  })

  it('shows "Checking…" for a manual check but not a background one', () => {
    emit({ status: 'checking', manual: true })
    expect(screen.getByText(/checking for updates/i)).toBeInTheDocument()
  })

  it('prompts to restart when an update is downloaded and installs on click', () => {
    emit({ status: 'downloaded', version: '2.3.0' })
    expect(screen.getByText(/2\.3\.0 is ready to install/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    expect(api().installUpdate).toHaveBeenCalledTimes(1)
  })

  it('can be dismissed', () => {
    emit({ status: 'downloaded', version: '2.3.0' })
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('surfaces errors for manual checks, stays quiet for background ones', () => {
    emit({ status: 'error', message: 'offline', manual: false })
    expect(screen.queryByRole('status')).toBeNull()
    emit({ status: 'error', message: 'offline', manual: true })
    expect(screen.getByText(/update failed: offline/i)).toBeInTheDocument()
  })

  it('does not show a banner while silently downloading in the background', () => {
    emit({ status: 'downloading', version: '2.3.0', percent: 50 })
    expect(screen.queryByRole('status')).toBeNull()
  })
})
