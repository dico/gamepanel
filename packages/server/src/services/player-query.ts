import { GameDig } from 'gamedig';
import { serverRepo } from '../db/repositories/server-repo.js';
import { playerRepo } from '../db/repositories/player-repo.js';
import { nodeRepo } from '../db/repositories/node-repo.js';
import { getTemplate } from '../templates/template-loader.js';
import { eventBus } from './event-bus.js';
import { getCachedPlayerCounts } from './status-monitor.js';
import { DEFAULT_PLAYER_QUERY_INTERVAL } from '@gamepanel/shared';

let intervalId: ReturnType<typeof setInterval> | null = null;

// Map template query types to gamedig types
const QUERY_TYPE_MAP: Record<string, string> = {
  'minecraft': 'minecraft',
  'minecraft-bedrock': 'minecraftbe',
  'source': 'csgo',  // Source query works for CS2, TF2, etc.
};

export function startPlayerQuery(): void {
  if (intervalId) return;

  queryAll();
  intervalId = setInterval(queryAll, DEFAULT_PLAYER_QUERY_INTERVAL);
  console.log(`Player query started (interval: ${DEFAULT_PLAYER_QUERY_INTERVAL / 1000}s)`);
}

export function stopPlayerQuery(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

async function queryAll(): Promise<void> {
  const servers = serverRepo.findAll().filter(s => s.status === 'running');

  for (const server of servers) {
    const template = getTemplate(server.templateSlug);
    if (!template || template.query.type === 'none') continue;

    const gamedigType = QUERY_TYPE_MAP[template.query.type];
    if (!gamedigType) continue;

    // Determine query host
    const node = nodeRepo.findById(server.nodeId);
    const queryPort = server.ports.find(p => p.container === template.query.port);
    if (!queryPort) continue;

    // Determine query host
    // When running in Docker, localhost doesn't reach the host — use QUERY_HOST env or host IP
    let host = process.env.QUERY_HOST || '127.0.0.1';
    if (node && node.host !== 'local') {
      try {
        const url = new URL(node.host);
        host = url.hostname;
      } catch { continue; }
    }

    try {
      const result = await GameDig.query({
        type: gamedigType,
        host,
        port: queryPort.host,
        maxRetries: 1,
        socketTimeout: 3000,
      });

      const online = result.players.length;
      const max = result.maxplayers;
      const players = result.players
        .filter((p: any) => p.name)
        .map((p: any) => p.name as string);

      // Cache and broadcast player info via WebSocket
      getCachedPlayerCounts().set(server.id, { online, max, players });
      eventBus.emit('ws:broadcast', {
        type: 'server:players',
        serverId: server.id,
        online,
        max,
        players,
      });

      // Store player history
      if (result.players.length > 0) {
        const playerData = result.players
          .filter((p: any) => p.name)
          .map((p: any) => ({
            name: p.name as string,
            uuid: (p as any).raw?.id as string | undefined,
          }));

        if (playerData.length > 0) {
          playerRepo.upsertMany(server.id, playerData);
        }
      }
    } catch {
      // Query failed — server might not be ready yet, skip silently
    }
  }
}
