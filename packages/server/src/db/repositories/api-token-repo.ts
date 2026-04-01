import { getDb } from '../index.js';
import type { ApiToken } from '@gamepanel/shared';

interface TokenRow {
  id: string;
  user_id: string;
  name: string;
  token_hash: string;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

function rowToToken(row: TokenRow): ApiToken {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export const apiTokenRepo = {
  findByUserId(userId: string): ApiToken[] {
    return (getDb().prepare(
      'SELECT * FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC'
    ).all(userId) as TokenRow[]).map(rowToToken);
  },

  findByTokenHash(tokenHash: string): (ApiToken & { tokenHash: string }) | null {
    const row = getDb().prepare(
      'SELECT * FROM api_tokens WHERE token_hash = ?'
    ).get(tokenHash) as TokenRow | undefined;
    if (!row) return null;
    return { ...rowToToken(row), tokenHash: row.token_hash };
  },

  create(id: string, userId: string, name: string, tokenHash: string, expiresAt?: Date): ApiToken {
    getDb().prepare(
      'INSERT INTO api_tokens (id, user_id, name, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, userId, name, tokenHash, expiresAt?.toISOString() ?? null);
    const row = getDb().prepare('SELECT * FROM api_tokens WHERE id = ?').get(id) as TokenRow;
    return rowToToken(row);
  },

  updateLastUsed(id: string): void {
    getDb().prepare("UPDATE api_tokens SET last_used_at = datetime('now') WHERE id = ?").run(id);
  },

  delete(id: string): void {
    getDb().prepare('DELETE FROM api_tokens WHERE id = ?').run(id);
  },

  deleteByUserId(userId: string): void {
    getDb().prepare('DELETE FROM api_tokens WHERE user_id = ?').run(userId);
  },
};
