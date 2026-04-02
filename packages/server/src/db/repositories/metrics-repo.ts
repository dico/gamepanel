import { getDb } from '../index.js';

export interface MetricPoint {
  cpuPercent: number | null;
  memoryUsed: number | null;
  memoryTotal: number | null;
  diskUsed: number | null;
  diskTotal: number | null;
  createdAt: string;
}

export const metricsRepo = {
  insert(type: 'node' | 'server', targetId: string, data: Omit<MetricPoint, 'createdAt'>): void {
    getDb().prepare(
      'INSERT INTO metrics_history (type, target_id, cpu_percent, memory_used, memory_total, disk_used, disk_total) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(type, targetId, data.cpuPercent, data.memoryUsed, data.memoryTotal, data.diskUsed, data.diskTotal);
  },

  /** Get recent metrics for a target. period: '1h', '24h', '7d' */
  getHistory(type: 'node' | 'server', targetId: string, period: string = '24h', limit = 200): MetricPoint[] {
    const periodMap: Record<string, string> = {
      '1h': '-1 hour',
      '6h': '-6 hours',
      '24h': '-24 hours',
      '7d': '-7 days',
    };
    const since = periodMap[period] || '-24 hours';

    return getDb().prepare(
      `SELECT cpu_percent as cpuPercent, memory_used as memoryUsed, memory_total as memoryTotal,
              disk_used as diskUsed, disk_total as diskTotal, created_at as createdAt
       FROM metrics_history
       WHERE type = ? AND target_id = ? AND created_at > datetime('now', ?)
       ORDER BY created_at ASC
       LIMIT ?`
    ).all(type, targetId, since, limit) as MetricPoint[];
  },

  /** Delete metrics older than 7 days */
  cleanup(): number {
    const result = getDb().prepare(
      "DELETE FROM metrics_history WHERE created_at < datetime('now', '-7 days')"
    ).run();
    return result.changes;
  },
};
