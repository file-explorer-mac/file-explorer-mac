-- File Explorer anonymous usage analytics — D1 schema.
-- One row per app launch. No IP addresses, no file data, no personal data.

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,  -- unix seconds, assigned by the Worker
  day         TEXT    NOT NULL,  -- 'YYYY-MM-DD' (UTC), assigned by the Worker
  install_id  TEXT    NOT NULL,  -- random uuid generated locally on the client
  event       TEXT    NOT NULL,  -- e.g. 'app_started'
  app_version TEXT,
  os          TEXT,              -- 'darwin' | 'win32' | 'linux'
  os_version  TEXT,              -- os.release(), e.g. '23.5.0'
  arch        TEXT,              -- 'arm64' | 'x64'
  country     TEXT,              -- coarse, from the Cloudflare edge (cf-ipcountry)
  managed     TEXT,              -- 'none' | 'mdm' | 'dep' — coarse B2B proxy
  dow         INTEGER,           -- local weekday at launch, 0=Sun … 6=Sat
  hour        INTEGER            -- local hour at launch, 0–23
);

CREATE INDEX IF NOT EXISTS idx_events_day ON events(day);
CREATE INDEX IF NOT EXISTS idx_events_install ON events(install_id);
CREATE INDEX IF NOT EXISTS idx_events_event ON events(event);
