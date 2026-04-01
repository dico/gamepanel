import Dockerode from 'dockerode';
import type { GameNode } from '@gamepanel/shared';
import { nodeRepo } from '../db/repositories/node-repo.js';

const pool = new Map<string, Dockerode>();

export function getDocker(nodeId: string): Dockerode {
  const existing = pool.get(nodeId);
  if (existing) return existing;

  const node = nodeRepo.findById(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);

  const docker = createDockerClient(node);
  pool.set(nodeId, docker);
  return docker;
}

function createDockerClient(node: GameNode): Dockerode {
  if (node.host === 'local') {
    return new Dockerode({ socketPath: '/var/run/docker.sock' });
  }

  // Remote node: tcp://host:port
  const url = new URL(node.host);
  const opts: Dockerode.DockerOptions = {
    host: url.hostname,
    port: parseInt(url.port || '2376', 10),
    protocol: 'https' as const,
  };

  if (node.tlsConfig) {
    opts.ca = node.tlsConfig.ca;
    opts.cert = node.tlsConfig.cert;
    opts.key = node.tlsConfig.key;
  }

  return new Dockerode(opts);
}

export function removeFromPool(nodeId: string): void {
  pool.delete(nodeId);
}
