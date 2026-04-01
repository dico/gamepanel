import type { FastifyInstance } from 'fastify';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { backupRepo } from '../db/repositories/backup-repo.js';
import { backupManager } from '../services/backup-manager.js';
import { auditRepo } from '../db/repositories/audit-repo.js';
import { config } from '../config.js';

export async function backupRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authMiddleware);

  // List backups for a server
  app.get<{ Params: { id: string } }>('/api/servers/:id/backups', async (request) => {
    return { data: backupRepo.findByServerId(request.params.id) };
  });

  // Create backup
  app.post<{
    Params: { id: string };
    Body: { name?: string };
  }>('/api/servers/:id/backups', {
    onRequest: requireRole('operator'),
  }, async (request, reply) => {
    try {
      const backup = await backupManager.create(
        request.params.id,
        request.body?.name || '',
        request.user!.id,
      );
      auditRepo.log(request.user!.id, 'backup:create', backup.id, { serverId: request.params.id }, request.ip);
      return reply.status(201).send({ data: backup });
    } catch (err: any) {
      return reply.status(400).send({ error: 'BackupError', message: err.message });
    }
  });

  // Restore backup
  app.post<{ Params: { backupId: string } }>('/api/backups/:backupId/restore', {
    onRequest: requireRole('admin'),
  }, async (request, reply) => {
    try {
      await backupManager.restore(request.params.backupId);
      auditRepo.log(request.user!.id, 'backup:restore', request.params.backupId, undefined, request.ip);
      return { data: { ok: true } };
    } catch (err: any) {
      return reply.status(400).send({ error: 'RestoreError', message: err.message });
    }
  });

  // Download backup file
  app.get<{ Params: { backupId: string } }>('/api/backups/:backupId/download', async (request, reply) => {
    const backup = backupRepo.findById(request.params.backupId);
    if (!backup) return reply.status(404).send({ error: 'NotFound', message: 'Backup not found' });

    const filePath = join(config.dataDir, 'backups', backup.filePath);
    if (!existsSync(filePath)) return reply.status(404).send({ error: 'NotFound', message: 'Backup file not found' });

    reply.header('Content-Disposition', `attachment; filename="${backup.filePath}"`);
    reply.header('Content-Type', 'application/gzip');
    return reply.send(readFileSync(filePath));
  });

  // Delete backup
  app.delete<{ Params: { backupId: string } }>('/api/backups/:backupId', {
    onRequest: requireRole('admin'),
  }, async (request, reply) => {
    try {
      await backupManager.remove(request.params.backupId);
      auditRepo.log(request.user!.id, 'backup:delete', request.params.backupId, undefined, request.ip);
      return { data: { ok: true } };
    } catch (err: any) {
      return reply.status(400).send({ error: 'DeleteError', message: err.message });
    }
  });
}
