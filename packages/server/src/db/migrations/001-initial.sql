-- =====================
-- BRUKERE OG TILGANG
-- =====================

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin',
  display_name  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  token_hash    TEXT NOT NULL,
  last_used_at  TEXT,
  expires_at    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =====================
-- NODER
-- =====================

CREATE TABLE IF NOT EXISTS nodes (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  host          TEXT NOT NULL,
  tls_config    TEXT,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'offline',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =====================
-- SPILLSERVERE
-- =====================

CREATE TABLE IF NOT EXISTS servers (
  id            TEXT PRIMARY KEY,
  node_id       TEXT NOT NULL REFERENCES nodes(id),
  name          TEXT NOT NULL,
  template_slug TEXT NOT NULL,
  container_id  TEXT,
  status        TEXT NOT NULL DEFAULT 'stopped',
  ports         TEXT NOT NULL,
  environment   TEXT NOT NULL,
  config_values TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =====================
-- PRESETS
-- =====================

CREATE TABLE IF NOT EXISTS presets (
  id            TEXT PRIMARY KEY,
  template_slug TEXT NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  environment   TEXT NOT NULL,
  config_values TEXT NOT NULL,
  ports_offset  INTEGER NOT NULL DEFAULT 0,
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =====================
-- LOGGING OG HENDELSER
-- =====================

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  target     TEXT,
  details    TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS server_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id  TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  message    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  level      TEXT NOT NULL,
  title      TEXT NOT NULL,
  message    TEXT,
  server_id  TEXT REFERENCES servers(id) ON DELETE CASCADE,
  node_id    TEXT REFERENCES nodes(id) ON DELETE SET NULL,
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =====================
-- BACKUPS
-- =====================

CREATE TABLE IF NOT EXISTS backups (
  id         TEXT PRIMARY KEY,
  server_id  TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  file_path  TEXT NOT NULL,
  size_bytes INTEGER,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =====================
-- SYSTEM
-- =====================

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
