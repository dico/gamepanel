import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditRepo } from '../db/repositories/audit-repo.js';
import { nodeRepo } from '../db/repositories/node-repo.js';
import { serverRepo } from '../db/repositories/server-repo.js';
import { settingsRepo } from '../db/repositories/settings-repo.js';
import { getCachedServerStats, getCachedPlayerCounts } from '../services/status-monitor.js';

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authMiddleware);

  // System status overview
  app.get('/api/system/status', async () => {
    const servers = serverRepo.findAll();
    const nodes = nodeRepo.findAll();
    return {
      data: {
        servers: {
          total: servers.length,
          running: servers.filter(s => s.status === 'running').length,
          stopped: servers.filter(s => s.status === 'stopped').length,
          error: servers.filter(s => s.status === 'error').length,
        },
        nodes: {
          total: nodes.length,
          online: nodes.filter(n => n.status === 'online').length,
        },
      },
    };
  });

  // Cached live stats — instant response, no waiting for next poll
  app.get('/api/system/live-stats', async () => {
    const stats: Record<string, { cpu: number; memory: number }> = {};
    for (const [id, s] of getCachedServerStats()) stats[id] = s;

    const players: Record<string, { online: number; max: number; players: string[] }> = {};
    for (const [id, p] of getCachedPlayerCounts()) players[id] = p;

    return { data: { stats, players } };
  });

  // Get settings
  app.get('/api/settings', async () => {
    return { data: settingsRepo.getAll() };
  });

  // Update settings (admin only)
  app.patch<{
    Body: Record<string, string>;
  }>('/api/settings', {
    onRequest: requireRole('admin'),
  }, async (request) => {
    for (const [key, value] of Object.entries(request.body)) {
      settingsRepo.set(key, value);
    }
    return { data: settingsRepo.getAll() };
  });

  // Audit log viewer (admin only)
  app.get<{
    Querystring: { limit?: string; offset?: string };
  }>('/api/audit-log', {
    onRequest: requireRole('admin'),
  }, async (request) => {
    const limit = parseInt(request.query.limit || '50', 10);
    const offset = parseInt(request.query.offset || '0', 10);
    const { entries, total } = auditRepo.findAll({ limit, offset });
    return { data: entries, total, page: Math.floor(offset / limit) + 1, pageSize: limit };
  });
}
