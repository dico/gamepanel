import { getDb } from '../index.js';
import type { GameNode, NodeStatus, TlsConfig } from '@gamepanel/shared';

interface NodeRow {
  id: string;
  name: string;
  host: string;
  tls_config: string | null;
  description: string | null;
  status: string;
  created_at: string;
}

function rowToNode(row: NodeRow): GameNode {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    tlsConfig: row.tls_config ? JSON.parse(row.tls_config) as TlsConfig : null,
    description: row.description,
    status: row.status as NodeStatus,
    createdAt: row.created_at,
  };
}

export const nodeRepo = {
  findById(id: string): GameNode | null {
    const row = getDb().prepare('SELECT * FROM nodes WHERE id = ?').get(id) as NodeRow | undefined;
    return row ? rowToNode(row) : null;
  },

  findAll(): GameNode[] {
    const rows = getDb().prepare('SELECT * FROM nodes ORDER BY created_at').all() as NodeRow[];
    return rows.map(rowToNode);
  },

  create(node: { id: string; name: string; host: string; tlsConfig?: TlsConfig; description?: string }): GameNode {
    getDb().prepare(
      'INSERT INTO nodes (id, name, host, tls_config, description) VALUES (?, ?, ?, ?, ?)'
    ).run(node.id, node.name, node.host, node.tlsConfig ? JSON.stringify(node.tlsConfig) : null, node.description ?? null);
    return this.findById(node.id)!;
  },

  updateStatus(id: string, status: NodeStatus): void {
    getDb().prepare('UPDATE nodes SET status = ? WHERE id = ?').run(status, id);
  },

  delete(id: string): void {
    getDb().prepare('DELETE FROM nodes WHERE id = ?').run(id);
  },
};
