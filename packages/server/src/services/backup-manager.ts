import { execSync } from 'child_process';
import { existsSync, mkdirSync, statSync, unlinkSync } from 'fs';
import { join, basename } from 'path';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { backupRepo } from '../db/repositories/backup-repo.js';
import { serverRepo } from '../db/repositories/server-repo.js';
import type { Backup } from '@gamepanel/shared';

function getBackupDir(): string {
  const dir = join(config.dataDir, 'backups');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function getServerDataDir(serverId: string): string {
  return join(config.dataDir, 'servers', serverId, 'data');
}

export const backupManager = {
  async create(serverId: string, name: string, createdBy?: string): Promise<Backup> {
    const server = serverRepo.findById(serverId);
    if (!server) throw new Error('Server not found');

    const dataDir = getServerDataDir(serverId);
    if (!existsSync(dataDir)) throw new Error('Server data directory not found');

    const backupId = nanoid();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `${server.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_${timestamp}.tar.gz`;
    const filePath = join(getBackupDir(), fileName);

    // Create tar.gz of server data directory
    execSync(`tar -czf "${filePath}" -C "${dataDir}" .`, { timeout: 300_000 });

    const stat = statSync(filePath);

    return backupRepo.create({
      id: backupId,
      serverId,
      name: name || `Backup ${timestamp}`,
      filePath: fileName, // Relative to backups dir
      sizeBytes: stat.size,
      createdBy,
    });
  },

  async restore(backupId: string): Promise<void> {
    const backup = backupRepo.findById(backupId);
    if (!backup) throw new Error('Backup not found');

    const server = serverRepo.findById(backup.serverId);
    if (!server) throw new Error('Server not found');

    if (server.status === 'running') {
      throw new Error('Stop the server before restoring a backup');
    }

    const filePath = join(getBackupDir(), backup.filePath);
    if (!existsSync(filePath)) throw new Error('Backup file not found on disk');

    const dataDir = getServerDataDir(backup.serverId);
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

    // Extract tar.gz over server data directory
    execSync(`tar -xzf "${filePath}" -C "${dataDir}"`, { timeout: 300_000 });
  },

  async remove(backupId: string): Promise<void> {
    const backup = backupRepo.findById(backupId);
    if (!backup) throw new Error('Backup not found');

    // Delete file from disk
    const filePath = join(getBackupDir(), backup.filePath);
    if (existsSync(filePath)) unlinkSync(filePath);

    // Delete record
    backupRepo.delete(backupId);
  },
};
