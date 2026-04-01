import { getDb } from '../index.js';
import type { Notification, NotificationLevel } from '@gamepanel/shared';

interface NotificationRow {
  id: string;
  level: string;
  title: string;
  message: string | null;
  server_id: string | null;
  node_id: string | null;
  read: number;
  created_at: string;
}

function rowToNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    level: row.level as NotificationLevel,
    title: row.title,
    message: row.message,
    serverId: row.server_id,
    nodeId: row.node_id,
    read: row.read === 1,
    createdAt: row.created_at,
  };
}

export const notificationRepo = {
  findAll(options: { unreadOnly?: boolean; limit?: number; offset?: number } = {}): { notifications: Notification[]; total: number } {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    const where = options.unreadOnly ? 'WHERE read = 0' : '';

    const rows = getDb().prepare(
      `SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(limit, offset) as NotificationRow[];

    const total = (getDb().prepare(
      `SELECT COUNT(*) as count FROM notifications ${where}`
    ).get() as { count: number }).count;

    return { notifications: rows.map(rowToNotification), total };
  },

  create(notification: { id: string; level: NotificationLevel; title: string; message?: string; serverId?: string; nodeId?: string }): Notification {
    getDb().prepare(
      'INSERT INTO notifications (id, level, title, message, server_id, node_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(notification.id, notification.level, notification.title, notification.message ?? null, notification.serverId ?? null, notification.nodeId ?? null);
    const row = getDb().prepare('SELECT * FROM notifications WHERE id = ?').get(notification.id) as NotificationRow;
    return rowToNotification(row);
  },

  markRead(id: string): void {
    getDb().prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);
  },

  markAllRead(): void {
    getDb().prepare('UPDATE notifications SET read = 1 WHERE read = 0').run();
  },

  delete(id: string): void {
    getDb().prepare('DELETE FROM notifications WHERE id = ?').run(id);
  },

  unreadCount(): number {
    return (getDb().prepare('SELECT COUNT(*) as count FROM notifications WHERE read = 0').get() as { count: number }).count;
  },
};
