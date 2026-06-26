/**
 * File Explorer — minimal anonymous usage analytics (Cloudflare Worker + D1).
 *
 * Endpoints:
 *   POST /e                   ingest one anonymous event   -> 204
 *   GET  /stats               dashboard (HTML), token-guarded
 *   GET  /stats?format=json   same data as JSON
 *   GET  /                    health check                 -> "ok"
 *
 * Privacy: we never store IP addresses. The install id is a random uuid the
 * client generates locally; it lets us count distinct installs without knowing
 * who anyone is. Country is the coarse Cloudflare edge guess only.
 */

export interface Env {
  DB: D1Database
  /** Password for the /stats dashboard. Set with: wrangler secret put STATS_TOKEN */
  STATS_TOKEN?: string
}

const ALLOWED_EVENTS = new Set(['app_started'])
const ALLOWED_MANAGED = new Set(['none', 'mdm', 'dep'])
const MAX_BODY_BYTES = 4096
// Strip ASCII control characters (0x00-0x1f and 0x7f) from client strings.
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g')

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)

    if (req.method === 'POST' && (url.pathname === '/e' || url.pathname === '/')) {
      return ingest(req, env)
    }
    if (req.method === 'GET' && url.pathname === '/stats') {
      return stats(env, url)
    }
    if (req.method === 'GET' && url.pathname === '/') {
      return new Response('ok\n', { headers: { 'content-type': 'text/plain' } })
    }
    return new Response('not found\n', { status: 404 })
  }
}

// --- ingest ----------------------------------------------------------------

async function ingest(req: Request, env: Env): Promise<Response> {
  const raw = await req.text()
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'too large' }, 413)

  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ error: 'bad json' }, 400)
  }
  if (!body || typeof body !== 'object') return json({ error: 'bad body' }, 400)

  const event = clean(body.event, 40)
  if (!event || !ALLOWED_EVENTS.has(event)) return json({ error: 'bad event' }, 400)

  const installId = clean(body.id, 64)
  if (!installId) return json({ error: 'missing id' }, 400)

  const now = Math.floor(Date.now() / 1000)
  const day = new Date().toISOString().slice(0, 10)
  const country = req.headers.get('cf-ipcountry') || null
  const m = clean(body.managed, 8)
  const managed = m && ALLOWED_MANAGED.has(m) ? m : null

  await env.DB.prepare(
    `INSERT INTO events
       (ts, day, install_id, event, app_version, os, os_version, arch, country, managed, dow, hour)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      now,
      day,
      installId,
      event,
      clean(body.v, 32),
      clean(body.os, 16),
      clean(body.osv, 32),
      clean(body.arch, 16),
      country,
      managed,
      intInRange(body.dow, 0, 6),
      intInRange(body.hour, 0, 23)
    )
    .run()

  return new Response(null, { status: 204 })
}

/** A whole number within [min, max], else null (untrusted client input). */
function intInRange(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null
}

/** Coerce to a trimmed, control-char-free, length-capped string (or null). */
function clean(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.replace(CONTROL_CHARS, '').trim().slice(0, max)
  return s.length ? s : null
}

// --- stats -----------------------------------------------------------------

interface DailyRow {
  day: string
  users: number
  sessions: number
}
interface KeyRow {
  k: string
  users: number
}

async function stats(env: Env, url: URL): Promise<Response> {
  if (!env.STATS_TOKEN || url.searchParams.get('token') !== env.STATS_TOKEN) {
    return new Response('unauthorized\n', { status: 401 })
  }
  const db = env.DB

  const scalar = async (sql: string, ...binds: string[]): Promise<number> => {
    const row = await db
      .prepare(sql)
      .bind(...binds)
      .first<{ n: number }>()
    return row?.n ?? 0
  }
  const breakdown = async (col: string): Promise<KeyRow[]> => {
    const res = await db
      .prepare(
        `SELECT COALESCE(${col}, '?') AS k, COUNT(DISTINCT install_id) AS users
           FROM events GROUP BY k ORDER BY users DESC, k ASC LIMIT 15`
      )
      .all<KeyRow>()
    return res.results
  }

  const installs = await scalar('SELECT COUNT(DISTINCT install_id) AS n FROM events')
  const launches = await scalar('SELECT COUNT(*) AS n FROM events')
  const active = {
    day: await scalar(`SELECT COUNT(DISTINCT install_id) AS n FROM events WHERE day >= date('now', ?)`, '-0 days'),
    week: await scalar(`SELECT COUNT(DISTINCT install_id) AS n FROM events WHERE day >= date('now', ?)`, '-6 days'),
    month: await scalar(`SELECT COUNT(DISTINCT install_id) AS n FROM events WHERE day >= date('now', ?)`, '-29 days')
  }
  const daily = (
    await db
      .prepare(
        `SELECT day, COUNT(DISTINCT install_id) AS users, COUNT(*) AS sessions
           FROM events WHERE day >= date('now', '-29 days')
          GROUP BY day ORDER BY day DESC`
      )
      .all<DailyRow>()
  ).results
  const versions = await breakdown('app_version')
  const platforms = await breakdown('os')
  const osVersions = await breakdown('os_version')
  const arches = await breakdown('arch')
  const countries = await breakdown('country')
  const managed = await breakdown('managed')

  // Work-hours lean: weekday (Mon–Fri) 09:00–17:59 local launches vs the rest.
  // A strong skew toward work hours suggests business/work machines (B2C lean
  // the other way). Only launches that reported local time are classified.
  const wh = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN dow BETWEEN 1 AND 5 AND hour BETWEEN 9 AND 17 THEN 1 ELSE 0 END) AS work,
         COUNT(*) AS classified
       FROM events WHERE dow IS NOT NULL AND hour IS NOT NULL`
    )
    .first<{ work: number; classified: number }>()
  const workHours = {
    work: wh?.work ?? 0,
    off: (wh?.classified ?? 0) - (wh?.work ?? 0),
    classified: wh?.classified ?? 0
  }

  const summary = {
    installs,
    launches,
    active,
    daily,
    versions,
    platforms,
    os_versions: osVersions,
    arches,
    countries,
    managed,
    work_hours: workHours
  }

  if (url.searchParams.get('format') === 'json') return json(summary, 200)
  return new Response(renderHtml(summary), {
    headers: { 'content-type': 'text/html; charset=utf-8' }
  })
}

// --- rendering -------------------------------------------------------------

interface Summary {
  installs: number
  launches: number
  active: { day: number; week: number; month: number }
  daily: DailyRow[]
  versions: KeyRow[]
  platforms: KeyRow[]
  os_versions: KeyRow[]
  arches: KeyRow[]
  countries: KeyRow[]
  managed: KeyRow[]
  work_hours: { work: number; off: number; classified: number }
}

const MANAGED_LABEL: Record<string, string> = {
  none: 'unmanaged (personal)',
  mdm: 'MDM-managed (work)',
  dep: 'Apple Business Manager (work)',
  '?': 'unknown'
}

/** Renders the B2B/B2C read: managed-device share + work-hours lean. */
function b2bSection(s: Summary): string {
  const managedRows = s.managed.map((r) => ({ k: MANAGED_LABEL[r.k] ?? r.k, users: r.users }))
  const managedUsers = s.managed.reduce((n, r) => n + r.users, 0) || 1
  const workish = s.managed
    .filter((r) => r.k === 'mdm' || r.k === 'dep')
    .reduce((n, r) => n + r.users, 0)
  const managedPct = Math.round((workish / managedUsers) * 100)

  const wh = s.work_hours
  const workPct = wh.classified ? Math.round((wh.work / wh.classified) * 100) : 0

  return `<section class="b2b">
    <h2>B2B vs B2C signal</h2>
    <div class="cards">
      <div class="card"><div class="big">${managedPct}%</div><div class="lbl">managed devices (B2B floor)</div></div>
      <div class="card"><div class="big">${workPct}%</div><div class="lbl">launches in work hours</div></div>
    </div>
    <h2>Device management</h2>
    ${bars(managedRows)}
    <p class="meta">Work hours = Mon–Fri 09:00–17:59 local, over ${wh.classified.toLocaleString('en-US')} classified launches. Both are aggregate proxies, not per-user truth.</p>
  </section>`
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ESCAPES[c])
}

function bars(rows: KeyRow[]): string {
  if (!rows.length) return '<p class="empty">no data yet</p>'
  const max = rows.reduce((m, r) => Math.max(m, r.users), 0) || 1
  return rows
    .map(
      (r) => `<div class="row">
        <span class="k">${esc(r.k)}</span>
        <span class="bar"><i style="width:${Math.round((r.users / max) * 100)}%"></i></span>
        <span class="n">${r.users}</span>
      </div>`
    )
    .join('')
}

function dailyTable(rows: DailyRow[]): string {
  if (!rows.length) return '<p class="empty">no data yet</p>'
  const max = rows.reduce((m, r) => Math.max(m, r.sessions), 0) || 1
  return rows
    .map(
      (r) => `<div class="row">
        <span class="k mono">${esc(r.day)}</span>
        <span class="bar"><i style="width:${Math.round((r.sessions / max) * 100)}%"></i></span>
        <span class="n">${r.users}<span class="sub"> / ${r.sessions}</span></span>
      </div>`
    )
    .join('')
}

function renderHtml(s: Summary): string {
  const card = (label: string, value: number): string =>
    `<div class="card"><div class="big">${value.toLocaleString('en-US')}</div><div class="lbl">${label}</div></div>`
  const section = (title: string, inner: string): string =>
    `<section><h2>${title}</h2>${inner}</section>`

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>File Explorer · usage</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 -apple-system, system-ui, sans-serif; margin: 0; padding: 32px;
         max-width: 760px; margin-inline: auto; color: #1c1c1e; background: #f5f5f7; }
  @media (prefers-color-scheme: dark) { body { color: #f2f2f7; background: #1c1c1e; } }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: #8a8a8e; margin: 0 0 24px; font-size: 13px; }
  .cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 28px; }
  .card { background: color-mix(in srgb, currentColor 6%, transparent); border-radius: 12px;
          padding: 14px; text-align: center; }
  .big { font-size: 26px; font-weight: 650; }
  .lbl { font-size: 12px; color: #8a8a8e; margin-top: 2px; }
  section { margin-bottom: 26px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #8a8a8e; margin: 0 0 10px; }
  .row { display: grid; grid-template-columns: 130px 1fr 64px; align-items: center; gap: 10px;
         padding: 3px 0; font-size: 13px; }
  .k { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mono { font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
  .bar { background: color-mix(in srgb, currentColor 8%, transparent); border-radius: 5px; height: 10px; overflow: hidden; }
  .bar i { display: block; height: 100%; background: #0a84ff; border-radius: 5px; }
  .n { text-align: right; font-variant-numeric: tabular-nums; }
  .sub { color: #8a8a8e; }
  .empty { color: #8a8a8e; font-size: 13px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
  @media (max-width: 560px) { .cards { grid-template-columns: repeat(2, 1fr); } .grid2 { grid-template-columns: 1fr; } }
</style>
</head><body>
  <h1>🗂 File Explorer · usage</h1>
  <p class="meta">Anonymous. No IPs, no file data. &ldquo;Active&rdquo; = distinct installs seen in the window.</p>
  <div class="cards">
    ${card('installs', s.installs)}
    ${card('launches', s.launches)}
    ${card('active today', s.active.day)}
    ${card('active 7d', s.active.week)}
    ${card('active 30d', s.active.month)}
  </div>
  ${b2bSection(s)}
  ${section('Daily — active installs / sessions (last 30 days)', dailyTable(s.daily))}
  <div class="grid2">
    ${section('App version', bars(s.versions))}
    ${section('Architecture', bars(s.arches))}
    ${section('macOS / OS version', bars(s.os_versions))}
    ${section('Platform', bars(s.platforms))}
    ${section('Country', bars(s.countries))}
  </div>
</body></html>`
}

// --- helpers ---------------------------------------------------------------

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  })
}
