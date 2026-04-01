import { getDb } from '../index.js';

export interface PlayerRecord {
  id: number;
  serverId: string;
  playerName: string;
  playerUuid: string | null;
  firstSeen: string;
  lastSeen: string;
}

interface PlayerRow {
  id: number;
  server_id: string;
  player_name: string;
  player_uuid: string | null;
  first_seen: string;
  last_seen: string;
}

function rowToRecord(row: PlayerRow): PlayerRecord {
  return {
    id: row.id,
    serverId: row.server_id,
    playerName: row.player_name,
    playerUuid: row.player_uuid,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
  };
}

export const playerRepo = {
  /** Upsert a player — update last_seen if exists, insert if new */
  upsert(serverId: string, playerName: string, playerUuid?: string): void {
    getDb().prepare(`
      INSERT INTO player_history (server_id, player_name, player_uuid)
      VALUES (?, ?, ?)
      ON CONFLICT(server_id, player_name) DO UPDATE SET
        last_seen = datetime('now'),
        player_uuid = COALESCE(excluded.player_uuid, player_uuid)
    `).run(serverId, playerName, playerUuid ?? null);
  },

  /** Upsert multiple players at once */
  upsertMany(serverId: string, players: { name: string; uuid?: string }[]): void {
    const stmt = getDb().prepare(`
      INSERT INTO player_history (server_id, player_name, player_uuid)
      VALUES (?, ?, ?)
      ON CONFLICT(server_id, player_name) DO UPDATE SET
        last_seen = datetime('now'),
        player_uuid = COALESCE(excluded.player_uuid, player_uuid)
    `);

    const tx = getDb().transaction(() => {
      for (const p of players) {
        stmt.run(serverId, p.name, p.uuid ?? null);
      }
    });
    tx();
  },

  /** Get all players for a server, most recent first */
  findByServerId(serverId: string, limit = 100): PlayerRecord[] {
    const rows = getDb().prepare(
      'SELECT * FROM player_history WHERE server_id = ? ORDER BY last_seen DESC LIMIT ?'
    ).all(serverId, limit) as PlayerRow[];
    return rows.map(rowToRecord);
  },

  /** Get player count for a server */
  countByServerId(serverId: string): number {
    return (getDb().prepare(
      'SELECT COUNT(*) as count FROM player_history WHERE server_id = ?'
    ).get(serverId) as { count: number }).count;
  },

  /** Delete player history for a server */
  deleteByServerId(serverId: string): void {
    getDb().prepare('DELETE FROM player_history WHERE server_id = ?').run(serverId);
  },
};
