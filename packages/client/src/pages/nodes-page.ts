import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared.js';
import { GET } from '../services/api.js';
import { onWsEvent } from '../services/ws.js';
import type { GameNode, NodeResources } from '@gamepanel/shared';

@customElement('nodes-page')
export class NodesPage extends LitElement {
  static styles = [sharedStyles, css`
    :host { display: block; }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }

    .node-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .node-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
    }

    .node-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .node-name { font-size: 16px; font-weight: 600; }
    .node-host {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 2px;
    }

    .resource-bars {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
    }

    .resource-item {
      font-size: 13px;
    }

    .resource-label {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      color: var(--text-secondary);
      font-size: 12px;
    }

    .bar-bg {
      height: 8px;
      background: var(--bg-hover);
      border-radius: 4px;
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s;
    }
    .bar-fill.ok { background: var(--success); }
    .bar-fill.warn { background: var(--warning); }
    .bar-fill.critical { background: var(--danger); }

    .node-servers {
      margin-top: 12px;
      font-size: 12px;
      color: var(--text-secondary);
    }
  `];

  @state() private nodes: GameNode[] = [];
  @state() private resources = new Map<string, NodeResources>();
  @state() private serverCounts = new Map<string, number>();
  private cleanupWs?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this.loadData();
    this.cleanupWs = onWsEvent((event) => {
      if (event.type === 'node:status') {
        this.nodes = this.nodes.map(n =>
          n.id === event.nodeId ? { ...n, status: event.status } : n
        );
      } else if (event.type === 'node:resources') {
        const res = new Map(this.resources);
        res.set(event.nodeId, event.resources);
        this.resources = res;
      }
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.cleanupWs?.();
  }

  private async loadData() {
    const [nodesRes, serversRes] = await Promise.all([
      GET<{ data: GameNode[] }>('/api/nodes'),
      GET<{ data: any[] }>('/api/servers'),
    ]);
    this.nodes = nodesRes.data;

    // Count servers per node
    const counts = new Map<string, number>();
    for (const s of serversRes.data) {
      counts.set(s.nodeId, (counts.get(s.nodeId) || 0) + 1);
    }
    this.serverCounts = counts;
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  private barClass(percent: number): string {
    if (percent > 90) return 'critical';
    if (percent > 70) return 'warn';
    return 'ok';
  }

  render() {
    return html`
      <div class="header">
        <h1>Nodes</h1>
      </div>

      <div class="node-list">
        ${this.nodes.map(node => {
          const res = this.resources.get(node.id);
          const serverCount = this.serverCounts.get(node.id) || 0;

          return html`
            <div class="node-card">
              <div class="node-header">
                <div>
                  <div class="node-name">${node.name}</div>
                  <div class="node-host">${node.host === 'local' ? 'Local Docker socket' : node.host}</div>
                </div>
                <span class="badge badge-${node.status}">${node.status}</span>
              </div>

              ${res ? html`
                <div class="resource-bars">
                  <div class="resource-item">
                    <div class="resource-label">
                      <span>CPU</span>
                      <span>${res.cpuPercent.toFixed(1)}%</span>
                    </div>
                    <div class="bar-bg">
                      <div class="bar-fill ${this.barClass(res.cpuPercent)}" style="width:${Math.min(res.cpuPercent, 100)}%"></div>
                    </div>
                  </div>
                  <div class="resource-item">
                    <div class="resource-label">
                      <span>Memory</span>
                      <span>${this.formatBytes(res.memoryUsed)} / ${this.formatBytes(res.memoryTotal)}</span>
                    </div>
                    <div class="bar-bg">
                      <div class="bar-fill ${this.barClass(res.memoryUsed / res.memoryTotal * 100)}"
                        style="width:${(res.memoryUsed / res.memoryTotal * 100).toFixed(1)}%"></div>
                    </div>
                  </div>
                  <div class="resource-item">
                    <div class="resource-label">
                      <span>Disk</span>
                      <span>${this.formatBytes(res.diskUsed)} / ${this.formatBytes(res.diskTotal)}</span>
                    </div>
                    <div class="bar-bg">
                      <div class="bar-fill ${this.barClass(res.diskUsed / res.diskTotal * 100)}"
                        style="width:${(res.diskUsed / res.diskTotal * 100).toFixed(1)}%"></div>
                    </div>
                  </div>
                </div>
              ` : html`<p style="color:var(--text-muted);font-size:13px">Resource data not available yet</p>`}

              <div class="node-servers">${serverCount} server${serverCount !== 1 ? 's' : ''}</div>
            </div>
          `;
        })}
      </div>
    `;
  }
}
