import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared.js';
import { GET } from '../services/api.js';
import { onWsEvent } from '../services/ws.js';
import { showToast } from './toast.js';
import { copyText } from '../utils/clipboard.js';
import './player-manager.js';

interface PlayerRecord {
  id: number;
  serverId: string;
  playerName: string;
  playerUuid: string | null;
  firstSeen: string;
  lastSeen: string;
}

@customElement('player-list')
export class PlayerList extends LitElement {
  static styles = [sharedStyles, css`
    :host { display: block; }

    .online-section {
      margin-bottom: 24px;
    }

    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .online-count {
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 10px;
      background: var(--success-bg);
      color: var(--success);
    }

    .player-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-light);
      font-size: 13px;
    }
    .player-row:last-child { border-bottom: none; }

    .player-name {
      flex: 1;
      font-weight: 500;
    }

    .player-uuid {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-muted);
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .player-time {
      font-size: 12px;
      color: var(--text-secondary);
      white-space: nowrap;
    }

    .copy-uuid {
      font-size: 11px;
      color: var(--accent);
      background: none;
      border: none;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: var(--font-sans);
    }
    .copy-uuid:hover { background: var(--bg-hover); }

    .online-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
      flex-shrink: 0;
    }

    .offline-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--text-muted);
      flex-shrink: 0;
    }

    .player-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
    }

    .player-card-header {
      padding: 10px 12px;
      background: var(--bg-tertiary);
      border-bottom: 1px solid var(--border);
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
    }
  `];

  @property() serverId = '';
  @property({ type: Object }) serverConfig: Record<string, string> = {};
  @state() private onlinePlayers: string[] = [];
  @state() private whitelistedNames = new Set<string>();
  @state() private onlineCount = 0;
  @state() private maxPlayers = 0;
  @state() private history: PlayerRecord[] = [];
  private cleanupWs?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this.loadHistory();
    this.loadWhitelist();
    this.addEventListener('whitelist-changed', () => this.loadWhitelist());

    this.cleanupWs = onWsEvent((event) => {
      if (event.type === 'server:players' && event.serverId === this.serverId) {
        this.onlinePlayers = event.players;
        this.onlineCount = event.online;
        this.maxPlayers = event.max;
        // Refresh history when players change
        this.loadHistory();
      }
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.cleanupWs?.();
  }

  private async loadHistory() {
    try {
      const res = await GET<{ data: PlayerRecord[] }>(`/api/servers/${this.serverId}/players?limit=50`);
      this.history = res.data;
    } catch { /* ignore */ }
  }

  private async loadWhitelist() {
    try {
      const res = await GET<{ data: { content: string } }>(`/api/servers/${this.serverId}/files/read?path=/whitelist.json`);
      const list = JSON.parse(res.data.content || '[]') as { name: string }[];
      this.whitelistedNames = new Set(list.map(p => p.name.toLowerCase()));
    } catch { /* no whitelist file */ }
  }

  private async addToWhitelist(playerName: string) {
    try {
      const { POST } = await import('../services/api.js');
      await POST(`/api/servers/${this.serverId}/command`, { command: `whitelist add ${playerName}` });
      this.whitelistedNames = new Set([...this.whitelistedNames, playerName.toLowerCase()]);
      showToast(`${playerName} added to whitelist`, 'success');
      // Refresh both player-list whitelist cache and player-manager component
      setTimeout(() => {
        this.loadWhitelist();
        this.shadowRoot?.querySelector('player-manager')?.dispatchEvent(new CustomEvent('refresh'));
      }, 1000);
    } catch {
      showToast('Failed to add to whitelist', 'error');
    }
  }

  private async copyUuid(uuid: string) {
    await copyText(uuid);
    showToast('UUID copied', 'success', 2000);
  }

  private formatTime(iso: string): string {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diff = now.getTime() - d.getTime();
      if (diff < 60_000) return 'Just now';
      if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
      if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
      return d.toLocaleDateString();
    } catch { return iso; }
  }

  render() {
    const onlineSet = new Set(this.onlinePlayers);

    return html`
      ${this.onlinePlayers.length > 0 ? html`
        <div class="online-section">
          <div class="section-title">
            Online Now
            <span class="online-count">${this.onlineCount} / ${this.maxPlayers}</span>
          </div>
          <div class="player-card">
            ${this.onlinePlayers.map(name => html`
              <div class="player-row">
                <span class="online-dot"></span>
                <span class="player-name">${name}</span>
              </div>
            `)}
          </div>
        </div>
      ` : html`
        <div class="section-title">
          Online Now
          <span class="online-count">${this.onlineCount} / ${this.maxPlayers || '?'}</span>
        </div>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:24px">No players online</p>
      `}

      <div class="section-title">Player History</div>
      ${this.history.length === 0
        ? html`<p style="color:var(--text-muted);font-size:13px">No players have been seen on this server yet.</p>`
        : html`
          <div class="player-card">
            <div class="player-card-header" style="display:grid;grid-template-columns:24px 1fr 1fr auto auto;gap:12px">
              <span></span>
              <span>Player</span>
              <span>UUID</span>
              <span>Last Seen</span>
              <span></span>
            </div>
            ${this.history.map(p => html`
              <div class="player-row" style="display:grid;grid-template-columns:24px 1fr 1fr auto auto;gap:12px">
                <span class="${onlineSet.has(p.playerName) ? 'online-dot' : 'offline-dot'}" style="align-self:center"></span>
                <span class="player-name">${p.playerName}</span>
                <span class="player-uuid">${p.playerUuid || '-'}</span>
                <span class="player-time">${this.formatTime(p.lastSeen)}</span>
                <span style="display:flex;gap:4px">
                  ${p.playerUuid ? html`<button class="copy-uuid" @click=${() => this.copyUuid(p.playerUuid!)} title="Copy UUID">Copy</button>` : ''}
                  ${this.serverConfig['white-list'] === 'true' && !this.whitelistedNames.has(p.playerName.toLowerCase())
                    ? html`<button class="copy-uuid" style="color:var(--success)" @click=${() => this.addToWhitelist(p.playerName)} title="Add to whitelist">+ Whitelist</button>`
                    : ''}
                </span>
              </div>
            `)}
          </div>
        `}

      <player-manager .serverId=${this.serverId} .whitelistEnabled=${this.serverConfig['white-list'] === 'true'}></player-manager>
    `;
  }
}
