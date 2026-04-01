import type { FastifyInstance } from 'fastify';
import { execSync } from 'child_process';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditRepo } from '../db/repositories/audit-repo.js';
import { nodeRepo } from '../db/repositories/node-repo.js';
import { serverRepo } from '../db/repositories/server-repo.js';
import { settingsRepo } from '../db/repositories/settings-repo.js';
import { getCachedServerStats, getCachedPlayerCounts } from '../services/status-monitor.js';
import { VERSION } from '../config.js';

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

  // Version and update check
  app.get('/api/system/version', async () => {
    let latest: string | null = null;
    let updateAvailable = false;

    try {
      // Check GitHub for latest release tag
      const res = await fetch('https://api.github.com/repos/dico/gamepanel/tags?per_page=1', {
        headers: { 'User-Agent': 'GamePanel' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const tags = await res.json() as { name: string }[];
        if (tags.length > 0) {
          latest = tags[0].name.replace(/^v/, '');
          updateAvailable = latest !== VERSION;
        }
      }
    } catch { /* skip if offline */ }

    return {
      data: {
        current: VERSION,
        latest,
        updateAvailable,
        updateCommand: 'cd /opt/gamepanel && docker compose pull && docker compose up -d',
      },
    };
  });

  // Self-update — pull new image and recreate container
  app.post('/api/system/update', {
    onRequest: requireRole('admin'),
  }, async (request, reply) => {
    try {
      // Pull latest image
      const pullOutput = execSync('docker pull fosenutvikling/gamepanel:latest 2>&1', {
        timeout: 120_000,
      }).toString();

      const isUpToDate = pullOutput.includes('Image is up to date');

      if (isUpToDate) {
        return { data: { updated: false, message: 'Already running the latest version' } };
      }

      // Schedule restart — respond first, then restart
      setTimeout(() => {
        try {
          execSync('docker compose pull && docker compose up -d', {
            cwd: '/opt/gamepanel',
            timeout: 120_000,
          });
        } catch { /* container will restart anyway */ }
      }, 1000);

      return { data: { updated: true, message: 'Update started. GamePanel will restart in a few seconds.' } };
    } catch (err: any) {
      return reply.status(500).send({ error: 'UpdateError', message: err.message });
    }
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
