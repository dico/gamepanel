import type { WsEvent } from '@gamepanel/shared';

type EventHandler = (event: WsEvent) => void;

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const handlers = new Set<EventHandler>();

export function connectEventStream(): void {
  if (socket?.readyState === WebSocket.OPEN) return;

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${location.host}/ws/events`);

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as WsEvent;
      for (const handler of handlers) handler(data);
    } catch { /* ignore parse errors */ }
  };

  socket.onclose = () => {
    socket = null;
    reconnectTimer = setTimeout(connectEventStream, 3000);
  };

  socket.onerror = () => {
    socket?.close();
  };
}

export function disconnectEventStream(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  socket?.close();
  socket = null;
}

export function onWsEvent(handler: EventHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}
