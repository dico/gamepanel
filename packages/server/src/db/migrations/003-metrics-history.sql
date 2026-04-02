CREATE TABLE IF NOT EXISTS metrics_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL,          -- 'node' or 'server'
  target_id   TEXT NOT NULL,          -- node_id or server_id
  cpu_percent REAL,
  memory_used INTEGER,
  memory_total INTEGER,
  disk_used   INTEGER,
  disk_total  INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_metrics_history_target
  ON metrics_history(type, target_id, created_at DESC);

-- Clean up old metrics (keep 7 days) via application logic
