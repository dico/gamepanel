import type { FastifyInstance } from 'fastify';
import { serverRepo } from '../db/repositories/server-repo.js';
import { sessionRepo } from '../db/repositories/session-repo.js';
import { userRepo } from '../db/repositories/user-repo.js';
import { getDocker } from '../docker/node-pool.js';
import type { WebSocket } from '@fastify/websocket';

/**
 * Demux Docker multiplexed stream.
 * Each frame: [stream_type(1) + 0(3) + size(4 big-endian)] + payload
 * Returns clean text lines with empty lines filtered out.
 */
function cleanLine(raw: string): string {
  // Replace tabs with single space, strip \r, trim
  return raw.replace(/\t/g, ' ').replace(/\r/g, '').trim();
}

function extractLines(text: string): string[] {
  return text.split('\n').map(cleanLine).filter(l => l.length > 0);
}

function demuxDockerStream(buf: Buffer): string[] {
  const lines: string[] = [];
  let offset = 0;

  while (offset < buf.length) {
    // Check if this looks like a Docker multiplexed header
    if (offset + 8 <= buf.length && buf[offset] <= 2 && buf[offset + 1] === 0 && buf[offset + 2] === 0 && buf[offset + 3] === 0) {
      const size = buf.readUInt32BE(offset + 4);
      offset += 8;
      if (size > 0 && offset + size <= buf.length) {
        lines.push(...extractLines(buf.subarray(offset, offset + size).toString('utf-8')));
        offset += size;
      } else {
        break;
      }
    } else {
      // No Docker header — raw text
      lines.push(...extractLines(buf.subarray(offset).toString('utf-8')));
      break;
    }
  }

  return lines;
}

// Per-server log buffer (last N lines)
const logBuffers = new Map<string, string[]>();
const MAX_BUFFER_SIZE = 500;

function getBuffer(serverId: string): string[] {
  if (!logBuffers.has(serverId)) {
    logBuffers.set(serverId, []);
  }
  return logBuffers.get(serverId)!;
}

export function pushToBuffer(serverId: string, line: string): void {
  const buffer = getBuffer(serverId);
  buffer.push(line);
  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer.splice(0, buffer.length - MAX_BUFFER_SIZE);
  }
}

// Track active WebSocket connections per server
const activeConnections = new Map<string, Set<WebSocket>>();

export async function consoleWsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>('/ws/servers/:id/console', { websocket: true }, (socket, request) => {
    // Authenticate via session cookie
    const sessionId = request.cookies?.session;
    if (!sessionId) { socket.close(4001, 'Unauthorized'); return; }
    const session = sessionRepo.findById(sessionId);
    if (!session) { socket.close(4001, 'Session expired'); return; }
    const user = userRepo.findById(session.user_id);
    if (!user) { socket.close(4001, 'User not found'); return; }

    const serverId = request.params.id;
    const server = serverRepo.findById(serverId);

    if (!server) {
      socket.close(4004, 'Server not found');
      return;
    }

    // Track connection
    if (!activeConnections.has(serverId)) {
      activeConnections.set(serverId, new Set());
    }
    activeConnections.get(serverId)!.add(socket);

    // Fetch history and optionally start live streaming
    let logStream: NodeJS.ReadableStream | null = null;

    if (server.containerId) {
      // Fetch history (works for both running and stopped containers)
      fetchHistory(serverId, server.containerId, server.nodeId).then(() => {
        const buffer = getBuffer(serverId);
        if (buffer.length > 0) {
          socket.send(JSON.stringify({ type: 'history', lines: buffer }));
        }
        // Only attach live stream if running
        if (server.status === 'running') {
          return attachToContainer(serverId, server.containerId!, server.nodeId, socket);
        }
        return null;
      }).then(stream => {
        if (stream) logStream = stream;
      }).catch(err => {
        socket.send(JSON.stringify({ type: 'error', message: `Failed to attach: ${err.message}` }));
      });
    } else {
      const buffer = getBuffer(serverId);
      if (buffer.length > 0) {
        socket.send(JSON.stringify({ type: 'history', lines: buffer }));
      }
    }

    // Handle incoming commands
    socket.on('message', async (data: Buffer | string) => {
      const msg = data.toString();
      try {
        const parsed = JSON.parse(msg);
        if (parsed.type === 'command' && parsed.command) {
          await sendCommand(serverId, parsed.command);
        }
      } catch {
        // Treat as raw command text
        await sendCommand(serverId, msg);
      }
    });

    socket.on('close', () => {
      activeConnections.get(serverId)?.delete(socket);
      if (logStream) {
        (logStream as any).destroy?.();
      }
    });
  });
}

async function fetchHistory(serverId: string, containerId: string, nodeId: string): Promise<void> {
  // Clear old buffer and fetch fresh from Docker
  logBuffers.delete(serverId);

  const docker = getDocker(nodeId);
  const container = docker.getContainer(containerId);

  try {
    const logResult = await container.logs({
      follow: false,
      stdout: true,
      stderr: true,
      tail: MAX_BUFFER_SIZE,
      timestamps: false,
    });

    // Docker may return a Buffer or a readable stream depending on TTY/network mode
    if (Buffer.isBuffer(logResult)) {
      for (const line of demuxDockerStream(logResult)) {
        pushToBuffer(serverId, line);
      }
    } else if (typeof logResult === 'string') {
      for (const line of demuxDockerStream(Buffer.from(logResult))) {
        pushToBuffer(serverId, line);
      }
    } else {
      // It's a stream — collect it
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        (logResult as NodeJS.ReadableStream).on('data', (chunk: Buffer) => chunks.push(chunk));
        (logResult as NodeJS.ReadableStream).on('end', resolve);
        (logResult as NodeJS.ReadableStream).on('error', reject);
      });
      const combined = Buffer.concat(chunks);
      for (const line of demuxDockerStream(combined)) {
        pushToBuffer(serverId, line);
      }
    }
  } catch (err) {
    console.warn(`Failed to fetch log history for ${serverId}:`, err);
  }
}

async function attachToContainer(
  serverId: string,
  containerId: string,
  nodeId: string,
  socket: WebSocket,
): Promise<NodeJS.ReadableStream> {
  const docker = getDocker(nodeId);
  const container = docker.getContainer(containerId);

  const stream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    tail: 0,
    timestamps: false,
  }) as NodeJS.ReadableStream;

  stream.on('data', (chunk: Buffer | string) => {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    for (const line of demuxDockerStream(buf)) {
      pushToBuffer(serverId, line);
      broadcastToServer(serverId, { type: 'log', line });
    }
  });

  stream.on('end', () => {
    broadcastToServer(serverId, { type: 'log', line: '[Server output ended]' });
  });

  return stream;
}

async function sendCommand(serverId: string, command: string): Promise<void> {
  const server = serverRepo.findById(serverId);
  if (!server?.containerId || server.status !== 'running') return;

  const docker = getDocker(server.nodeId);
  const container = docker.getContainer(server.containerId);

  // Echo command to console immediately
  pushToBuffer(serverId, `> ${command}`);
  broadcastToServer(serverId, { type: 'command', line: `> ${command}` });

  // Try rcon-cli first (most reliable for Minecraft), fall back to stdin
  try {
    const exec = await container.exec({
      Cmd: ['rcon-cli', command],
      AttachStdout: true,
      AttachStderr: true,
    });
    const execStream = await exec.start({ hijack: true, stdin: false });
    execStream.on('data', (chunk: Buffer) => {
      for (const line of demuxDockerStream(chunk)) {
        if (line.trim()) {
          pushToBuffer(serverId, line);
          broadcastToServer(serverId, { type: 'log', line });
        }
      }
    });
  } catch {
    // Fall back to stdin attach
    try {
      const stream = await container.attach({ stream: true, stdin: true, hijack: true });
      stream.write(command + '\n');
      stream.end();
    } catch { /* ignore */ }
  }
}

function broadcastToServer(serverId: string, data: unknown): void {
  const connections = activeConnections.get(serverId);
  if (!connections) return;
  const msg = JSON.stringify(data);
  for (const ws of connections) {
    if (ws.readyState === 1) { // OPEN
      ws.send(msg);
    }
  }
}
