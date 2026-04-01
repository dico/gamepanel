import { createConnection } from 'net';
import { serverRepo } from '../db/repositories/server-repo.js';

/** Get all ports currently used by GamePanel servers on a node */
function getUsedPorts(nodeId: string): Set<number> {
  const servers = serverRepo.findByNodeId(nodeId);
  const used = new Set<number>();
  for (const server of servers) {
    for (const port of server.ports) {
      used.add(port.host);
    }
  }
  return used;
}

/** Probe a TCP port to see if it's in use by another process */
function isPortInUse(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host, timeout: 500 });
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
  });
}

/**
 * Find the next available port starting from `startPort`.
 * Checks both the database and probes TCP.
 */
export async function findAvailablePort(
  startPort: number,
  nodeId: string,
  host = '127.0.0.1',
): Promise<number> {
  const usedPorts = getUsedPorts(nodeId);
  let port = startPort;
  const maxAttempts = 100;

  for (let i = 0; i < maxAttempts; i++) {
    if (!usedPorts.has(port)) {
      const inUse = await isPortInUse(port, host);
      if (!inUse) return port;
    }
    port++;
  }

  throw new Error(`No available port found starting from ${startPort} (checked ${maxAttempts} ports)`);
}

/**
 * Find available ports for all port definitions in a template.
 * Each port gets its own available slot, incrementing from the default.
 */
export async function findAvailablePorts(
  portDefaults: { name: string; defaultHost: number; container: number; protocol: string }[],
  nodeId: string,
  host = '127.0.0.1',
): Promise<{ name: string; host: number; container: number; protocol: string }[]> {
  const usedPorts = getUsedPorts(nodeId);
  const allocated: { name: string; host: number; container: number; protocol: string }[] = [];

  for (const def of portDefaults) {
    let port = def.defaultHost;
    const maxAttempts = 100;

    for (let i = 0; i < maxAttempts; i++) {
      if (!usedPorts.has(port) && !allocated.some(a => a.host === port)) {
        const inUse = await isPortInUse(port, host);
        if (!inUse) {
          allocated.push({
            name: def.name,
            host: port,
            container: def.container,
            protocol: def.protocol,
          });
          usedPorts.add(port); // Mark as used for subsequent checks
          break;
        }
      }
      port++;
    }
  }

  if (allocated.length !== portDefaults.length) {
    throw new Error('Could not find available ports for all port definitions');
  }

  return allocated;
}
