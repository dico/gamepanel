import type { FastifyRequest } from 'fastify';
import { auditRepo } from '../db/repositories/audit-repo.js';

export function audit(action: string, getTarget?: (req: FastifyRequest) => string | undefined) {
  return async (request: FastifyRequest): Promise<void> => {
    const target = getTarget?.(request);
    const ip = request.ip;
    const userId = request.user?.id ?? null;

    // Log after the request completes
    request.server.addHook('onResponse', async (req) => {
      if (req.id === request.id) {
        auditRepo.log(userId, action, target, undefined, ip);
      }
    });
  };
}
