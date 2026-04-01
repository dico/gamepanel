import { getDb } from '../index.js';
import type { Server, ServerStatus, PortMapping } from '@gamepanel/shared';

interface ServerRow {
  id: string;
  node_id: string;
  name: string;
  template_slug: string;
  container_id: string | null;
  status: string;
  ports: string;
  environment: string;
  config_values: string;
  created_at: string;
  updated_at: string;
}

function rowToServer(row: ServerRow): Server {
  return {
    id: row.id,
    nodeId: row.node_id,
    name: row.name,
    templateSlug: row.template_slug,
    containerId: row.container_id,
    status: row.status as ServerStatus,
    ports: JSON.parse(row.ports) as PortMapping[],
    environment: JSON.parse(row.environment),
    configValues: JSON.parse(row.config_values),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const serverRepo = {
  findById(id: string): Server | null {
    const row = getDb().prepare('SELECT * FROM servers WHERE id = ?').get(id) as ServerRow | undefined;
    return row ? rowToServer(row) : null;
  },

  findAll(): Server[] {
    const rows = getDb().prepare('SELECT * FROM servers ORDER BY created_at DESC').all() as ServerRow[];
    return rows.map(rowToServer);
  },

  findByNodeId(nodeId: string): Server[] {
    const rows = getDb().prepare('SELECT * FROM servers WHERE node_id = ? ORDER BY name').all(nodeId) as ServerRow[];
    return rows.map(rowToServer);
  },

  create(server: {
    id: string;
    nodeId: string;
    name: string;
    templateSlug: string;
    ports: PortMapping[];
    environment: Record<string, string>;
    configValues?: Record<string, string>;
  }): Server {
    getDb().prepare(
      'INSERT INTO servers (id, node_id, name, template_slug, ports, environment, config_values) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      server.id,
      server.nodeId,
      server.name,
      server.templateSlug,
      JSON.stringify(server.ports),
      JSON.stringify(server.environment),
      JSON.stringify(server.configValues ?? {}),
    );
    return this.findById(server.id)!;
  },

  updateStatus(id: string, status: ServerStatus, containerId?: string | null): void {
    if (containerId !== undefined) {
      getDb().prepare(
        "UPDATE servers SET status = ?, container_id = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(status, containerId, id);
    } else {
      getDb().prepare(
        "UPDATE servers SET status = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(status, id);
    }
  },

  updateName(id: string, name: string): void {
    getDb().prepare(
      "UPDATE servers SET name = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(name, id);
  },

  updateConfig(id: string, environment: Record<string, string>, configValues: Record<string, string>): void {
    getDb().prepare(
      "UPDATE servers SET environment = ?, config_values = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(JSON.stringify(environment), JSON.stringify(configValues), id);
  },

  updatePorts(id: string, ports: PortMapping[]): void {
    getDb().prepare(
      "UPDATE servers SET ports = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(JSON.stringify(ports), id);
  },

  delete(id: string): void {
    getDb().prepare('DELETE FROM servers WHERE id = ?').run(id);
  },
};
