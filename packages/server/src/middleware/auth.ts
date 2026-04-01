import type { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { sessionRepo } from '../db/repositories/session-repo.js';
import { apiTokenRepo } from '../db/repositories/api-token-repo.js';
import { userRepo } from '../db/repositories/user-repo.js';
import type { User } from '@gamepanel/shared';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Try session cookie first
  const sessionId = request.cookies?.session;
  if (sessionId) {
    const session = sessionRepo.findById(sessionId);
    if (session) {
      const user = userRepo.findById(session.user_id);
      if (user) {
        request.user = user;
        return;
      }
    }
  }

  // Try Bearer token
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const rawToken = authHeader.slice(7);
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const token = apiTokenRepo.findByTokenHash(tokenHash);

    if (token) {
      // Check expiry
      if (token.expiresAt && new Date(token.expiresAt) < new Date()) {
        reply.status(401).send({ error: 'Unauthorized', message: 'Token expired' });
        return;
      }

      const user = userRepo.findById(token.userId);
      if (user) {
        apiTokenRepo.updateLastUsed(token.id);
        request.user = user;
        return;
      }
    }
  }

  reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
}
