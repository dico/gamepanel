import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { notificationRepo } from '../db/repositories/notification-repo.js';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authMiddleware);

  // List notifications
  app.get<{ Querystring: { unread?: string; limit?: string; offset?: string } }>('/api/notifications', async (request) => {
    const unreadOnly = request.query.unread === 'true';
    const limit = parseInt(request.query.limit || '50', 10);
    const offset = parseInt(request.query.offset || '0', 10);
    const { notifications, total } = notificationRepo.findAll({ unreadOnly, limit, offset });
    return { data: notifications, total, page: Math.floor(offset / limit) + 1, pageSize: limit };
  });

  // Mark as read
  app.patch<{ Params: { id: string } }>('/api/notifications/:id/read', async (request) => {
    notificationRepo.markRead(request.params.id);
    return { data: { ok: true } };
  });

  // Mark all as read
  app.post('/api/notifications/read-all', async () => {
    notificationRepo.markAllRead();
    return { data: { ok: true } };
  });

  // Delete notification
  app.delete<{ Params: { id: string } }>('/api/notifications/:id', async (request) => {
    notificationRepo.delete(request.params.id);
    return { data: { ok: true } };
  });
}
