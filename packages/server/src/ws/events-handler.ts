import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { eventBus } from '../services/event-bus.js';
import { sessionRepo } from '../db/repositories/session-repo.js';
import { userRepo } from '../db/repositories/user-repo.js';

const clients = new Set<WebSocket>();

export async function eventsWsRoutes(app: FastifyInstance): Promise<void> {
  // Listen to event bus and broadcast to all connected clients
  eventBus.onWsBroadcast((data) => {
    const msg = JSON.stringify(data);
    for (const ws of clients) {
      if (ws.readyState === 1) {
        ws.send(msg);
      }
    }
  });

  app.get('/ws/events', { websocket: true }, (socket, request) => {
    // Authenticate via session cookie
    const sessionId = request.cookies?.session;
    if (!sessionId) { socket.close(4001, 'Unauthorized'); return; }
    const session = sessionRepo.findById(sessionId);
    if (!session) { socket.close(4001, 'Session expired'); return; }
    const user = userRepo.findById(session.user_id);
    if (!user) { socket.close(4001, 'User not found'); return; }

    clients.add(socket);

    socket.on('close', () => {
      clients.delete(socket);
    });

    socket.send(JSON.stringify({ type: 'connected', message: 'Event stream active' }));
  });
}
