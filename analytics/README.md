# Anonymous usage analytics

Minimal, privacy-preserving analytics so we can see **roughly how many installs
exist and how often the app is used** — nothing more. It's serverless: a single
[Cloudflare Worker](https://developers.cloudflare.com/workers/) backed by
[D1](https://developers.cloudflare.com/d1/) (SQLite). Free tier covers an indie
app comfortably.

> **Live:** deployed at `https://file-explorer-analytics.appflare.io`
> (custom domain on the `appflare.io` Cloudflare zone). The app already points
> here. The dashboard password is stored as the `STATS_TOKEN` Worker secret —
> it's intentionally **not** committed to this repo.

## What is (and isn't) collected

The app sends **one `app_started` event per launch**. Each event carries only:

| Field | Example | Why |
| --- | --- | --- |
| `id` | random uuid | Count distinct installs without identifying anyone. Generated locally, stored in the app's `userData`. |
| `event` | `app_started` | The only event we send. |
| `v` | `1.0.0` | App-version split (adoption of updates). |
| `os` | `darwin` | Platform. |
| `osv` | `23.5.0` | Coarse OS version. |
| `arch` | `arm64` / `x64` | Apple Silicon vs Intel split. |
| `managed` | `none` / `mdm` / `dep` | Whether the Mac is centrally managed — a coarse **B2B vs B2C** proxy. Read from local enrollment status (`profiles status -type enrollment`), a yes/no only. **Never** which MDM, server, or organization. |
| `dow` | `0`–`6` | Local weekday at launch (0=Sun). Aggregate work-vs-personal lean. |
| `hour` | `0`–`23` | Local hour at launch. Same — never a precise timestamp. |

We **never** collect: file names, paths, contents, directory listings, window
titles, usernames, the managing organization, or IP addresses. The Worker reads
only Cloudflare's coarse `cf-ipcountry` edge header (for a country split); it
never reads or stores the request IP address.

**B2B vs B2C read.** The dashboard turns `managed` + `dow`/`hour` into two
aggregate numbers: *managed-device share* (a floor on how many installs are
work/corporate Macs) and *work-hours share* (Mon–Fri 09:00–17:59 local). Both
are directional proxies, not per-user truth — a freelancer on a personal Mac
reads as B2C, and a company without MDM reads as unmanaged.

Users can opt out at any time by setting `DO_NOT_TRACK=1` or `FE_NO_ANALYTICS=1`
in their environment. Analytics is also disabled in every non-packaged (dev)
build. See [`src/main/analytics.ts`](../src/main/analytics.ts).

## One-time setup (deploy the Worker)

```bash
cd analytics/worker
npm install
npx wrangler login

# 1. Create the database, then paste the printed database_id into wrangler.toml
npx wrangler d1 create file-explorer-stats

# 2. Create the events table
npm run init-db

# 3. Pick a password for the dashboard
npx wrangler secret put STATS_TOKEN

# 4. Ship it — note the printed https://file-explorer-stats.<you>.workers.dev URL
npm run deploy
```

Then point the app at your Worker: open
[`src/main/analytics.ts`](../src/main/analytics.ts) and set `DEFAULT_ENDPOINT`
to `https://<your-domain>/e` (already set to
`https://file-explorer-analytics.appflare.io/e` for this deployment). You can
also override it at runtime with the `FE_ANALYTICS_URL` env var without
rebuilding.

> Tip: verify ingest before shipping a build —
> `FE_ANALYTICS_DEBUG=1 FE_ANALYTICS_URL=https://…/e npm run dev` forces a ping
> from a dev run, then check the dashboard.

## Viewing the numbers

Open the dashboard in a browser (installs, launches, active today/7d/30d, plus
daily activity and version / arch / OS / country breakdowns):

```
https://file-explorer-analytics.appflare.io/stats?token=YOUR_TOKEN
```

Add `&format=json` for the raw JSON, or query D1 directly:

```bash
npx wrangler d1 execute file-explorer-stats --remote \
  --command "SELECT COUNT(DISTINCT install_id) AS installs FROM events"
```

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/e` | Ingest one event → `204` |
| `GET` | `/stats?token=…` | HTML dashboard (token-guarded) |
| `GET` | `/stats?token=…&format=json` | Same data as JSON |
| `GET` | `/` | Health check → `ok` |

## Notes & trade-offs

- **Open ingest.** Because the app is open-source, any embedded key would be
  public, so `/e` accepts unauthenticated POSTs. Input is length-capped,
  control-stripped, and the event name is allow-listed, so the worst case is
  someone inflating counts — not data exfiltration. Fine for indie-scale install
  metrics; add a Cloudflare rate-limit rule if it's ever abused.
- **Storage.** One row per launch. D1's free tier holds millions of rows; if it
  ever grows large, prune with
  `DELETE FROM events WHERE day < date('now','-365 days')`.
- **Cost.** Workers + D1 free tiers (100k requests/day, 5M row reads/day) are far
  beyond what a launch like this needs.
