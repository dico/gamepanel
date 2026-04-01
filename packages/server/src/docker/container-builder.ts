import type Dockerode from 'dockerode';
import type { Server, GameTemplate } from '@gamepanel/shared';
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

  // Map managed config values to Docker env vars (for images like itzg/minecraft-server
  // that control server.properties via env vars at startup)
  const configToEnv: Record<string, string> = {
    'gamemode': 'MODE',
    'difficulty': 'DIFFICULTY',
    'pvp': 'PVP',
    'max-players': 'MAX_PLAYERS',
    'motd': 'MOTD',
    'white-list': 'ENABLE_WHITELIST',
    'enforce-whitelist': 'ENFORCE_WHITELIST',
    'online-mode': 'ONLINE_MODE',
    'view-distance': 'VIEW_DISTANCE',
    'simulation-distance': 'SIMULATION_DISTANCE',
    'spawn-protection': 'SPAWN_PROTECTION',
    'hardcore': 'HARDCORE',
    'allow-flight': 'ALLOW_FLIGHT',
    'level-seed': 'SEED',
  };
  for (const [cfgKey, envKey] of Object.entries(configToEnv)) {
    if (server.configValues[cfgKey] !== undefined) {
      env.push(`${envKey}=${server.configValues[cfgKey]}`);
    }
  }

  // With host networking, set server port via env if host port differs from container port
  for (const port of server.ports) {
    if (port.host !== port.container) {
      env.push(`SERVER_PORT=${port.host}`);
      break;
    }
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

  // Use host networking — Docker bridge networking in Docker 29.x
  // blocks external access to game ports. Host networking exposes
  // ports directly on the host, which is simpler and more reliable
  // for game servers.
  return {
    name: `gamepanel-${server.id}`,
    Image: template.docker.image,
    Env: env,
    HostConfig: {
      NetworkMode: 'host',
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
