import type { FastifyInstance } from 'fastify';
import { serverRepo } from '../db/repositories/server-repo.js';
import { getTemplate } from '../templates/template-loader.js';

export async function statusRoutes(app: FastifyInstance): Promise<void> {
  // Public status page — no auth required
  app.get<{ Params: { id: string } }>('/api/status/:id', async (request, reply) => {
    const server = serverRepo.findById(request.params.id);
    if (!server) {
      return reply.status(404).send({ error: 'NotFound', message: 'Server not found' });
    }

    const template = getTemplate(server.templateSlug);

    // Only expose public-safe info
    return {
      data: {
        name: server.name,
        game: template?.name ?? server.templateSlug,
        status: server.status,
        ports: server.ports.map(p => ({
          name: p.name,
          port: p.host,
          protocol: p.protocol,
        })),
      },
    };
  });
}
