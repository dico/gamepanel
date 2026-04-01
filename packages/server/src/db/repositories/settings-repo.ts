import { getDb } from '../index.js';

export const settingsRepo = {
  get(key: string): string | null {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  },

  set(key: string, value: string): void {
    getDb().prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
    ).run(key, value, value);
  },

  delete(key: string): void {
    getDb().prepare('DELETE FROM settings WHERE key = ?').run(key);
  },

  getAll(): Record<string, string> {
    const rows = getDb().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const result: Record<string, string> = {};
    for (const row of rows) result[row.key] = row.value;
    return result;
  },
};
