import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { authMiddleware } from '../middleware/auth.js';
import { generateServerSlug } from '../utils/slug.js';
import { requireRole } from '../middleware/role.js';
import { presetRepo } from '../db/repositories/preset-repo.js';
import { serverRepo } from '../db/repositories/server-repo.js';
import { auditRepo } from '../db/repositories/audit-repo.js';
import { dockerManager } from '../docker/docker-manager.js';
import { getTemplate } from '../templates/template-loader.js';
import type { PortMapping } from '@gamepanel/shared';

export async function presetRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authMiddleware);

  // List presets
  app.get('/api/presets', async () => {
    return { data: presetRepo.findAll() };
  });

  // Get preset
  app.get<{ Params: { id: string } }>('/api/presets/:id', async (request, reply) => {
    const preset = presetRepo.findById(request.params.id);
    if (!preset) return reply.status(404).send({ error: 'NotFound', message: 'Preset not found' });
    return { data: preset };
  });

  // Create preset
  app.post<{
    Body: { templateSlug: string; name: string; description?: string; environment: Record<string, string>; configValues?: Record<string, string> };
  }>('/api/presets', {
    onRequest: requireRole('operator'),
  }, async (request, reply) => {
    const { templateSlug, name, description, environment, configValues } = request.body;
    if (!templateSlug || !name) {
      return reply.status(400).send({ error: 'BadRequest', message: 'templateSlug and name are required' });
    }

    const preset = presetRepo.create({
      id: nanoid(),
      templateSlug,
      name,
      description,
      environment: environment ?? {},
      configValues: configValues ?? {},
      createdBy: request.user!.id,
    });

    auditRepo.log(request.user!.id, 'preset:create', preset.id, { name }, request.ip);
    return reply.status(201).send({ data: preset });
  });

  // Save running server as preset
  app.post<{ Params: { id: string }; Body: { name: string; description?: string } }>(
    '/api/servers/:id/save-preset', {
      onRequest: requireRole('operator'),
    }, async (request, reply) => {
      const server = serverRepo.findById(request.params.id);
      if (!server) return reply.status(404).send({ error: 'NotFound', message: 'Server not found' });

      const preset = presetRepo.create({
        id: nanoid(),
        templateSlug: server.templateSlug,
        name: request.body.name || `${server.name} preset`,
        description: request.body.description,
        environment: server.environment,
        configValues: server.configValues,
        createdBy: request.user!.id,
      });

      auditRepo.log(request.user!.id, 'preset:create-from-server', preset.id, { serverId: server.id }, request.ip);
      return reply.status(201).send({ data: preset });
    }
  );

  // Deploy preset (create server(s) from it)
  app.post<{
    Params: { id: string };
    Body: { nodeId: string; count?: number; nameTemplate?: string };
  }>('/api/presets/:id/deploy', {
    onRequest: requireRole('admin'),
  }, async (request, reply) => {
    const preset = presetRepo.findById(request.params.id);
    if (!preset) return reply.status(404).send({ error: 'NotFound', message: 'Preset not found' });

    const template = getTemplate(preset.templateSlug);
    if (!template) return reply.status(400).send({ error: 'BadRequest', message: 'Template not found' });

    const count = Math.min(request.body.count ?? 1, 10); // Max 10 at once
    const nameTemplate = request.body.nameTemplate ?? `${preset.name} #\${n}`;
    const nodeId = request.body.nodeId;

    const created: string[] = [];

    for (let i = 0; i < count; i++) {
      const name = nameTemplate.replace('${n}', String(i + 1));
      const ports: PortMapping[] = template.ports.map(p => ({
        name: p.name,
        host: p.defaultHost + preset.portsOffset + i,
        container: p.container,
        protocol: p.protocol,
      }));

      const server = serverRepo.create({
        id: generateServerSlug(name),
        nodeId,
        name,
        templateSlug: preset.templateSlug,
        ports,
        environment: preset.environment,
        configValues: preset.configValues,
      });

      try {
        await dockerManager.createAndStart(server);
      } catch (err: any) {
        serverRepo.updateStatus(server.id, 'error');
      }

      created.push(server.id);
    }

    auditRepo.log(request.user!.id, 'preset:deploy', preset.id, { count, nodeId }, request.ip);
    return { data: { ok: true, serverIds: created } };
  });

  // Delete preset
  app.delete<{ Params: { id: string } }>('/api/presets/:id', {
    onRequest: requireRole('admin'),
  }, async (request, reply) => {
    const preset = presetRepo.findById(request.params.id);
    if (!preset) return reply.status(404).send({ error: 'NotFound', message: 'Preset not found' });

    presetRepo.delete(preset.id);
    auditRepo.log(request.user!.id, 'preset:delete', preset.id, { name: preset.name }, request.ip);
    return { data: { ok: true } };
  });

  // Export preset as JSON
  app.get<{ Params: { id: string } }>('/api/presets/:id/export', async (request, reply) => {
    const preset = presetRepo.findById(request.params.id);
    if (!preset) return reply.status(404).send({ error: 'NotFound', message: 'Preset not found' });

    const exportData = {
      templateSlug: preset.templateSlug,
      name: preset.name,
      description: preset.description,
      environment: preset.environment,
      configValues: preset.configValues,
      portsOffset: preset.portsOffset,
    };

    reply.header('Content-Disposition', `attachment; filename="${preset.name}.json"`);
    reply.header('Content-Type', 'application/json');
    return exportData;
  });
}
