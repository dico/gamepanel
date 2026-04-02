import type { FastifyInstance } from 'fastify';
import { execFileSync } from 'child_process';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { auditRepo } from '../db/repositories/audit-repo.js';
import { nodeRepo } from '../db/repositories/node-repo.js';
import { serverRepo } from '../db/repositories/server-repo.js';
import { settingsRepo } from '../db/repositories/settings-repo.js';
import { getCachedServerStats, getCachedPlayerCounts } from '../services/status-monitor.js';
import { VERSION, config } from '../config.js';
import { metricsRepo } from '../db/repositories/metrics-repo.js';

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
    let updateAvailable = false;
    let remoteDigest: string | null = null;

    // Skip update check in development (local build, not from Docker Hub)
    if (config.isDev) {
      return { data: { current: VERSION, updateAvailable: false, updateCommand: 'cd /opt/gamepanel && docker compose pull && docker compose up -d' } };
    }

    try {
      // Check Docker Hub for latest image digest
      // Compare with our running image to detect actual changes
      const tokenRes = await fetch('https://auth.docker.io/token?service=registry.docker.io&scope=repository:fosenutvikling/gamepanel:pull', {
        signal: AbortSignal.timeout(5000),
      });
      if (tokenRes.ok) {
        const { token } = await tokenRes.json() as { token: string };
        const manifestRes = await fetch('https://registry-1.docker.io/v2/fosenutvikling/gamepanel/manifests/latest', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.docker.distribution.manifest.v2+json',
          },
          signal: AbortSignal.timeout(5000),
        });
        if (manifestRes.ok) {
          remoteDigest = manifestRes.headers.get('docker-content-digest');

          // Get local image digest
          try {
            const localInfo = execFileSync('docker', ['image', 'inspect', 'fosenutvikling/gamepanel:latest', '--format', '{{index .RepoDigests 0}}'], {
              timeout: 5000,
            }).toString().trim();
            const localDigest = localInfo.split('@')[1] || '';
            updateAvailable = !!remoteDigest && localDigest !== remoteDigest;
          } catch {
            updateAvailable = true; // Can't check local = assume update available
          }
        }
      }
    } catch { /* skip if offline */ }

    return {
      data: {
        current: VERSION,
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
      const pullOutput = execFileSync('docker', ['pull', 'fosenutvikling/gamepanel:latest'], {
        timeout: 120_000,
      }).toString();

      const isUpToDate = pullOutput.includes('Image is up to date');

      if (isUpToDate) {
        return { data: { updated: false, message: 'Already running the latest version' } };
      }

      // Schedule restart — respond first, then restart
      setTimeout(() => {
        try {
          execFileSync('docker', ['compose', 'pull'], { cwd: '/opt/gamepanel', timeout: 120_000 });
          execFileSync('docker', ['compose', 'up', '-d'], { cwd: '/opt/gamepanel', timeout: 120_000 });
        } catch { /* container will restart anyway */ }
      }, 1000);

      return { data: { updated: true, message: 'Update started. GamePanel will restart in a few seconds.' } };
    } catch (err: any) {
      return reply.status(500).send({ error: 'UpdateError', message: err.message });
    }
  });

  // Metrics history
  app.get<{
    Querystring: { type?: string; targetId?: string; period?: string };
  }>('/api/system/metrics', async (request) => {
    const type = (request.query.type || 'node') as 'node' | 'server';
    const targetId = request.query.targetId || 'local';
    const period = request.query.period || '24h';
    const history = metricsRepo.getHistory(type, targetId, period);
    return { data: history };
  });

  // Disk usage summary
  app.get('/api/system/disk', async () => {
    const servers = serverRepo.findAll();
    const serverDisk: Record<string, number> = {};

    // Get latest disk metric per server
    for (const server of servers) {
      const latest = metricsRepo.getHistory('server', server.id, '1h', 1);
      if (latest.length > 0 && latest[0].diskUsed) {
        serverDisk[server.id] = latest[0].diskUsed;
      }
    }

    // Get node disk
    const nodeMetrics = metricsRepo.getHistory('node', 'local', '1h', 1);
    const nodeDisk = nodeMetrics.length > 0 ? {
      used: nodeMetrics[0].diskUsed,
      total: nodeMetrics[0].diskTotal,
    } : null;

    return { data: { node: nodeDisk, servers: serverDisk } };
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
