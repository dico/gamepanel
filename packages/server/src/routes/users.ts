import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { userRepo } from '../db/repositories/user-repo.js';
import { auditRepo } from '../db/repositories/audit-repo.js';
import type { UserRole } from '@gamepanel/shared';

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authMiddleware);

  // List users (admin only)
  app.get('/api/users', {
    onRequest: requireRole('admin'),
  }, async () => {
    return { data: userRepo.findAll() };
  });

  // Create user (admin only)
  app.post<{
    Body: { username: string; password: string; role?: UserRole; displayName?: string };
  }>('/api/users', {
    onRequest: requireRole('admin'),
  }, async (request, reply) => {
    const { username, password, role, displayName } = request.body;

    if (!username || !password) {
      return reply.status(400).send({ error: 'BadRequest', message: 'Username and password required' });
    }
    if (password.length < 8) {
      return reply.status(400).send({ error: 'BadRequest', message: 'Password must be at least 8 characters' });
    }

    // Check if username exists
    const existing = userRepo.findByUsername(username);
    if (existing) {
      return reply.status(409).send({ error: 'Conflict', message: 'Username already exists' });
    }

    const hash = await bcrypt.hash(password, 12);
    const user = userRepo.create(nanoid(), username, hash, role ?? 'viewer', displayName);

    auditRepo.log(request.user!.id, 'user:create', user.id, { username, role: role ?? 'viewer' }, request.ip);
    return reply.status(201).send({ data: user });
  });

  // Update user role (admin only)
  app.patch<{
    Params: { id: string };
    Body: { role?: UserRole; displayName?: string };
  }>('/api/users/:id', {
    onRequest: requireRole('admin'),
  }, async (request, reply) => {
    const user = userRepo.findById(request.params.id);
    if (!user) return reply.status(404).send({ error: 'NotFound', message: 'User not found' });

    if (request.body.role) {
      userRepo.updateRole(user.id, request.body.role);
    }
    if (request.body.displayName !== undefined) {
      userRepo.updateProfile(user.id, request.body.displayName);
    }

    auditRepo.log(request.user!.id, 'user:update', user.id, request.body, request.ip);
    return { data: userRepo.findById(user.id) };
  });

  // Delete user (admin only, cannot delete self)
  app.delete<{ Params: { id: string } }>('/api/users/:id', {
    onRequest: requireRole('admin'),
  }, async (request, reply) => {
    if (request.params.id === request.user!.id) {
      return reply.status(400).send({ error: 'BadRequest', message: 'Cannot delete yourself' });
    }

    const user = userRepo.findById(request.params.id);
    if (!user) return reply.status(404).send({ error: 'NotFound', message: 'User not found' });

    userRepo.delete(user.id);
    auditRepo.log(request.user!.id, 'user:delete', user.id, { username: user.username }, request.ip);
    return { data: { ok: true } };
  });
}
