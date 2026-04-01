import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { eventBus } from '../services/event-bus.js';

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

  app.get('/ws/events', { websocket: true }, (socket) => {
    clients.add(socket);

    socket.on('close', () => {
      clients.delete(socket);
    });

    // Send welcome message
    socket.send(JSON.stringify({ type: 'connected', message: 'Event stream active' }));
  });
}
