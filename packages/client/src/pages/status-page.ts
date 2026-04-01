import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

interface StatusData {
  name: string;
  game: string;
  status: string;
  ports: { name: string; port: number; protocol: string }[];
}

/**
 * Public status page — no auth required.
 * Shows server name, game, status, and connection info.
 */
@customElement('status-page')
export class StatusPage extends LitElement {
  static styles = css`
    :host {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      font-family: var(--font-sans);
      background: var(--bg-primary);
      color: var(--text-primary);
    }

    .card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 40px;
      width: 100%;
      max-width: 420px;
      text-align: center;
    }

    .game { color: var(--text-secondary); font-size: 14px; margin-bottom: 16px; }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; }

    .status {
      display: inline-block;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
      text-transform: uppercase;
      margin-bottom: 24px;
    }
    .status-running { background: #1a3a2a; color: #3fb950; }
    .status-stopped { background: #21262d; color: #8b949e; }
    .status-error { background: #3a1a1a; color: #f85149; }

    .connect {
      font-family: var(--font-mono);
      font-size: 18px;
      padding: 12px 20px;
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: 8px;
      user-select: all;
      cursor: pointer;
    }
    .connect:hover { border-color: var(--accent); }

    .port-label {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 8px;
    }

    .branding {
      margin-top: 32px;
      font-size: 12px;
      color: var(--text-muted);
    }
    .branding a { color: var(--accent); text-decoration: none; }

    .error { color: var(--text-secondary); }

    .not-found { color: var(--text-muted); font-size: 16px; }
  `;

  @property() serverId = '';
  @state() private data: StatusData | null = null;
  @state() private error = false;

  connectedCallback() {
    super.connectedCallback();
    this.loadStatus();
  }

  private async loadStatus() {
    try {
      const res = await fetch(`/api/status/${this.serverId}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      this.data = json.data;
    } catch {
      this.error = true;
    }
  }

  render() {
    if (this.error) {
      return html`<div class="card"><p class="not-found">Server not found</p></div>`;
    }
    if (!this.data) {
      return html`<div class="card"><p>Loading...</p></div>`;
    }

    return html`
      <div class="card">
        <div class="game">${this.data.game}</div>
        <h1>${this.data.name}</h1>
        <div class="status status-${this.data.status}">${this.data.status}</div>

        ${this.data.status === 'running' ? html`
          ${this.data.ports.map(p => html`
            <div class="connect">${location.hostname}:${p.port}</div>
            <div class="port-label">${p.name} (${p.protocol})</div>
          `)}
        ` : ''}

        <div class="branding">Powered by <a href="https://github.com/dico/gamepanel">GamePanel</a></div>
      </div>
    `;
  }
}
