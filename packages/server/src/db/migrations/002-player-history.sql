CREATE TABLE IF NOT EXISTS player_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id   TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  player_uuid TEXT,
  first_seen  TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_player_history_unique
  ON player_history(server_id, player_name);

CREATE INDEX IF NOT EXISTS idx_player_history_server
  ON player_history(server_id, last_seen DESC);
