import { serverRepo } from '../db/repositories/server-repo.js';
import { nodeRepo } from '../db/repositories/node-repo.js';
import { getDocker } from '../docker/node-pool.js';
import { eventBus } from './event-bus.js';
import { DEFAULT_STATUS_POLL_INTERVAL } from '@gamepanel/shared';
import type { ServerStatus } from '@gamepanel/shared';

let intervalId: ReturnType<typeof setInterval> | null = null;

// Cached stats for instant API responses
const cachedServerStats = new Map<string, { cpu: number; memory: number }>();
const cachedPlayerCounts = new Map<string, { online: number; max: number; players: string[] }>();

export function getCachedServerStats(): Map<string, { cpu: number; memory: number }> {
  return cachedServerStats;
}

export function getCachedPlayerCounts(): Map<string, { online: number; max: number; players: string[] }> {
  return cachedPlayerCounts;
}

export function startStatusMonitor(): void {
  if (intervalId) return;

  // Initial sync
  syncAll();

  intervalId = setInterval(syncAll, DEFAULT_STATUS_POLL_INTERVAL);
  console.log(`Status monitor started (interval: ${DEFAULT_STATUS_POLL_INTERVAL / 1000}s)`);
}

export function stopStatusMonitor(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

async function syncAll(): Promise<void> {
  // Sync node statuses
  const nodes = nodeRepo.findAll();
  for (const node of nodes) {
    try {
      const docker = getDocker(node.id);
      await docker.ping();
      if (node.status !== 'online') {
        nodeRepo.updateStatus(node.id, 'online');
        eventBus.broadcastWs({ type: 'node:status', nodeId: node.id, status: 'online' });
      }

      // Broadcast node resources
      try {
        const info = await docker.info();

        // Get real memory from /proc/meminfo
        let memTotal = info.MemTotal || 0;
        let memUsed = 0;
        try {
          const { readFileSync } = await import('fs');
          const meminfo = readFileSync('/proc/meminfo', 'utf-8');
          const totalMatch = meminfo.match(/MemTotal:\s+(\d+)/);
          const availMatch = meminfo.match(/MemAvailable:\s+(\d+)/);
          if (totalMatch) memTotal = parseInt(totalMatch[1], 10) * 1024;
          if (totalMatch && availMatch) memUsed = memTotal - parseInt(availMatch[1], 10) * 1024;
        } catch { /* fallback */ }

        // Get disk from df
        let diskUsed = 0;
        let diskTotal = 0;
        try {
          const { execFileSync } = await import('child_process');
          const dfOutput = execFileSync('df', ['-B1', '/app/data'], { timeout: 5000 }).toString();
          const lines = dfOutput.trim().split('\n');
          if (lines.length >= 2) {
            const parts = lines[1].split(/\s+/);
            diskTotal = parseInt(parts[1], 10) || 0;
            diskUsed = parseInt(parts[2], 10) || 0;
          }
        } catch { /* skip */ }

        const resources = {
          cpuPercent: 0,
          memoryUsed: memUsed,
          memoryTotal: memTotal,
          diskUsed,
          diskTotal,
        };

        eventBus.broadcastWs({
          type: 'node:resources',
          nodeId: node.id,
          resources,
        });
      } catch { /* skip resource collection */ }
    } catch {
      if (node.status !== 'offline') {
        nodeRepo.updateStatus(node.id, 'offline');
        eventBus.broadcastWs({ type: 'node:status', nodeId: node.id, status: 'offline' });
      }
    }
  }

  // Sync server statuses with actual Docker state
  const servers = serverRepo.findAll();
  for (const server of servers) {
    if (!server.containerId) continue;

    try {
      const docker = getDocker(server.nodeId);
      const container = docker.getContainer(server.containerId);
      const info = await container.inspect();

      let actualStatus: ServerStatus;
      if (info.State.Running) {
        actualStatus = 'running';
      } else if (info.State.Restarting) {
        actualStatus = 'creating'; // Restarting = still setting up
      } else if (info.State.ExitCode !== 0 && info.State.ExitCode !== undefined) {
        actualStatus = 'error';
      } else {
        actualStatus = 'stopped';
      }

      // Don't override 'creating' status — server may be downloading/installing
      if (server.status === 'creating' && actualStatus === 'error') {
        // Container crashed during setup — check if it's restarting
        if (info.RestartCount > 0) {
          actualStatus = 'creating'; // Still trying
        }
      }

      if (actualStatus !== server.status) {
        serverRepo.updateStatus(server.id, actualStatus);
        eventBus.broadcastWs({
          type: 'server:status',
          serverId: server.id,
          nodeId: server.nodeId,
          status: actualStatus,
        });
      }

      // Emit stats for running containers
      if (actualStatus === 'running') {
        try {
          const stats = await container.stats({ stream: false });
          const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
          const sysDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
          const cpuCount = stats.cpu_stats.online_cpus || 1;
          const cpuPercent = sysDelta > 0 ? (cpuDelta / sysDelta) * cpuCount * 100 : 0;
          const memoryUsage = stats.memory_stats.usage || 0;

          const cpuRounded = Math.round(cpuPercent * 10) / 10;
          cachedServerStats.set(server.id, { cpu: cpuRounded, memory: memoryUsage });
          eventBus.broadcastWs({
            type: 'server:stats',
            serverId: server.id,
            cpu: cpuRounded,
            memory: memoryUsage,
          });
        } catch {
          // Stats might fail briefly, skip
        }
      }
    } catch {
      // Container might have been removed externally
      if (server.status !== 'error') {
        serverRepo.updateStatus(server.id, 'error');
        eventBus.broadcastWs({
          type: 'server:status',
          serverId: server.id,
          nodeId: server.nodeId,
          status: 'error',
        });
      }
    }
  }
}
