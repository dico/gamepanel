import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared.js';
import { GET, POST, DELETE } from '../services/api.js';
import { onWsEvent } from '../services/ws.js';
import { navigate } from '../router.js';
import type { Server, GameTemplate, GameNode } from '@gamepanel/shared';

import './create-server-dialog.js';
import { showToast } from '../components/toast.js';
import { confirm } from '../components/confirm-dialog.js';

@customElement('dashboard-page')
export class DashboardPage extends LitElement {
  static styles = [sharedStyles, css`
    :host { display: block; }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }

    .server-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .server-card {
      display: flex;
      align-items: center;
      gap: 16px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 12px 20px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .server-card:hover {
      border-color: var(--accent);
      background: var(--bg-tertiary);
    }

    .server-icon {
      width: 36px;
      height: 36px;
      border-radius: var(--radius-sm);
      object-fit: cover;
      flex-shrink: 0;
    }

    .server-info { flex: 1; min-width: 0; }
    .server-name {
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .server-meta {
      font-size: 12px;
      color: var(--text-secondary);
      display: flex;
      gap: 12px;
      margin-top: 2px;
    }

    .server-stats {
      display: flex;
      gap: 12px;
      font-size: 12px;
      color: var(--text-secondary);
      flex-shrink: 0;
    }
    .server-stats .stat-label { color: var(--text-muted); }

    .server-actions { display: flex; gap: 6px; flex-shrink: 0; }

    @media (max-width: 768px) {
      .server-card {
        flex-wrap: wrap;
        padding: 12px;
        gap: 8px;
      }
      .server-info { min-width: calc(100% - 52px); }
      .server-meta { flex-wrap: wrap; gap: 6px; }
      .server-stats { width: 100%; }
      .server-actions { width: 100%; justify-content: flex-end; }
    }
  `];

  @state() private servers: Server[] = [];
  @state() private templates: GameTemplate[] = [];
  @state() private nodes: GameNode[] = [];
  @state() private showCreate = false;
  @state() private serverStats = new Map<string, { cpu: number; memory: number }>();
  @state() private playerCounts = new Map<string, { online: number; max: number }>();
  private cleanupWs?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this.loadData();
    this.cleanupWs = onWsEvent((event) => {
      if (event.type === 'server:status') {
        this.servers = this.servers.map(s =>
          s.id === event.serverId ? { ...s, status: event.status } : s
        );
      } else if (event.type === 'server:stats') {
        const stats = new Map(this.serverStats);
        stats.set(event.serverId, { cpu: event.cpu, memory: event.memory });
        this.serverStats = stats;
      } else if (event.type === 'server:players') {
        const counts = new Map(this.playerCounts);
        counts.set(event.serverId, { online: event.online, max: event.max });
        this.playerCounts = counts;
      } else if (event.type === 'server:created' || event.type === 'server:deleted') {
        this.loadData();
      }
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.cleanupWs?.();
  }

  private async loadData() {
    const [serversRes, templatesRes, nodesRes, liveRes] = await Promise.all([
      GET<{ data: Server[] }>('/api/servers'),
      GET<{ data: GameTemplate[] }>('/api/templates'),
      GET<{ data: GameNode[] }>('/api/nodes'),
      GET<{ data: { stats: Record<string, { cpu: number; memory: number }>; players: Record<string, { online: number; max: number }> } }>('/api/system/live-stats'),
    ]);
    this.servers = serversRes.data;
    this.templates = templatesRes.data;
    this.nodes = nodesRes.data;

    // Populate cached stats immediately
    if (liveRes.data) {
      const stats = new Map(this.serverStats);
      for (const [id, s] of Object.entries(liveRes.data.stats)) stats.set(id, s);
      this.serverStats = stats;

      const counts = new Map(this.playerCounts);
      for (const [id, p] of Object.entries(liveRes.data.players)) counts.set(id, p);
      this.playerCounts = counts;
    }
  }

  private async handleAction(e: Event, serverId: string, action: string) {
    e.stopPropagation();
    if (action === 'delete') {
      const ok = await confirm('Delete server?', 'This will stop and remove the container. Server data will be kept.', { confirmText: 'Delete', danger: true });
      if (!ok) return;
      // Remove from UI immediately for responsiveness
      this.servers = this.servers.filter(s => s.id !== serverId);
      await DELETE(`/api/servers/${serverId}`);
      showToast('Server deleted', 'success');
      this.loadData();
      return;
    }
    await POST(`/api/servers/${serverId}/${action}`);
    showToast(`Server ${action} requested`, 'info');
    // Poll a few times for status update
    setTimeout(() => this.loadData(), 1000);
    setTimeout(() => this.loadData(), 3000);
  }

  private handleServerCreated() {
    this.showCreate = false;
    showToast('Server created', 'success');
    this.loadData();
    // Poll again after Docker has time to start
    setTimeout(() => this.loadData(), 3000);
    setTimeout(() => this.loadData(), 8000);
  }

  private getTemplateName(slug: string): string {
    return this.templates.find(t => t.slug === slug)?.name ?? slug;
  }

  private getTemplateIcon(slug: string): string | undefined {
    return this.templates.find(t => t.slug === slug)?.icon;
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  render() {
    return html`
      <div class="header">
        <h1>Servers</h1>
        <div style="display:flex;gap:8px">
          <a href="/import" class="btn">Import</a>
          <button class="btn btn-primary" @click=${() => this.showCreate = true}>+ New Server</button>
        </div>
      </div>

      ${this.servers.length === 0
        ? html`<div class="empty"><h2>No servers yet</h2><p>Create your first game server to get started.</p></div>`
        : html`
          <div class="server-list">
            ${this.servers.map(server => html`
              <div class="server-card" @click=${() => navigate(`/servers/${server.id}`)}>
                ${this.getTemplateIcon(server.templateSlug)
                  ? html`<img class="server-icon" src="/api/templates/icons/${this.getTemplateIcon(server.templateSlug)}" alt="">`
                  : ''}
                <div class="server-info">
                  <div class="server-name">${server.name}</div>
                  <div class="server-meta">
                    <span>${this.getTemplateName(server.templateSlug)}</span>
                    ${server.environment?.VERSION ? html`<span>${server.environment.VERSION}</span>` : ''}
                    <span>${server.ports.map(p => `${p.host}/${p.protocol}`).join(', ')}</span>
                  </div>
                </div>
                ${this.serverStats.has(server.id) || this.playerCounts.has(server.id) ? html`
                  <div class="server-stats">
                    ${this.playerCounts.has(server.id) ? html`
                      <span><span class="stat-label">Players</span> ${this.playerCounts.get(server.id)!.online}/${this.playerCounts.get(server.id)!.max}</span>
                    ` : ''}
                    ${this.serverStats.has(server.id) ? html`
                      <span><span class="stat-label">CPU</span> ${this.serverStats.get(server.id)!.cpu.toFixed(1)}%</span>
                      <span><span class="stat-label">RAM</span> ${this.formatBytes(this.serverStats.get(server.id)!.memory)}</span>
                    ` : ''}
                  </div>
                ` : ''}
                <span class="badge badge-${server.status}">${server.status}</span>
                <div class="server-actions">
                  ${server.status === 'stopped' || server.status === 'error'
                    ? html`<button class="btn btn-sm" @click=${(e: Event) => this.handleAction(e, server.id, 'start')}>Start</button>` : ''}
                  ${server.status === 'running'
                    ? html`
                      <button class="btn btn-sm" @click=${(e: Event) => this.handleAction(e, server.id, 'stop')}>Stop</button>
                      <button class="btn btn-sm" @click=${(e: Event) => this.handleAction(e, server.id, 'restart')}>Restart</button>` : ''}
                  <button class="btn btn-sm btn-danger" @click=${(e: Event) => this.handleAction(e, server.id, 'delete')}>Delete</button>
                </div>
              </div>
            `)}
          </div>`
      }

      ${this.showCreate
        ? html`<create-server-dialog
            .templates=${this.templates}
            .nodes=${this.nodes}
            @close=${() => this.showCreate = false}
            @created=${() => this.handleServerCreated()}
          ></create-server-dialog>`
        : ''}
    `;
  }
}
