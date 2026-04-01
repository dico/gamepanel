import { getDb } from '../index.js';
import type { Backup } from '@gamepanel/shared';

interface BackupRow {
  id: string;
  server_id: string;
  name: string;
  file_path: string;
  size_bytes: number | null;
  created_by: string | null;
  created_at: string;
}

function rowToBackup(row: BackupRow): Backup {
  return {
    id: row.id,
    serverId: row.server_id,
    name: row.name,
    filePath: row.file_path,
    sizeBytes: row.size_bytes,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export const backupRepo = {
  findById(id: string): Backup | null {
    const row = getDb().prepare('SELECT * FROM backups WHERE id = ?').get(id) as BackupRow | undefined;
    return row ? rowToBackup(row) : null;
  },

  findByServerId(serverId: string): Backup[] {
    return (getDb().prepare(
      'SELECT * FROM backups WHERE server_id = ? ORDER BY created_at DESC'
    ).all(serverId) as BackupRow[]).map(rowToBackup);
  },

  create(backup: { id: string; serverId: string; name: string; filePath: string; sizeBytes?: number; createdBy?: string }): Backup {
    getDb().prepare(
      'INSERT INTO backups (id, server_id, name, file_path, size_bytes, created_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(backup.id, backup.serverId, backup.name, backup.filePath, backup.sizeBytes ?? null, backup.createdBy ?? null);
    return this.findById(backup.id)!;
  },

  delete(id: string): void {
    getDb().prepare('DELETE FROM backups WHERE id = ?').run(id);
  },
};
