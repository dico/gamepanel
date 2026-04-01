import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { authMiddleware } from '../middleware/auth.js';
import { userRepo } from '../db/repositories/user-repo.js';
import { apiTokenRepo } from '../db/repositories/api-token-repo.js';
import { auditRepo } from '../db/repositories/audit-repo.js';
import crypto from 'crypto';

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authMiddleware);

  // Get own profile
  app.get('/api/profile', async (request) => {
    return { data: request.user };
  });

  // Update display name
  app.patch<{ Body: { displayName?: string } }>('/api/profile', async (request) => {
    userRepo.updateProfile(request.user!.id, request.body.displayName ?? null);
    auditRepo.log(request.user!.id, 'profile:update', request.user!.id, undefined, request.ip);
    return { data: userRepo.findById(request.user!.id) };
  });

  // Change password
  app.post<{
    Body: { currentPassword: string; newPassword: string };
  }>('/api/profile/password', async (request, reply) => {
    const { currentPassword, newPassword } = request.body;

    if (!currentPassword || !newPassword) {
      return reply.status(400).send({ error: 'BadRequest', message: 'Current and new password required' });
    }
    if (newPassword.length < 8) {
      return reply.status(400).send({ error: 'BadRequest', message: 'Password must be at least 8 characters' });
    }

    const user = userRepo.findByUsername(request.user!.username);
    if (!user) return reply.status(404).send({ error: 'NotFound', message: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Current password is incorrect' });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    userRepo.updatePassword(request.user!.id, hash);
    auditRepo.log(request.user!.id, 'profile:password', request.user!.id, undefined, request.ip);

    return { data: { ok: true } };
  });

  // List API tokens
  app.get('/api/profile/tokens', async (request) => {
    return { data: apiTokenRepo.findByUserId(request.user!.id) };
  });

  // Create API token — returns the raw token ONCE
  app.post<{
    Body: { name: string; expiresInDays?: number };
  }>('/api/profile/tokens', async (request, reply) => {
    const { name, expiresInDays } = request.body;
    if (!name) return reply.status(400).send({ error: 'BadRequest', message: 'Token name is required' });

    // Generate a random token
    const rawToken = `gp_${crypto.randomBytes(32).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 86400_000)
      : undefined;

    const token = apiTokenRepo.create(nanoid(), request.user!.id, name, tokenHash, expiresAt);
    auditRepo.log(request.user!.id, 'token:create', token.id, { name }, request.ip);

    // Return raw token only on creation — it's not stored
    return reply.status(201).send({ data: { ...token, rawToken } });
  });

  // Delete API token
  app.delete<{ Params: { id: string } }>('/api/profile/tokens/:id', async (request, reply) => {
    const tokens = apiTokenRepo.findByUserId(request.user!.id);
    const token = tokens.find(t => t.id === request.params.id);
    if (!token) return reply.status(404).send({ error: 'NotFound', message: 'Token not found' });

    apiTokenRepo.delete(token.id);
    auditRepo.log(request.user!.id, 'token:delete', token.id, { name: token.name }, request.ip);

    return { data: { ok: true } };
  });
}
