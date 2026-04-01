import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { nodeRepo } from '../db/repositories/node-repo.js';
import { auditRepo } from '../db/repositories/audit-repo.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';

export async function nodeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authMiddleware);

  // List all nodes
  app.get('/api/nodes', async () => {
    return { data: nodeRepo.findAll() };
  });

  // Get node by ID
  app.get<{ Params: { id: string } }>('/api/nodes/:id', async (request, reply) => {
    const node = nodeRepo.findById(request.params.id);
    if (!node) {
      return reply.status(404).send({ error: 'NotFound', message: 'Node not found' });
    }
    return { data: node };
  });

  // Create node
  app.post<{
    Body: { name: string; host: string; description?: string };
  }>('/api/nodes', {
    onRequest: requireRole('admin'),
  }, async (request, reply) => {
    const { name, host, description } = request.body;
    if (!name || !host) {
      return reply.status(400).send({ error: 'BadRequest', message: 'name and host are required' });
    }

    const node = nodeRepo.create({ id: nanoid(), name, host, description });
    auditRepo.log(request.user!.id, 'node:create', node.id, { name, host }, request.ip);

    return reply.status(201).send({ data: node });
  });

  // Delete node
  app.delete<{ Params: { id: string } }>('/api/nodes/:id', {
    onRequest: requireRole('admin'),
  }, async (request, reply) => {
    const node = nodeRepo.findById(request.params.id);
    if (!node) {
      return reply.status(404).send({ error: 'NotFound', message: 'Node not found' });
    }

    if (node.id === 'local') {
      return reply.status(400).send({ error: 'BadRequest', message: 'Cannot delete the local node' });
    }

    nodeRepo.delete(node.id);
    auditRepo.log(request.user!.id, 'node:delete', node.id, { name: node.name }, request.ip);

    return { data: { ok: true } };
  });
}
