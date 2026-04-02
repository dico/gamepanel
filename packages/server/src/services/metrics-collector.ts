import { execFileSync } from 'child_process';
import { statSync, readdirSync } from 'fs';
import { join } from 'path';
import { metricsRepo } from '../db/repositories/metrics-repo.js';
import { serverRepo } from '../db/repositories/server-repo.js';
import { nodeRepo } from '../db/repositories/node-repo.js';
import { notificationRepo } from '../db/repositories/notification-repo.js';
import { getDocker } from '../docker/node-pool.js';
import { eventBus } from './event-bus.js';
import { config } from '../config.js';
import { nanoid } from 'nanoid';

let intervalId: ReturnType<typeof setInterval> | null = null;
const COLLECT_INTERVAL = 60_000; // Every 60 seconds
const CLEANUP_INTERVAL = 6 * 60 * 60_000; // Every 6 hours

// Track disk warning state to avoid spamming
const diskWarned = new Map<string, number>();

export function startMetricsCollector(): void {
  if (intervalId) return;

  // Collect immediately, then on interval
  collectAll();
  intervalId = setInterval(collectAll, COLLECT_INTERVAL);

  // Periodic cleanup of old data
  setInterval(() => metricsRepo.cleanup(), CLEANUP_INTERVAL);

  console.log(`Metrics collector started (interval: ${COLLECT_INTERVAL / 1000}s)`);
}

async function collectAll(): Promise<void> {
  // Collect node metrics
  const nodes = nodeRepo.findAll();
  for (const node of nodes) {
    try {
      const docker = getDocker(node.id);
      const info = await docker.info();

      // Get host disk usage
      let diskUsed = 0;
      let diskTotal = 0;
      try {
        const dfOutput = execFileSync('df', ['-B1', '/app/data'], { timeout: 5000 }).toString();
        const lines = dfOutput.trim().split('\n');
        if (lines.length >= 2) {
          const parts = lines[1].split(/\s+/);
          diskTotal = parseInt(parts[1], 10) || 0;
          diskUsed = parseInt(parts[2], 10) || 0;
        }
      } catch { /* skip if df not available */ }

      // Get real memory usage from /proc/meminfo or free command
      let memTotal = info.MemTotal || 0;
      let memUsed = 0;
      try {
        const freeOutput = execFileSync('free', ['-b'], { timeout: 5000 }).toString();
        const memLine = freeOutput.split('\n').find(l => l.startsWith('Mem:'));
        if (memLine) {
          const parts = memLine.split(/\s+/);
          memTotal = parseInt(parts[1], 10) || memTotal;
          memUsed = parseInt(parts[2], 10) || 0;
        }
      } catch { /* fallback: can't determine */ }

      const nodeMetric = {
        cpuPercent: null,
        memoryUsed: memUsed,
        memoryTotal: memTotal,
        diskUsed,
        diskTotal,
      };

      metricsRepo.insert('node', node.id, nodeMetric);

      // Check disk warnings
      if (diskTotal > 0) {
        const diskPercent = (diskUsed / diskTotal) * 100;
        checkDiskWarning(node.id, node.name, diskPercent);
      }
    } catch { /* skip offline nodes */ }
  }

  // Collect per-server metrics
  const servers = serverRepo.findAll().filter(s => s.status === 'running' && s.containerId);
  for (const server of servers) {
    try {
      const docker = getDocker(server.nodeId);
      const container = docker.getContainer(server.containerId!);
      const stats = await container.stats({ stream: false });

      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
      const sysDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      const cpuCount = stats.cpu_stats.online_cpus || 1;
      const cpuPercent = sysDelta > 0 ? (cpuDelta / sysDelta) * cpuCount * 100 : 0;
      const memoryUsed = stats.memory_stats.usage || 0;
      const memoryTotal = stats.memory_stats.limit || 0;

      // Get server data directory size
      let diskUsed = 0;
      try {
        diskUsed = getDirSize(join(config.dataDir, 'servers', server.id, 'data'));
      } catch { /* skip */ }

      metricsRepo.insert('server', server.id, {
        cpuPercent: Math.round(cpuPercent * 10) / 10,
        memoryUsed,
        memoryTotal,
        diskUsed,
        diskTotal: null,
      });
    } catch { /* skip */ }
  }
}

function getDirSize(dirPath: string): number {
  try {
    const output = execFileSync('du', ['-sb', dirPath], { timeout: 10000 }).toString();
    return parseInt(output.split('\t')[0], 10) || 0;
  } catch {
    return 0;
  }
}

function checkDiskWarning(nodeId: string, nodeName: string, percent: number): void {
  const thresholds = [
    { level: 95, severity: 'critical' as const, msg: 'critically low' },
    { level: 90, severity: 'critical' as const, msg: 'very low' },
    { level: 80, severity: 'warning' as const, msg: 'getting low' },
  ];

  for (const t of thresholds) {
    if (percent >= t.level) {
      const lastWarned = diskWarned.get(`${nodeId}-${t.level}`) || 0;
      const hoursSinceWarned = (Date.now() - lastWarned) / 3600_000;

      // Only warn once per hour per threshold
      if (hoursSinceWarned > 1) {
        diskWarned.set(`${nodeId}-${t.level}`, Date.now());
        notificationRepo.create({
          id: nanoid(),
          level: t.severity,
          title: `Disk space ${t.msg}`,
          message: `${nodeName}: ${percent.toFixed(1)}% disk used`,
          nodeId,
        });
        eventBus.broadcastWs({
          type: 'notification',
          notification: {
            id: nanoid(),
            level: t.severity,
            title: `Disk space ${t.msg}`,
            message: `${nodeName}: ${percent.toFixed(1)}% disk used`,
            serverId: null,
            nodeId,
            read: false,
            createdAt: new Date().toISOString(),
          },
        });
      }
      break; // Only trigger highest threshold
    }
  }
}
