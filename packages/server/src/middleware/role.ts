import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UserRole } from '@gamepanel/shared';

const ROLE_HIERARCHY: Record<UserRole, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
};

export function requireRole(minRole: UserRole) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
      return;
    }

    const userLevel = ROLE_HIERARCHY[request.user.role];
    const requiredLevel = ROLE_HIERARCHY[minRole];

    if (userLevel < requiredLevel) {
      reply.status(403).send({ error: 'Forbidden', message: `Requires ${minRole} role or higher` });
    }
  };
}
