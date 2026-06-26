import { describe, it, expect } from 'vitest'
import { formatBytes, formatCapacity, formatDateTime } from './format'

describe('formatBytes', () => {
  it('returns "0 KB" for zero or negative input', () => {
    expect(formatBytes(0)).toBe('0 KB')
    expect(formatBytes(-50)).toBe('0 KB')
  })

  it('rounds sub-kilobyte sizes up to "1 KB"', () => {
    expect(formatBytes(1)).toBe('1 KB')
    expect(formatBytes(1023)).toBe('1 KB')
  })

  it('formats kilobytes with ceil + locale grouping', () => {
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1500)).toBe('2 KB')
    expect(formatBytes(1010 * 1024)).toBe('1,010 KB')
  })

  it('formats megabytes with one decimal below 10, none above', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(50 * 1024 * 1024)).toBe('50 MB')
  })

  it('formats gigabytes with one decimal below 10, none above', () => {
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB')
    expect(formatBytes(200 * 1024 ** 3)).toBe('200 GB')
  })

  it('formats terabytes with two decimals', () => {
    expect(formatBytes(2 * 1024 ** 4)).toBe('2.00 TB')
  })
})

describe('formatCapacity', () => {
  it('formats sub-gigabyte capacity in MB', () => {
    expect(formatCapacity(500 * 1024 ** 2)).toBe('500 MB')
  })

  it('formats gigabyte capacity with no decimals', () => {
    expect(formatCapacity(234 * 1024 ** 3)).toBe('234 GB')
  })

  it('formats terabyte capacity with two decimals', () => {
    expect(formatCapacity(2 * 1024 ** 4)).toBe('2.00 TB')
  })
})

describe('formatDateTime', () => {
  it('returns an empty string for a falsy timestamp', () => {
    expect(formatDateTime(0)).toBe('')
  })

  it('formats an afternoon time in 12-hour form', () => {
    const d = new Date(2026, 5, 25, 13, 5)
    expect(formatDateTime(d.getTime())).toBe('6/25/2026 1:05 PM')
  })

  it('renders midnight as 12 AM and noon as 12 PM', () => {
    expect(formatDateTime(new Date(2026, 0, 1, 0, 0).getTime())).toBe('1/1/2026 12:00 AM')
    expect(formatDateTime(new Date(2026, 0, 1, 12, 30).getTime())).toBe('1/1/2026 12:30 PM')
  })

  it('zero-pads single-digit minutes', () => {
    expect(formatDateTime(new Date(2026, 10, 3, 9, 7).getTime())).toBe('11/3/2026 9:07 AM')
  })
})
