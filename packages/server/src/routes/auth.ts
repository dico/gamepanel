import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { userRepo } from '../db/repositories/user-repo.js';
import { sessionRepo } from '../db/repositories/session-repo.js';
import { auditRepo } from '../db/repositories/audit-repo.js';
import { config } from '../config.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Login
  app.post<{ Body: { username: string; password: string } }>('/api/auth/login', async (request, reply) => {
    const { username, password } = request.body;

    if (!username || !password) {
      return reply.status(400).send({ error: 'BadRequest', message: 'Username and password required' });
    }

    const user = userRepo.findByUsername(username);
    if (!user) {
      auditRepo.log(null, 'auth:login_failed', undefined, { username, reason: 'user_not_found' }, request.ip);
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      auditRepo.log(user.id, 'auth:login_failed', undefined, { reason: 'wrong_password' }, request.ip);
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid credentials' });
    }

    // Create session
    const sessionId = nanoid(32);
    const expiresAt = new Date(Date.now() + config.sessionMaxAge);
    sessionRepo.create(sessionId, user.id, expiresAt);

    auditRepo.log(user.id, 'auth:login', undefined, undefined, request.ip);

    reply.setCookie('session', sessionId, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      maxAge: config.sessionMaxAge / 1000,
      secure: process.env.SECURE_COOKIES === 'true',
    });

    return { data: { id: user.id, username: user.username, role: user.role, displayName: user.displayName } };
  });

  // Logout
  app.post('/api/auth/logout', async (request, reply) => {
    const sessionId = request.cookies?.session;
    if (sessionId) {
      sessionRepo.delete(sessionId);
      auditRepo.log(request.user?.id ?? null, 'auth:logout', undefined, undefined, request.ip);
    }
    reply.clearCookie('session', { path: '/' });
    return { data: { ok: true } };
  });

  // Current user
  app.get('/api/auth/me', async (request, reply) => {
    const sessionId = request.cookies?.session;
    if (!sessionId) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Not logged in' });
    }

    const session = sessionRepo.findById(sessionId);
    if (!session) {
      reply.clearCookie('session', { path: '/' });
      return reply.status(401).send({ error: 'Unauthorized', message: 'Session expired' });
    }

    const user = userRepo.findById(session.user_id);
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'User not found' });
    }

    return { data: user };
  });
}
