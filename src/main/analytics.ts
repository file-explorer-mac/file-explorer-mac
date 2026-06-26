import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import os from 'os'
import { randomUUID } from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { app } from 'electron'

const execFileP = promisify(execFile)

/**
 * Minimal, privacy-preserving usage analytics.
 *
 * Sends ONE anonymous `app_started` ping per launch so we can see roughly how
 * many installs exist and how often the app is used. We never collect file
 * names, paths, contents, window titles, or anything that identifies a person.
 * Each ping carries only:
 *   - a random install id generated locally (counts installs, identifies no one)
 *   - app version + coarse OS info (platform / release / arch)
 *   - `managed`: whether the Mac is centrally managed (`none` / `mdm` / `dep`) —
 *     a single coarse flag, never *which* organization. A rough B2B-vs-B2C proxy.
 *   - `dow` / `hour`: the local weekday + hour of launch, to gauge work-hours vs
 *     evening/weekend usage in aggregate. No finer-grained timestamp is sent.
 *
 * The receiving endpoint is a small serverless Cloudflare Worker (see
 * `analytics/README.md`); it stores no IP addresses.
 *
 * Analytics is OFF unless the app is a packaged production build, and is always
 * disabled when the user opts out via the standard `DO_NOT_TRACK` env var or our
 * own `FE_NO_ANALYTICS`.
 */

// Pings are POSTed to the deployed analytics Worker (see analytics/README.md).
// Overridable at runtime via FE_ANALYTICS_URL.
const DEFAULT_ENDPOINT = 'https://file-explorer-analytics.appflare.io/e'

const TIMEOUT_MS = 3000

/** A string env var that means "yes" — anything but empty/0/false. */
function truthy(v: string | undefined): boolean {
  return v !== undefined && v !== '' && v !== '0' && v.toLowerCase() !== 'false'
}

/** True only for packaged builds where the user hasn't opted out. */
function analyticsEnabled(): boolean {
  if (truthy(process.env['DO_NOT_TRACK'])) return false
  if (truthy(process.env['FE_NO_ANALYTICS'])) return false
  // Never phone home from dev runs or the test suite unless explicitly forced.
  if (!app.isPackaged && !truthy(process.env['FE_ANALYTICS_DEBUG'])) return false
  return true
}

/**
 * Read the persisted anonymous install id, generating and storing one the first
 * time. Falls back to a throwaway id if the id file can't be read or written.
 */
function installId(): string {
  const file = join(app.getPath('userData'), 'install-id')
  try {
    const existing = readFileSync(file, 'utf8').trim()
    if (existing) return existing
  } catch {
    // Not created yet (or unreadable) — fall through and create it.
  }
  const id = randomUUID()
  try {
    writeFileSync(file, id, 'utf8')
  } catch {
    // Best-effort: if we can't persist, we still send (may double-count once).
  }
  return id
}

/**
 * Coarse device-management state, a rough B2B signal:
 *   - `dep`  — enrolled via Automated Device Enrollment (bought through Apple
 *              Business/School Manager) → almost certainly an org-issued Mac
 *   - `mdm`  — enrolled in some MDM (Jamf, Kandji, Intune, …) → managed/work Mac
 *   - `none` — not managed (typical personal Mac), non-macOS, or undeterminable
 *
 * Reads only the local enrollment *status* (a yes/no), never the MDM server,
 * organization, or any identifier. macOS only; anything else → `none`.
 */
async function detectManaged(): Promise<'none' | 'mdm' | 'dep'> {
  if (process.platform !== 'darwin') return 'none'
  try {
    const { stdout } = await execFileP('/usr/bin/profiles', ['status', '-type', 'enrollment'], {
      timeout: 2000
    })
    if (/Enrolled via DEP:\s*Yes/i.test(stdout)) return 'dep'
    if (/MDM enrollment:\s*Yes/i.test(stdout)) return 'mdm'
    return 'none'
  } catch {
    // `profiles` missing, sandboxed, or timed out — treat as unmanaged.
    return 'none'
  }
}

async function send(endpoint: string, payload: unknown): Promise<void> {
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch {
    // Offline / blocked / timed out — analytics is strictly best-effort.
  }
}

/**
 * Fire a single anonymous `app_started` event. Never throws and never blocks
 * startup; opt-out, dev mode, and network failures are all silently ignored.
 */
export function trackAppStarted(): void {
  if (!analyticsEnabled()) return
  void report()
}

async function report(): Promise<void> {
  const endpoint = process.env['FE_ANALYTICS_URL'] || DEFAULT_ENDPOINT
  const now = new Date()
  const managed = await detectManaged()
  await send(endpoint, {
    id: installId(),
    event: 'app_started',
    v: app.getVersion(),
    os: process.platform,
    osv: os.release(),
    arch: process.arch,
    managed,
    dow: now.getDay(), // 0 = Sunday … 6 = Saturday (local time)
    hour: now.getHours() // 0–23 (local time)
  })
}
