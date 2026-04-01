import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { getDocker } from './node-pool.js';
import { buildCreateOptions } from './container-builder.js';
import { serverRepo } from '../db/repositories/server-repo.js';
import { getTemplate } from '../templates/template-loader.js';
import { eventBus } from '../services/event-bus.js';
import { syncConfigToFiles } from '../services/config-writer.js';
import { config } from '../config.js';
import type { Server } from '@gamepanel/shared';

export const dockerManager = {
  async createAndStart(server: Server): Promise<string> {
    const template = getTemplate(server.templateSlug);
    if (!template) throw new Error(`Template not found: ${server.templateSlug}`);

    const docker = getDocker(server.nodeId);

    // Ensure data directory exists
    const serverDataDir = join(config.dataDir, 'servers', server.id, 'data');
    if (!existsSync(serverDataDir)) {
      mkdirSync(serverDataDir, { recursive: true });
    }

    // Sync managed config fields to files before starting
    syncConfigToFiles(server);

    serverRepo.updateStatus(server.id, 'creating');
    eventBus.broadcastWs({ type: 'server:status', serverId: server.id, nodeId: server.nodeId, status: 'creating' });

    // Pull image if not present
    try {
      await docker.getImage(template.docker.image).inspect();
    } catch {
      console.log(`Pulling image ${template.docker.image}...`);
      const stream = await docker.pull(template.docker.image);
      await new Promise<void>((resolve, reject) => {
        docker.modem.followProgress(stream, (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
      console.log(`Image pulled: ${template.docker.image}`);
    }

    // Create container
    const opts = buildCreateOptions(server, template);
    const container = await docker.createContainer(opts);
    const containerId = container.id;

    serverRepo.updateStatus(server.id, 'stopped', containerId);

    // Start container
    await container.start();
    serverRepo.updateStatus(server.id, 'running', containerId);
    eventBus.broadcastWs({ type: 'server:status', serverId: server.id, nodeId: server.nodeId, status: 'running' });

    return containerId;
  },

  async start(server: Server): Promise<void> {
    if (!server.containerId) throw new Error('No container ID — server needs to be created first');

    // Sync managed config fields to files before starting
    syncConfigToFiles(server);

    const docker = getDocker(server.nodeId);
    const container = docker.getContainer(server.containerId);
    await container.start();

    serverRepo.updateStatus(server.id, 'running');
    eventBus.broadcastWs({ type: 'server:status', serverId: server.id, nodeId: server.nodeId, status: 'running' });
  },

  async stop(server: Server): Promise<void> {
    if (!server.containerId) return;

    const template = getTemplate(server.templateSlug);
    const docker = getDocker(server.nodeId);
    const container = docker.getContainer(server.containerId);

    await container.stop({ t: template?.docker.stopTimeout ?? 10 });
    serverRepo.updateStatus(server.id, 'stopped');
    eventBus.broadcastWs({ type: 'server:status', serverId: server.id, nodeId: server.nodeId, status: 'stopped' });
  },

  async restart(server: Server): Promise<void> {
    await this.stop(server);
    await this.start(server);
  },

  async remove(server: Server): Promise<void> {
    if (!server.containerId) return;

    const docker = getDocker(server.nodeId);
    const container = docker.getContainer(server.containerId);

    try {
      const info = await container.inspect();
      if (info.State.Running) {
        await container.stop({ t: 5 });
      }
    } catch {
      // Container might not exist
    }

    try {
      await container.remove({ force: true });
    } catch {
      // Already removed
    }

    serverRepo.updateStatus(server.id, 'stopped', null);
  },

  async recreate(server: Server): Promise<string> {
    // Remove old container
    await this.remove(server);
    // Create and start new one with same config
    return this.createAndStart(server);
  },

  async getContainerStatus(server: Server): Promise<'running' | 'stopped' | 'error'> {
    if (!server.containerId) return 'stopped';

    try {
      const docker = getDocker(server.nodeId);
      const container = docker.getContainer(server.containerId);
      const info = await container.inspect();

      if (info.State.Running) return 'running';
      if (info.State.ExitCode !== 0) return 'error';
      return 'stopped';
    } catch {
      return 'error';
    }
  },
};
