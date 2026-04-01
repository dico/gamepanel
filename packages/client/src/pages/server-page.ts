import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared.js';
import { GET, POST, PATCH, DELETE } from '../services/api.js';
import { onWsEvent } from '../services/ws.js';
import { navigate } from '../router.js';
import type { Server, GameTemplate } from '@gamepanel/shared';

import '../components/server-console.js';
import '../components/file-manager.js';
import '../components/config-form.js';
import '../components/player-list.js';
import '../components/backup-manager.js';
import { showToast } from '../components/toast.js';
import { confirm } from '../components/confirm-dialog.js';
import { copyText } from '../utils/clipboard.js';

@customElement('server-page')
export class ServerPage extends LitElement {
  static styles = [sharedStyles, css`
    :host { display: block; }

    .back { color: var(--text-secondary); font-size: 13px; margin-bottom: 16px; display: inline-block; }
    .back:hover { color: var(--accent); }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
    }

    .template-name { color: var(--text-secondary); font-size: 14px; margin-top: 4px; }

    .server-title { cursor: pointer; border-bottom: 1px dashed transparent; }
    .server-title:hover { border-bottom-color: var(--text-muted); }
    .rename-input {
      font-size: 24px; font-weight: 700;
      background: var(--bg-primary); border: 1px solid var(--accent);
      border-radius: var(--radius-sm); color: var(--text-primary);
      padding: 2px 8px; font-family: var(--font-sans); outline: none;
      width: 100%; max-width: 400px; height: auto;
    }

    .connect-box {
      background: var(--bg-secondary); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 12px 16px; margin-bottom: 20px;
      display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    }
    .connect-label { font-size: 12px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px; font-weight: 600; }
    .connect-addr {
      font-family: var(--font-mono); font-size: 14px;
      background: var(--bg-primary); padding: 6px 12px;
      border-radius: var(--radius-sm); border: 1px solid var(--border-light); user-select: all;
    }
    .copy-btn.copied { color: var(--success) !important; border-color: var(--success) !important; }

    .actions { display: flex; gap: 8px; margin-bottom: 24px; align-items: center; }

    .more-menu { position: relative; }
    .more-btn {
      background: none; border: 1px solid var(--border); border-radius: var(--radius-sm);
      color: var(--text-secondary); padding: 6px 12px; font-size: 16px; cursor: pointer; line-height: 1;
    }
    .more-btn:hover { background: var(--bg-hover); }
    .more-dropdown {
      position: absolute; top: 100%; right: 0; margin-top: 4px;
      background: var(--bg-secondary); border: 1px solid var(--border);
      border-radius: var(--radius); box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 50; min-width: 160px; overflow: hidden;
    }
    .more-dropdown button {
      display: block; width: 100%; padding: 10px 16px;
      background: none; border: none; color: var(--text-primary);
      font-size: 13px; text-align: left; cursor: pointer;
    }
    .more-dropdown button:hover { background: var(--bg-hover); }
    .more-dropdown .danger { color: var(--danger); }
    .more-dropdown .danger:hover { background: var(--danger-bg); }

    .tabs { display: flex; border-bottom: 1px solid var(--border); margin-bottom: 24px; }
    .tab {
      padding: 10px 20px; font-size: 14px; color: var(--text-secondary);
      cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px;
      background: none; border-top: none; border-left: none; border-right: none;
    }
    .tab:hover { color: var(--text-primary); }
    .tab.active { color: var(--accent); border-bottom-color: var(--accent); }

    .action-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 200;
      gap: 16px;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .action-label {
      color: white;
      font-size: 16px;
      font-weight: 500;
    }

    .info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
    .info-card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
    .info-label { font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
    .info-value { font-family: var(--font-mono); font-size: 14px; word-break: break-all; }

    @media (max-width: 768px) {
      .header { flex-direction: column; align-items: flex-start; gap: 8px; }
      .connect-box { flex-direction: column; align-items: flex-start; }
      .connect-addr { font-size: 13px; }
      .actions { flex-wrap: wrap; }
      .tabs { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .tab { padding: 8px 12px; font-size: 13px; white-space: nowrap; }
      .info-grid { grid-template-columns: 1fr; }
    }
  `];

  @property() serverId = '';
  @state() private server: Server | null = null;
  @state() private template: GameTemplate | null = null;
  @state() private activeTab = 'console';
  @state() private copied = '';
  @state() private externalHost = '';
  @state() private showMoreMenu = false;
  @state() private renaming = false;
  @state() private actionInProgress = '';
  private cleanupWs?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this.loadServer();
    this.cleanupWs = onWsEvent((event) => {
      if (event.type === 'server:status' && event.serverId === this.serverId) {
        if (this.server && this.server.status !== 'creating') {
          this.server = { ...this.server, status: event.status };
        }
      }
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.cleanupWs?.();
  }

  private async loadServer() {
    try {
      const [serverRes, settingsRes] = await Promise.all([
        GET<{ data: Server }>(`/api/servers/${this.serverId}`),
        GET<{ data: Record<string, string> }>('/api/settings'),
      ]);
      this.server = serverRes.data;
      this.externalHost = settingsRes.data?.externalHost || '';
      const tmplRes = await GET<{ data: GameTemplate }>(`/api/templates/${this.server.templateSlug}`);
      this.template = tmplRes.data;
    } catch { navigate('/'); }
  }

  private async saveRename(e: Event) {
    const newName = (e.target as HTMLInputElement).value.trim();
    this.renaming = false;
    if (!newName || !this.server || newName === this.server.name) return;
    try {
      await PATCH(`/api/servers/${this.server.id}`, { name: newName });
      this.server = { ...this.server, name: newName };
      showToast('Server renamed', 'success');
    } catch (err: any) { showToast(err.body?.message || 'Rename failed', 'error'); }
  }

  private async copyAddr(text: string) {
    await copyText(text);
    this.copied = text;
    showToast('Copied to clipboard', 'success', 2000);
    setTimeout(() => { this.copied = ''; }, 2000);
  }

  private async handleAction(action: string) {
    if (!this.server) return;
    if (action === 'delete') {
      const ok = await confirm('Delete server?', 'This will stop and remove the container. Server data will be kept.', { confirmText: 'Delete', danger: true });
      if (!ok) return;
      await DELETE(`/api/servers/${this.server.id}`);
      showToast('Server deleted', 'success');
      navigate('/');
      return;
    }
    const labels: Record<string, string> = {
      start: 'Starting server...',
      stop: 'Stopping server...',
      restart: 'Restarting server...',
      recreate: 'Recreating server...',
    };
    this.actionInProgress = labels[action] || `${action}...`;

    try {
      await POST(`/api/servers/${this.server.id}/${action}`);
    } catch (err: any) {
      showToast(err.body?.message || `${action} failed`, 'error');
    }
    this.actionInProgress = '';
    this.loadServer();
  }

  render() {
    if (!this.server) return html`<p>Loading...</p>`;
    const s = this.server;

    return html`
      ${this.actionInProgress ? html`
        <div class="action-overlay">
          <div class="spinner"></div>
          <div class="action-label">${this.actionInProgress}</div>
        </div>
      ` : ''}

      <a href="/" class="back">&larr; Back to servers</a>

      <div class="header">
        <div>
          ${this.renaming
            ? html`<input class="rename-input" type="text" .value=${s.name}
                @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this.saveRename(e); if (e.key === 'Escape') this.renaming = false; }}
                @blur=${(e: Event) => this.saveRename(e)} autofocus>`
            : html`<h1 class="server-title" @click=${() => this.renaming = true} title="Click to rename">${s.name}</h1>`}
          <div class="template-name">${this.template?.name ?? s.templateSlug}</div>
        </div>
        <span class="badge badge-${s.status}">${s.status}</span>
      </div>

      ${s.status === 'running' && s.ports.length > 0 ? html`
        <div class="connect-box">
          <span class="connect-label">Connect</span>
          ${s.ports.map(p => {
            const local = `${location.hostname}:${p.host}`;
            const ext = this.externalHost ? `${this.externalHost}:${p.host}` : '';
            return html`
              <span class="connect-addr">${local}</span>
              <button class="btn btn-sm copy-btn ${this.copied === local ? 'copied' : ''}" @click=${() => this.copyAddr(local)}>
                ${this.copied === local ? 'Copied!' : 'Copy'}</button>
              ${ext ? html`
                <span class="connect-addr">${ext}</span>
                <button class="btn btn-sm copy-btn ${this.copied === ext ? 'copied' : ''}" @click=${() => this.copyAddr(ext)}>
                  ${this.copied === ext ? 'Copied!' : 'Copy'}</button>` : ''}
            `;
          })}
        </div>` : ''}

      <div class="actions">
        ${s.status === 'stopped' || s.status === 'error' ? html`<button class="btn btn-success" @click=${() => this.handleAction('start')}>Start</button>` : ''}
        ${s.status === 'running' ? html`
          <button class="btn" @click=${() => this.handleAction('stop')}>Stop</button>
          <button class="btn" @click=${() => this.handleAction('restart')}>Restart</button>` : ''}
        ${s.status === 'creating' ? html`<span style="color:var(--text-secondary);font-size:13px">Starting...</span>` : ''}
        <div class="more-menu">
          <button class="more-btn" @click=${() => this.showMoreMenu = !this.showMoreMenu}>&#8943;</button>
          ${this.showMoreMenu ? html`
            <div class="more-dropdown">
              <button @click=${() => { this.showMoreMenu = false; this.handleAction('recreate'); }}>Recreate</button>
              <button class="danger" @click=${() => { this.showMoreMenu = false; this.handleAction('delete'); }}>Delete</button>
            </div>` : ''}
        </div>
      </div>

      <div class="tabs">
        ${(['console', 'players', 'config', 'files', 'backups', 'info'] as const).map(tab => html`
          <button class="tab ${this.activeTab === tab ? 'active' : ''}" @click=${() => this.activeTab = tab}>
            ${{ console: 'Console', players: 'Players', config: 'Configuration', files: 'Files', backups: 'Backups', info: 'Info' }[tab]}</button>`)}
      </div>

      ${this.activeTab === 'console' ? html`<server-console .serverId=${this.serverId} .quickCommands=${this.template?.quickCommands ?? []}></server-console>` : ''}
      ${this.activeTab === 'players' ? html`<player-list .serverId=${this.serverId} .serverConfig=${s.configValues}></player-list>` : ''}
      ${this.activeTab === 'config' && this.template ? html`<config-form .server=${s} .template=${this.template} @saved=${() => this.loadServer()}></config-form>` : ''}
      ${this.activeTab === 'files' ? html`<file-manager .serverId=${this.serverId}></file-manager>` : ''}
      ${this.activeTab === 'backups' ? html`<backup-manager .serverId=${this.serverId} .serverStatus=${s.status}></backup-manager>` : ''}
      ${this.activeTab === 'info' ? html`
        <div class="info-grid">
          ${([['Server ID', s.id], ['Container', s.containerId?.slice(0, 12) ?? 'None'], ['Node', s.nodeId],
             ['Template', s.templateSlug], ['Ports', s.ports.map(p => `${p.host}:${p.container}/${p.protocol}`).join(', ')],
             ['Created', s.createdAt]] as const).map(([label, value]) => html`
            <div class="info-card"><div class="info-label">${label}</div><div class="info-value">${value}</div></div>`)}
        </div>` : ''}
    `;
  }
}
