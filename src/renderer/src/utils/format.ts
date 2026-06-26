/** Format a byte count in a familiar KB/MB/GB style (base 1024, 0 decimals for KB). */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 KB'
  const kb = bytes / 1024
  if (kb < 1) return '1 KB'
  if (kb < 1024) return `${Math.ceil(kb).toLocaleString()} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`
  const gb = mb / 1024
  if (gb < 1024) return `${gb.toFixed(gb < 10 ? 1 : 0)} GB`
  const tb = gb / 1024
  return `${tb.toFixed(2)} TB`
}

/** Larger, friendlier size string used for drive capacity ("234 GB"). */
export function formatCapacity(bytes: number): string {
  const gb = bytes / 1024 ** 3
  if (gb < 1) return `${(bytes / 1024 ** 2).toFixed(0)} MB`
  if (gb < 1024) return `${gb.toFixed(0)} GB`
  return `${(gb / 1024).toFixed(2)} TB`
}

const pad = (n: number): string => (n < 10 ? `0${n}` : String(n))

/** Date column in a familiar format: "6/25/2026 11:53 AM". */
export function formatDateTime(epochMs: number): string {
  if (!epochMs) return ''
  const d = new Date(epochMs)
  let h = d.getHours()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${h}:${pad(d.getMinutes())} ${ampm}`
}
