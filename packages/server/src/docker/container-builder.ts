import type Dockerode from 'dockerode';
import type { Server, GameTemplate, PortMapping } from '@gamepanel/shared';
import { config } from '../config.js';
import { join } from 'path';

export function buildCreateOptions(
  server: Server,
  template: GameTemplate,
): Dockerode.ContainerCreateOptions {
  // Build environment variables
  const env: string[] = [];

  // Fixed env from template
  for (const [key, value] of Object.entries(template.environment.fixed)) {
    env.push(`${key}=${value}`);
  }

  // Configurable env from server
  for (const [key, value] of Object.entries(server.environment)) {
    env.push(`${key}=${value}`);
  }

  // Build port bindings
  const exposedPorts: Record<string, {}> = {};
  const portBindings: Record<string, Dockerode.PortBinding[]> = {};

  for (const port of server.ports) {
    const containerPort = `${port.container}/${port.protocol}`;
    exposedPorts[containerPort] = {};
    portBindings[containerPort] = [{ HostPort: String(port.host) }];
  }

  // Build volume binds — use hostDataDir for Docker bind mounts
  const binds: string[] = [];
  const serverDataDir = join(config.hostDataDir, 'servers', server.id, 'data');

  for (const vol of template.volumes) {
    binds.push(`${serverDataDir}/${vol.name.toLowerCase().replace(/\s+/g, '-')}:${vol.container}`);
  }

  // If only one volume, mount directly
  if (template.volumes.length === 1) {
    binds.length = 0;
    binds.push(`${serverDataDir}:${template.volumes[0].container}`);
  }

  return {
    name: `gamepanel-${server.id}`,
    Image: template.docker.image,
    Env: env,
    ExposedPorts: exposedPorts,
    HostConfig: {
      PortBindings: portBindings,
      Binds: binds,
      RestartPolicy: { Name: 'no' },
    },
    StopSignal: template.docker.stopSignal,
    StopTimeout: template.docker.stopTimeout,
    Labels: {
      'gamepanel.server-id': server.id,
      'gamepanel.template': server.templateSlug,
      'managed-by': 'gamepanel',
    },
  };
}
