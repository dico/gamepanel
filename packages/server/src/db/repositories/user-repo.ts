import { getDb } from '../index.js';
import type { User, UserRole } from '@gamepanel/shared';

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  role: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    role: row.role as UserRole,
    displayName: row.display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const userRepo = {
  findById(id: string): User | null {
    const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    return row ? rowToUser(row) : null;
  },

  findByUsername(username: string): (User & { passwordHash: string }) | null {
    const row = getDb().prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
    if (!row) return null;
    return { ...rowToUser(row), passwordHash: row.password_hash };
  },

  findAll(): User[] {
    const rows = getDb().prepare('SELECT * FROM users ORDER BY created_at').all() as UserRow[];
    return rows.map(rowToUser);
  },

  create(id: string, username: string, passwordHash: string, role: UserRole, displayName?: string): User {
    getDb().prepare(
      'INSERT INTO users (id, username, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)'
    ).run(id, username, passwordHash, role, displayName ?? null);
    return this.findById(id)!;
  },

  updatePassword(id: string, passwordHash: string): void {
    getDb().prepare(
      "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(passwordHash, id);
  },

  updateProfile(id: string, displayName: string | null): void {
    getDb().prepare(
      "UPDATE users SET display_name = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(displayName, id);
  },

  updateRole(id: string, role: UserRole): void {
    getDb().prepare(
      "UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(role, id);
  },

  delete(id: string): void {
    getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
  },

  count(): number {
    const row = getDb().prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    return row.count;
  },
};
