import { getDb } from '../index.js';
import type { AuditLogEntry } from '@gamepanel/shared';

interface AuditRow {
  id: number;
  user_id: string | null;
  action: string;
  target: string | null;
  details: string | null;
  ip_address: string | null;
  created_at: string;
}

function rowToEntry(row: AuditRow): AuditLogEntry {
  return {
    id: row.id,
    userId: row.user_id,
    action: row.action,
    target: row.target,
    details: row.details ? JSON.parse(row.details) : null,
    ipAddress: row.ip_address,
    createdAt: row.created_at,
  };
}

export const auditRepo = {
  log(userId: string | null, action: string, target?: string, details?: Record<string, unknown>, ipAddress?: string): void {
    getDb().prepare(
      'INSERT INTO audit_log (user_id, action, target, details, ip_address) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, action, target ?? null, details ? JSON.stringify(details) : null, ipAddress ?? null);
  },

  findAll(options: { limit?: number; offset?: number } = {}): { entries: AuditLogEntry[]; total: number } {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    const rows = getDb().prepare(
      'SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset) as AuditRow[];
    const total = (getDb().prepare('SELECT COUNT(*) as count FROM audit_log').get() as { count: number }).count;
    return { entries: rows.map(rowToEntry), total };
  },
};
