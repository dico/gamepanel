import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared.js';
import { GET, POST, PATCH, DELETE } from '../services/api.js';
import { onWsEvent } from '../services/ws.js';
import { navigate } from '../router.js';
import type { Server, GameTemplate } from '@gamepanel/shared';

import '../components/file-manager.js';
import '../components/config-form.js';
import '../components/player-list.js';
import '../components/backup-manager.js';
import { showToast } from '../components/toast.js';
import { confirm } from '../components/confirm-dialog.js';
import { parseAnsi } from '../utils/ansi.js';
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

    .server-title {
      cursor: pointer;
      border-bottom: 1px dashed transparent;
    }
    .server-title:hover { border-bottom-color: var(--text-muted); }
    .rename-input {
      font-size: 24px;
      font-weight: 700;
      background: var(--bg-primary);
      border: 1px solid var(--accent);
      border-radius: var(--radius-sm);
      color: var(--text-primary);
      padding: 2px 8px;
      font-family: var(--font-sans);
      outline: none;
      width: 100%;
      max-width: 400px;
      height: auto;
    }

    .connect-box {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 12px 16px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .connect-box .connect-label {
      font-size: 12px;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.3px;
      font-weight: 600;
    }
    .connect-addr {
      font-family: var(--font-mono);
      font-size: 14px;
      background: var(--bg-primary);
      padding: 6px 12px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-light);
      user-select: all;
    }
    .copy-btn { transition: color 0.15s; }
    .copy-btn.copied { color: var(--success) !important; border-color: var(--success) !important; }

    .actions { display: flex; gap: 8px; margin-bottom: 24px; align-items: center; }

    .more-menu {
      position: relative;
    }
    .more-btn {
      background: none;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      color: var(--text-secondary);
      padding: 6px 12px;
      font-size: 16px;
      cursor: pointer;
      line-height: 1;
    }
    .more-btn:hover { background: var(--bg-hover); }
    .more-dropdown {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 4px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 50;
      min-width: 160px;
      overflow: hidden;
    }
    .more-dropdown button {
      display: block;
      width: 100%;
      padding: 10px 16px;
      background: none;
      border: none;
      color: var(--text-primary);
      font-size: 13px;
      text-align: left;
      cursor: pointer;
    }
    .more-dropdown button:hover { background: var(--bg-hover); }
    .more-dropdown .danger { color: var(--danger); }
    .more-dropdown .danger:hover { background: var(--danger-bg); }

    .tabs {
      display: flex;
      border-bottom: 1px solid var(--border);
      margin-bottom: 24px;
    }
    .tab {
      padding: 10px 20px;
      font-size: 14px;
      color: var(--text-secondary);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      background: none;
      border-top: none; border-left: none; border-right: none;
    }
    .tab:hover { color: var(--text-primary); }
    .tab.active { color: var(--accent); border-bottom-color: var(--accent); }

    .console-container {
      background: #0d1117;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
    }
    .console-output {
      height: 500px;
      overflow-y: auto;
      padding: 8px 12px;
      font-family: var(--font-mono);
      font-size: 13px;
      line-height: 1.2;
      color: #c9d1d9;
      word-break: break-all;
    }
    .console-line { margin: 0; }
    .console-command { color: var(--accent); }
    .console-input {
      display: flex;
      border-top: 1px solid var(--border);
    }
    .console-input span {
      padding: 12px;
      color: var(--accent);
      font-family: var(--font-mono);
      font-size: 13px;
    }
    .console-input input {
      flex: 1;
      padding: 12px 12px 12px 0;
      background: transparent;
      border: none;
      color: var(--text-primary);
      font-family: var(--font-mono);
      font-size: 13px;
      outline: none;
      height: auto;
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 12px;
    }
    .info-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
    }
    .info-card .info-label { font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
    .info-card .info-value { font-family: var(--font-mono); font-size: 14px; }
  `];

  @property() serverId = '';
  @state() private server: Server | null = null;
  @state() private template: GameTemplate | null = null;
  @state() private activeTab = 'console';
  @state() private consoleLines: string[] = [];
  @state() private commandHistory: string[] = [];
  @state() private historyIndex = -1;
  @state() private copied = '';
  @state() private externalHost = '';
  @state() private showMoreMenu = false;
  @state() private renaming = false;

  private ws: WebSocket | null = null;
  private cleanupWs?: () => void;
  private consoleEl?: HTMLElement;

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
    this.ws?.close();
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
      this.connectConsole();
    } catch {
      navigate('/');
    }
  }

  private connectConsole() {
    if (this.ws) this.ws.close();

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${location.host}/ws/servers/${this.serverId}/console`);

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'history') {
          this.consoleLines = [...this.consoleLines, ...data.lines];
        } else if (data.type === 'log' || data.type === 'command') {
          this.consoleLines = [...this.consoleLines, data.line];
        }
        this.scrollConsole();
      } catch { /* ignore */ }
    };

    this.ws.onclose = () => {
      setTimeout(() => {
        if (this.isConnected) this.connectConsole();
      }, 3000);
    };
  }

  private scrollConsole() {
    requestAnimationFrame(() => {
      const el = this.shadowRoot?.querySelector('.console-output');
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  private sendCommand(e: KeyboardEvent) {
    if (e.key !== 'Enter') {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.historyIndex < this.commandHistory.length - 1) {
          this.historyIndex++;
          (e.target as HTMLInputElement).value = this.commandHistory[this.commandHistory.length - 1 - this.historyIndex];
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.historyIndex > 0) {
          this.historyIndex--;
          (e.target as HTMLInputElement).value = this.commandHistory[this.commandHistory.length - 1 - this.historyIndex];
        } else {
          this.historyIndex = -1;
          (e.target as HTMLInputElement).value = '';
        }
        return;
      }
      return;
    }

    const input = e.target as HTMLInputElement;
    const cmd = input.value.trim();
    if (!cmd) return;

    this.ws?.send(JSON.stringify({ type: 'command', command: cmd }));
    this.commandHistory.push(cmd);
    this.historyIndex = -1;
    input.value = '';
  }

  private async saveRename(e: Event) {
    const input = e.target as HTMLInputElement;
    const newName = input.value.trim();
    this.renaming = false;
    if (!newName || !this.server || newName === this.server.name) return;

    try {
      await PATCH(`/api/servers/${this.server.id}`, { name: newName });
      this.server = { ...this.server, name: newName };
      showToast('Server renamed', 'success');
    } catch (err: any) {
      showToast(err.body?.message || 'Rename failed', 'error');
    }
  }

  private async copyToClipboard(text: string) {
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
    // Optimistic UI — show expected state immediately
    if (action === 'start' || action === 'restart' || action === 'recreate') {
      this.server = { ...this.server, status: 'creating' };
    } else if (action === 'stop') {
      this.server = { ...this.server, status: 'stopped' };
    }
    showToast(`Server ${action} requested`, 'info');

    try {
      await POST(`/api/servers/${this.server.id}/${action}`);
    } catch (err: any) {
      showToast(err.body?.message || `${action} failed`, 'error');
    }
    // Reload actual state from backend
    this.loadServer();
  }

  render() {
    if (!this.server) return html`<p>Loading...</p>`;

    return html`
      <a href="/" class="back">&larr; Back to servers</a>

      <div class="header">
        <div>
          ${this.renaming
            ? html`<input class="rename-input" type="text" .value=${this.server.name}
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === 'Enter') this.saveRename(e);
                  if (e.key === 'Escape') this.renaming = false;
                }}
                @blur=${(e: Event) => this.saveRename(e)}
                autofocus>`
            : html`<h1 class="server-title" @click=${() => this.renaming = true}
                title="Click to rename">${this.server.name}</h1>`
          }
          <div class="template-name">${this.template?.name ?? this.server.templateSlug}</div>
        </div>
        <span class="badge badge-${this.server.status}">${this.server.status}</span>
      </div>

      ${this.server.status === 'running' && this.server.ports.length > 0 ? html`
        <div class="connect-box">
          <span class="connect-label">Connect</span>
          ${this.server.ports.map(p => {
            const localAddr = `${location.hostname}:${p.host}`;
            const extAddr = this.externalHost ? `${this.externalHost}:${p.host}` : '';
            return html`
              <span class="connect-addr">${localAddr}</span>
              <button class="copy-btn ${this.copied === localAddr ? 'copied' : ''}"
                @click=${() => this.copyToClipboard(localAddr)}>
                ${this.copied === localAddr ? 'Copied!' : 'Copy'}
              </button>
              ${extAddr ? html`
                <span class="connect-addr">${extAddr}</span>
                <button class="copy-btn ${this.copied === extAddr ? 'copied' : ''}"
                  @click=${() => this.copyToClipboard(extAddr)}>
                  ${this.copied === extAddr ? 'Copied!' : 'Copy'}
                </button>
              ` : ''}
            `;
          })}
        </div>
      ` : ''}

      <div class="actions">
        ${this.server.status === 'stopped' || this.server.status === 'error'
          ? html`<button class="btn btn-success" @click=${() => this.handleAction('start')}>Start</button>`
          : ''}
        ${this.server.status === 'running'
          ? html`
            <button class="btn" @click=${() => this.handleAction('stop')}>Stop</button>
            <button class="btn" @click=${() => this.handleAction('restart')}>Restart</button>`
          : ''}
        ${this.server.status === 'creating'
          ? html`<span style="color:var(--text-secondary);font-size:13px">Starting...</span>`
          : ''}
        <div class="more-menu">
          <button class="more-btn" @click=${() => this.showMoreMenu = !this.showMoreMenu}>&#8943;</button>
          ${this.showMoreMenu ? html`
            <div class="more-dropdown">
              <button @click=${() => { this.showMoreMenu = false; this.handleAction('recreate'); }}>Recreate</button>
              <button class="danger" @click=${() => { this.showMoreMenu = false; this.handleAction('delete'); }}>Delete</button>
            </div>
          ` : ''}
        </div>
      </div>

      <div class="tabs">
        <button class="tab ${this.activeTab === 'console' ? 'active' : ''}" @click=${() => this.activeTab = 'console'}>Console</button>
        <button class="tab ${this.activeTab === 'players' ? 'active' : ''}" @click=${() => this.activeTab = 'players'}>Players</button>
        <button class="tab ${this.activeTab === 'config' ? 'active' : ''}" @click=${() => this.activeTab = 'config'}>Configuration</button>
        <button class="tab ${this.activeTab === 'files' ? 'active' : ''}" @click=${() => this.activeTab = 'files'}>Files</button>
        <button class="tab ${this.activeTab === 'backups' ? 'active' : ''}" @click=${() => this.activeTab = 'backups'}>Backups</button>
        <button class="tab ${this.activeTab === 'info' ? 'active' : ''}" @click=${() => this.activeTab = 'info'}>Info</button>
      </div>

      ${this.activeTab === 'console' ? this.renderConsole() : ''}
      ${this.activeTab === 'players' ? html`<player-list .serverId=${this.serverId}></player-list>` : ''}
      ${this.activeTab === 'config' ? this.renderConfig() : ''}
      ${this.activeTab === 'files' ? html`<file-manager .serverId=${this.serverId}></file-manager>` : ''}
      ${this.activeTab === 'backups' ? html`<backup-manager .serverId=${this.serverId} .serverStatus=${this.server?.status ?? ''}></backup-manager>` : ''}
      ${this.activeTab === 'info' ? this.renderInfo() : ''}
    `;
  }

  private renderAnsiLine(line: string) {
    if (line.startsWith('>')) return line; // Commands don't have ANSI
    const segments = parseAnsi(line);
    if (segments.length === 1 && !segments[0].color) return line;
    return segments.map(s =>
      s.color
        ? html`<span style="color:${s.color};${s.bold ? 'font-weight:bold' : ''}">${s.text}</span>`
        : s.bold
          ? html`<span style="font-weight:bold">${s.text}</span>`
          : s.text
    );
  }

  private renderConsole() {
    return html`
      <div class="console-container">
        <div class="console-output">
          ${this.consoleLines.map(line => html`
            <div class="console-line ${line.startsWith('>') ? 'console-command' : ''}">${this.renderAnsiLine(line)}</div>
          `)}
        </div>
        <div class="console-input">
          <span>&gt;</span>
          <input type="text" placeholder="Enter command..." @keydown=${this.sendCommand}>
        </div>
      </div>
    `;
  }

  private renderConfig() {
    if (!this.server || !this.template) return html`<p>Loading...</p>`;
    return html`
      <config-form
        .server=${this.server}
        .template=${this.template}
        @saved=${() => this.loadServer()}
      ></config-form>
    `;
  }

  private renderInfo() {
    if (!this.server) return '';
    return html`
      <div class="info-grid">
        <div class="info-card">
          <div class="info-label">Server ID</div>
          <div class="info-value">${this.server.id}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Container ID</div>
          <div class="info-value">${this.server.containerId?.slice(0, 12) ?? 'None'}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Node</div>
          <div class="info-value">${this.server.nodeId}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Template</div>
          <div class="info-value">${this.server.templateSlug}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Ports</div>
          <div class="info-value">${this.server.ports.map(p => `${p.host}:${p.container}/${p.protocol}`).join(', ')}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Created</div>
          <div class="info-value">${this.server.createdAt}</div>
        </div>
      </div>
    `;
  }
}
