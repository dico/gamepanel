import type { FastifyInstance } from 'fastify';
import { serverRepo } from '../db/repositories/server-repo.js';
import { auditRepo } from '../db/repositories/audit-repo.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { dockerManager } from '../docker/docker-manager.js';
import { getTemplate } from '../templates/template-loader.js';
import { playerRepo } from '../db/repositories/player-repo.js';
import { findAvailablePorts } from '../services/port-allocator.js';
import { generateServerSlug } from '../utils/slug.js';
import type { PortMapping } from '@gamepanel/shared';

export async function serverRoutes(app: FastifyInstance): Promise<void> {
  // All server routes require auth
  app.addHook('onRequest', authMiddleware);

  // List all servers
  app.get('/api/servers', async () => {
    const servers = serverRepo.findAll();
    return { data: servers };
  });

  // Get server by ID
  app.get<{ Params: { id: string } }>('/api/servers/:id', async (request, reply) => {
    const server = serverRepo.findById(request.params.id);
    if (!server) {
      return reply.status(404).send({ error: 'NotFound', message: 'Server not found' });
    }
    return { data: server };
  });

  // Create server (and optionally start it)
  app.post<{
    Body: {
      name: string;
      nodeId: string;
      templateSlug: string;
      ports?: PortMapping[];
      environment?: Record<string, string>;
      configValues?: Record<string, string>;
      autoStart?: boolean;
    };
  }>('/api/servers', {
    onRequest: requireRole('admin'),
  }, async (request, reply) => {
    const { name, nodeId, templateSlug, environment, configValues, autoStart } = request.body;

    if (!name || !nodeId || !templateSlug) {
      return reply.status(400).send({ error: 'BadRequest', message: 'name, nodeId, and templateSlug are required' });
    }

    // Get template defaults for ports and env
    const template = getTemplate(templateSlug);
    if (!template) {
      return reply.status(400).send({ error: 'BadRequest', message: `Template not found: ${templateSlug}` });
    }

    // Auto-allocate ports if not explicitly provided
    const ports: PortMapping[] = request.body.ports ?? await findAvailablePorts(
      template.ports.map(p => ({
        name: p.name,
        defaultHost: p.defaultHost,
        container: p.container,
        protocol: p.protocol as 'tcp' | 'udp',
      })),
      nodeId,
    ) as PortMapping[];

    // Merge template default env with user overrides
    const defaultEnv: Record<string, string> = {};
    for (const field of template.environment.configurable) {
      defaultEnv[field.key] = String(field.default);
    }
    const mergedEnv = { ...defaultEnv, ...environment };

    const server = serverRepo.create({
      id: generateServerSlug(name),
      nodeId,
      name,
      templateSlug,
      ports,
      environment: mergedEnv,
      configValues,
    });

    auditRepo.log(request.user!.id, 'server:create', server.id, { name, templateSlug }, request.ip);

    // Auto-start if requested
    if (autoStart !== false) {
      try {
        await dockerManager.createAndStart(server);
      } catch (err: any) {
        // Server record is created but container failed — return server with error status
        serverRepo.updateStatus(server.id, 'error');
        return reply.status(201).send({
          data: serverRepo.findById(server.id),
          warning: `Server created but failed to start: ${err.message}`,
        });
      }
    }

    return reply.status(201).send({ data: serverRepo.findById(server.id) });
  });

  // Update server config
  app.patch<{
    Params: { id: string };
    Body: { name?: string; environment?: Record<string, string>; configValues?: Record<string, string>; ports?: PortMapping[] };
  }>('/api/servers/:id', {
    onRequest: requireRole('operator'),
  }, async (request, reply) => {
    const server = serverRepo.findById(request.params.id);
    if (!server) {
      return reply.status(404).send({ error: 'NotFound', message: 'Server not found' });
    }

    if (request.body.name && request.body.name !== server.name) {
      serverRepo.updateName(server.id, request.body.name);
    }

    const env = request.body.environment ?? server.environment;
    const cfg = request.body.configValues ?? server.configValues;
    serverRepo.updateConfig(server.id, env, cfg);

    if (request.body.ports) {
      serverRepo.updatePorts(server.id, request.body.ports);
    }

    auditRepo.log(request.user!.id, 'server:update', server.id, undefined, request.ip);

    return { data: serverRepo.findById(server.id) };
  });

  // Delete server
  app.delete<{ Params: { id: string } }>('/api/servers/:id', {
    onRequest: requireRole('admin'),
  }, async (request, reply) => {
    const server = serverRepo.findById(request.params.id);
    if (!server) {
      return reply.status(404).send({ error: 'NotFound', message: 'Server not found' });
    }

    // Stop and remove Docker container
    try {
      await dockerManager.remove(server);
    } catch (err: any) {
      console.warn(`Failed to remove container for ${server.id}: ${err.message}`);
    }

    serverRepo.delete(server.id);
    auditRepo.log(request.user!.id, 'server:delete', server.id, { name: server.name }, request.ip);

    return { data: { ok: true } };
  });

  // Start server
  app.post<{ Params: { id: string } }>('/api/servers/:id/start', {
    onRequest: requireRole('operator'),
  }, async (request, reply) => {
    const server = serverRepo.findById(request.params.id);
    if (!server) {
      return reply.status(404).send({ error: 'NotFound', message: 'Server not found' });
    }

    try {
      if (!server.containerId) {
        // No container yet — create and start
        await dockerManager.createAndStart(server);
      } else {
        await dockerManager.start(server);
      }
      auditRepo.log(request.user!.id, 'server:start', server.id, undefined, request.ip);
      return { data: serverRepo.findById(server.id) };
    } catch (err: any) {
      serverRepo.updateStatus(server.id, 'error');
      return reply.status(500).send({ error: 'DockerError', message: err.message });
    }
  });

  // Stop server
  app.post<{ Params: { id: string } }>('/api/servers/:id/stop', {
    onRequest: requireRole('operator'),
  }, async (request, reply) => {
    const server = serverRepo.findById(request.params.id);
    if (!server) {
      return reply.status(404).send({ error: 'NotFound', message: 'Server not found' });
    }

    try {
      await dockerManager.stop(server);
      auditRepo.log(request.user!.id, 'server:stop', server.id, undefined, request.ip);
      return { data: serverRepo.findById(server.id) };
    } catch (err: any) {
      return reply.status(500).send({ error: 'DockerError', message: err.message });
    }
  });

  // Restart server
  app.post<{ Params: { id: string } }>('/api/servers/:id/restart', {
    onRequest: requireRole('operator'),
  }, async (request, reply) => {
    const server = serverRepo.findById(request.params.id);
    if (!server) {
      return reply.status(404).send({ error: 'NotFound', message: 'Server not found' });
    }

    try {
      await dockerManager.restart(server);
      auditRepo.log(request.user!.id, 'server:restart', server.id, undefined, request.ip);
      return { data: serverRepo.findById(server.id) };
    } catch (err: any) {
      return reply.status(500).send({ error: 'DockerError', message: err.message });
    }
  });

  // Recreate server (pull & recreate)
  app.post<{ Params: { id: string } }>('/api/servers/:id/recreate', {
    onRequest: requireRole('admin'),
  }, async (request, reply) => {
    const server = serverRepo.findById(request.params.id);
    if (!server) {
      return reply.status(404).send({ error: 'NotFound', message: 'Server not found' });
    }

    try {
      await dockerManager.recreate(server);
      auditRepo.log(request.user!.id, 'server:recreate', server.id, undefined, request.ip);
      return { data: serverRepo.findById(server.id) };
    } catch (err: any) {
      return reply.status(500).send({ error: 'DockerError', message: err.message });
    }
  });

  // Send command to server via RCON
  app.post<{
    Params: { id: string };
    Body: { command: string };
  }>('/api/servers/:id/command', {
    onRequest: requireRole('operator'),
  }, async (request, reply) => {
    const server = serverRepo.findById(request.params.id);
    if (!server) return reply.status(404).send({ error: 'NotFound', message: 'Server not found' });
    if (!server.containerId || server.status !== 'running') {
      return reply.status(400).send({ error: 'BadRequest', message: 'Server is not running' });
    }

    const { command } = request.body;
    if (!command) return reply.status(400).send({ error: 'BadRequest', message: 'command is required' });

    try {
      const docker = (await import('../docker/node-pool.js')).getDocker(server.nodeId);
      const container = docker.getContainer(server.containerId);
      const exec = await container.exec({
        Cmd: ['rcon-cli', command],
        AttachStdout: true,
        AttachStderr: true,
      });
      const stream = await exec.start({ hijack: true, stdin: false });
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve) => {
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', resolve);
        setTimeout(resolve, 5000);
      });
      const output = Buffer.concat(chunks).toString('utf-8').trim();
      return { data: { output } };
    } catch (err: any) {
      return reply.status(500).send({ error: 'CommandError', message: err.message });
    }
  });

  // Player history for a server
  app.get<{
    Params: { id: string };
    Querystring: { limit?: string };
  }>('/api/servers/:id/players', async (request, reply) => {
    const server = serverRepo.findById(request.params.id);
    if (!server) return reply.status(404).send({ error: 'NotFound', message: 'Server not found' });

    const limit = parseInt(request.query.limit || '100', 10);
    const players = playerRepo.findByServerId(server.id, limit);
    return { data: players };
  });
}
