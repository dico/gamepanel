import { getDb } from '../index.js';

interface SessionRow {
  id: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}

export const sessionRepo = {
  findById(id: string): SessionRow | null {
    return getDb().prepare(
      "SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')"
    ).get(id) as SessionRow | undefined ?? null;
  },

  create(id: string, userId: string, expiresAt: Date): void {
    getDb().prepare(
      'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'
    ).run(id, userId, expiresAt.toISOString());
  },

  delete(id: string): void {
    getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id);
  },

  deleteByUserId(userId: string): void {
    getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  },

  deleteExpired(): number {
    const result = getDb().prepare(
      "DELETE FROM sessions WHERE expires_at <= datetime('now')"
    ).run();
    return result.changes;
  },
};
