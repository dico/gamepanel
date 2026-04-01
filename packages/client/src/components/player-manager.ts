import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared.js';
import { GET } from '../services/api.js';
import { api } from '../services/api.js';
import { showToast } from './toast.js';
import { confirm } from './confirm-dialog.js';

interface McPlayer {
  uuid: string;
  name: string;
}

interface McOp extends McPlayer {
  level: number;
}

/**
 * Manage whitelist.json and ops.json for Minecraft servers.
 * Shows on the Players tab alongside online/history.
 */
@customElement('player-manager')
export class PlayerManager extends LitElement {
  static styles = [sharedStyles, css`
    :host { display: block; margin-top: 24px; }

    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 12px;
    }

    .player-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      margin-bottom: 16px;
    }

    .player-card-header {
      padding: 10px 16px;
      background: var(--bg-tertiary);
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .player-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 16px;
      border-bottom: 1px solid var(--border-light);
      font-size: 13px;
    }
    .player-row:last-child { border-bottom: none; }

    .player-name { flex: 1; font-weight: 500; }
    .player-uuid { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); }
    .player-level { font-size: 12px; color: var(--text-secondary); }

    .add-form {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid var(--border);
    }
    .add-form input {
      flex: 1;
      height: 36px;
      font-size: 13px;
      margin: 0;
    }

    .empty-msg {
      padding: 16px;
      color: var(--text-muted);
      font-size: 13px;
    }
  `];

  @property() serverId = '';
  @property({ type: Boolean }) whitelistEnabled = false;
  @state() private whitelist: McPlayer[] = [];
  @state() private ops: McOp[] = [];
  @state() private newWhitelistName = '';
  @state() private newOpName = '';

  connectedCallback() {
    super.connectedCallback();
    this.loadData();
    this.addEventListener('refresh', () => this.loadData());
  }

  private async loadData() {
    try {
      const wlRes = await GET<{ data: { content: string } }>(
        `/api/servers/${this.serverId}/files/read?path=/whitelist.json`
      );
      this.whitelist = JSON.parse(wlRes.data.content || '[]');
    } catch { this.whitelist = []; }

    try {
      const opsRes = await GET<{ data: { content: string } }>(
        `/api/servers/${this.serverId}/files/read?path=/ops.json`
      );
      this.ops = JSON.parse(opsRes.data.content || '[]');
    } catch { this.ops = []; }
  }

  private async addToWhitelist() {
    const name = this.newWhitelistName.trim();
    if (!name) return;
    if (this.whitelist.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      showToast('Player already whitelisted', 'warning');
      return;
    }

    // Use console command — takes effect immediately, no restart needed
    await this.runCommand(`whitelist add ${name}`);
    this.newWhitelistName = '';

    setTimeout(() => {
      this.loadData();
      this.dispatchEvent(new CustomEvent('whitelist-changed', { bubbles: true, composed: true }));
    }, 1000);
    showToast(`${name} added to whitelist`, 'success');
  }

  private async removeFromWhitelist(name: string) {
    await this.runCommand(`whitelist remove ${name}`);
    setTimeout(() => {
      this.loadData();
      // Notify parent to refresh whitelist cache (for "+ Whitelist" button in history)
      this.dispatchEvent(new CustomEvent('whitelist-changed', { bubbles: true, composed: true }));
    }, 1000);
    showToast(`${name} removed from whitelist`, 'success');
  }

  private async addOp() {
    const name = this.newOpName.trim();
    if (!name) return;
    if (this.ops.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      showToast('Player is already an operator', 'warning');
      return;
    }

    await this.runCommand(`op ${name}`);
    this.newOpName = '';
    setTimeout(() => this.loadData(), 1000);
    showToast(`${name} added as operator`, 'success');
  }

  private async removeOp(name: string) {
    await this.runCommand(`deop ${name}`);
    setTimeout(() => this.loadData(), 1000);
    showToast(`${name} removed from operators`, 'success');
  }

  private async runCommand(command: string) {
    try {
      await api(`/api/servers/${this.serverId}/command`, {
        method: 'POST',
        body: JSON.stringify({ command }),
      });
    } catch { /* ignore — command endpoint might not exist yet */ }
  }

  render() {
    return html`
      ${this.whitelistEnabled ? html`
        <div class="section-title">Whitelist</div>
        <div class="player-card">
          <div class="player-card-header">
            <span>Whitelisted Players (${this.whitelist.length})</span>
          </div>
          ${this.whitelist.length === 0
            ? html`<div class="empty-msg">No players whitelisted. Only whitelisted players can join the server.</div>`
            : this.whitelist.map(p => html`
              <div class="player-row">
                <span class="player-name">${p.name}</span>
                <span class="player-uuid">${p.uuid || 'UUID resolved on join'}</span>
                <button class="btn btn-sm btn-danger" @click=${() => this.removeFromWhitelist(p.name)}>Remove</button>
              </div>
            `)
          }
          <div class="add-form">
            <input type="text" placeholder="Player name" .value=${this.newWhitelistName}
              @input=${(e: Event) => this.newWhitelistName = (e.target as HTMLInputElement).value}
              @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && this.addToWhitelist()}>
            <button class="btn btn-sm btn-primary" @click=${() => this.addToWhitelist()}>Add</button>
          </div>
        </div>
      ` : ''}

      <div class="section-title">Operators (Admin)</div>
      <div class="player-card">
        <div class="player-card-header">
          <span>Server Operators (${this.ops.length})</span>
        </div>
        ${this.ops.length === 0
          ? html`<div class="empty-msg">No operators. Add players who should have admin commands in-game.</div>`
          : this.ops.map(p => html`
            <div class="player-row">
              <span class="player-name">${p.name}</span>
              <span class="player-level">Level ${p.level}</span>
              <button class="btn btn-sm btn-danger" @click=${() => this.removeOp(p.name)}>Remove</button>
            </div>
          `)
        }
        <div class="add-form">
          <input type="text" placeholder="Player name" .value=${this.newOpName}
            @input=${(e: Event) => this.newOpName = (e.target as HTMLInputElement).value}
            @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && this.addOp()}>
          <button class="btn btn-sm btn-primary" @click=${() => this.addOp()}>Add</button>
        </div>
      </div>

      <p style="font-size:12px;color:var(--text-muted);margin-top:8px">
        Changes take effect immediately — no restart needed.
      </p>
    `;
  }
}
