# GamePanel — Datamodell og autentisering

## Database: SQLite (better-sqlite3)

Synkron API, ingen ekstern database-server, cross-platform. En enkelt fil: `data/gamepanel.db`.

---

## Skjema

```sql
-- =====================
-- BRUKERE OG TILGANG
-- =====================

CREATE TABLE users (
  id            TEXT PRIMARY KEY,       -- nanoid
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,          -- bcrypt (cost 12)
  role          TEXT NOT NULL DEFAULT 'admin',  -- admin | operator | viewer
  display_name  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,       -- session token
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE api_tokens (
  id            TEXT PRIMARY KEY,       -- nanoid
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,          -- "Discord bot", "Cron script"
  token_hash    TEXT NOT NULL,          -- bcrypt hash av token
  last_used_at  TEXT,
  expires_at    TEXT,                   -- null = aldri
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =====================
-- NODER
-- =====================

CREATE TABLE nodes (
  id            TEXT PRIMARY KEY,       -- nanoid
  name          TEXT NOT NULL,
  host          TEXT NOT NULL,          -- "local" eller "tcp://host:port"
  tls_config    TEXT,                   -- JSON: { ca, cert, key } paths (null for local)
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'offline',  -- online | offline | error
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =====================
-- SPILLSERVERE
-- =====================

CREATE TABLE servers (
  id            TEXT PRIMARY KEY,       -- nanoid
  node_id       TEXT NOT NULL REFERENCES nodes(id),
  name          TEXT NOT NULL,
  template_slug TEXT NOT NULL,
  container_id  TEXT,
  status        TEXT NOT NULL DEFAULT 'stopped',  -- stopped | running | error | creating
  ports         TEXT NOT NULL,          -- JSON: [{ name, host, container, protocol }]
  environment   TEXT NOT NULL,          -- JSON: { KEY: "value" }
  config_values TEXT NOT NULL DEFAULT '{}',  -- JSON: managed config field verdier
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =====================
-- PRESETS
-- =====================

CREATE TABLE presets (
  id            TEXT PRIMARY KEY,       -- nanoid
  template_slug TEXT NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  environment   TEXT NOT NULL,          -- JSON
  config_values TEXT NOT NULL,          -- JSON
  ports_offset  INTEGER NOT NULL DEFAULT 0,
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =====================
-- LOGGING OG HENDELSER
-- =====================

-- Audit log — hvem gjorde hva (brukerutloste handlinger)
CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,            -- server:create, server:start, config:update, osv.
  target     TEXT,                     -- server_id, node_id, eller null
  details    TEXT,                     -- JSON: ekstra kontekst
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Server-events (automatiske hendelser, ikke brukerutloste)
CREATE TABLE server_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id  TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,            -- started | stopped | crashed | health_ok | health_fail
  message    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Varsler
CREATE TABLE notifications (
  id         TEXT PRIMARY KEY,         -- nanoid
  level      TEXT NOT NULL,            -- critical | warning | info
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

CREATE TABLE backups (
  id         TEXT PRIMARY KEY,         -- nanoid
  server_id  TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,            -- "Manuell backup" eller "Automatisk 2026-03-31"
  file_path  TEXT NOT NULL,            -- relativ sti til zip
  size_bytes INTEGER,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =====================
-- SYSTEM
-- =====================

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

---

## Seed-data ved forste kjoring

```sql
INSERT INTO users (id, username, password_hash, role, display_name)
  VALUES ('admin', 'admin', '<bcrypt hash fra setup>', 'admin', 'Administrator');

INSERT INTO nodes (id, name, host)
  VALUES ('local', 'Lokal', 'local');
```

---

## Entity-relasjoner

```
User --1:N--> Session
User --1:N--> ApiToken
User --1:N--> AuditLog
User --1:N--> Preset (created_by)
User --1:N--> Backup (created_by)

Node --1:N--> Server

Template (JSON, in-memory) --1:N--> Server
Template --1:N--> Preset

Server --1:1--> Docker Container (runtime)
Server --1:N--> ServerEvent
Server --1:N--> Notification
Server --1:N--> Backup

Node --1:N--> Notification
```

---

## Autentisering

### MVP-flyt

1. `setup.sh` oppretter default admin-bruker med brukernavn/passord
2. Bruker logger inn via `/login` — far session cookie (HttpOnly, Secure, SameSite)
3. Middleware sjekker session pa alle `/api/*` og `/ws/*`
4. `req.user` er tilgjengelig i alle route-handlers fra dag 1
5. Alle skrive-handlinger logges i `audit_log` med `user_id`

### API-tokens

- Bruker oppretter API-tokens via profil-siden
- Tokens sendes som `Authorization: Bearer <token>` header
- Backend sjekker bade session-cookie og Bearer-token
- Nyttig for: Discord-bot, cron-scripts, CI/CD

### Passord

- bcrypt med cost factor 12
- Minimum 8 tegn (validert i backend)
- Passord-bytte via profil-siden

---

## Rollemodell

Forberedt i backend fra dag 1, men kun admin-bruker i MVP.
Multi-bruker UI kommer i fase 3.

| Rolle | Rettigheter |
|-------|-------------|
| **admin** | Full tilgang. Opprette/slette servere, noder, brukere. Docker management. |
| **operator** | Starte/stoppe/restarte servere, redigere config og filer. Kan ikke slette, opprette eller administrere brukere. |
| **viewer** | Kun lesetilgang. Se dashboard, konsoll (read-only), status. |

Backend sjekker rolle pa alle endepunkter via `role.ts` middleware.
Nar multi-bruker UI legges til i fase 3 trenger vi ikke rore backend-logikken.

---

## JSON-kolonner

`ports`, `environment`, `config_values`, `tls_config` og `details` lagres som JSON-strenger.
Disse er variabel-shape data definert av templates. Normalisering til separate tabeller
gir ingen fordel — vi laster alltid hele server-recorden.
