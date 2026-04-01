import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared.js';
import { parseAnsi } from '../utils/ansi.js';

@customElement('server-console')
export class ServerConsole extends LitElement {
  static styles = [sharedStyles, css`
    :host { display: block; }

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
  `];

  @property() serverId = '';
  @state() private lines: string[] = [];
  @state() private commandHistory: string[] = [];
  @state() private historyIndex = -1;

  private ws: WebSocket | null = null;

  connectedCallback() {
    super.connectedCallback();
    this.connect();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.ws?.close();
  }

  private connect() {
    if (this.ws) this.ws.close();

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${location.host}/ws/servers/${this.serverId}/console`);

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'history') {
          this.lines = [...this.lines, ...data.lines];
        } else if (data.type === 'log' || data.type === 'command') {
          this.lines = [...this.lines, data.line];
        }
        this.scrollToBottom();
      } catch { /* ignore */ }
    };

    this.ws.onclose = () => {
      setTimeout(() => {
        if (this.isConnected) this.connect();
      }, 3000);
    };
  }

  private scrollToBottom() {
    requestAnimationFrame(() => {
      const el = this.shadowRoot?.querySelector('.console-output');
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  private handleKeydown(e: KeyboardEvent) {
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
    if (e.key !== 'Enter') return;

    const input = e.target as HTMLInputElement;
    const cmd = input.value.trim();
    if (!cmd) return;

    this.ws?.send(JSON.stringify({ type: 'command', command: cmd }));
    this.commandHistory.push(cmd);
    this.historyIndex = -1;
    input.value = '';
  }

  private renderLine(line: string) {
    if (line.startsWith('>')) return line;
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

  render() {
    return html`
      <div class="console-container">
        <div class="console-output">
          ${this.lines.map(line => html`
            <div class="console-line ${line.startsWith('>') ? 'console-command' : ''}">${this.renderLine(line)}</div>
          `)}
        </div>
        <div class="console-input">
          <span>&gt;</span>
          <input type="text" placeholder="Enter command..." @keydown=${this.handleKeydown}>
        </div>
      </div>
    `;
  }
}
