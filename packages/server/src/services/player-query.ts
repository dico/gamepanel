import { GameDig } from 'gamedig';
import { serverRepo } from '../db/repositories/server-repo.js';
import { playerRepo } from '../db/repositories/player-repo.js';
import { nodeRepo } from '../db/repositories/node-repo.js';
import { getTemplate } from '../templates/template-loader.js';
import { eventBus } from './event-bus.js';
import { getCachedPlayerCounts } from './status-monitor.js';
import { DEFAULT_PLAYER_QUERY_INTERVAL } from '@gamepanel/shared';
import type { Server } from '@gamepanel/shared';

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
      eventBus.broadcastWs({
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
      // Gamedig failed — try RCON fallback for Minecraft
      try {
        if (server.containerId && template.query.type === 'minecraft') {
          await queryViaRcon(server);
        }
      } catch { /* skip */ }
    }
  }
}

async function queryViaRcon(server: Server): Promise<void> {
  const { getDocker } = await import('../docker/node-pool.js');
  const docker = getDocker(server.nodeId);
  const container = docker.getContainer(server.containerId!);

  const exec = await container.exec({
    Cmd: ['rcon-cli', 'list'],
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({ hijack: true, stdin: false });
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve) => {
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', resolve);
    setTimeout(resolve, 3000);
  });

  const output = Buffer.concat(chunks).toString('utf-8').trim();
  // Parse "There are X of a max of Y players online: player1, player2"
  const match = output.match(/There are (\d+) of a max of (\d+) players? online:?\s*(.*)?/i);
  if (!match) return;

  const online = parseInt(match[1], 10);
  const max = parseInt(match[2], 10);
  const playerNames = match[3]?.split(',').map(n => n.trim()).filter(n => n.length > 0) ?? [];

  getCachedPlayerCounts().set(server.id, { online, max, players: playerNames });
  eventBus.broadcastWs({
    type: 'server:players',
    serverId: server.id,
    online,
    max,
    players: playerNames,
  });

  if (playerNames.length > 0) {
    playerRepo.upsertMany(server.id, playerNames.map(name => ({ name })));
  }
}
