import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared.js';
import { GET, POST, PATCH } from '../services/api.js';
import { showToast } from '../components/toast.js';
import { confirm } from '../components/confirm-dialog.js';

@customElement('settings-page')
export class SettingsPage extends LitElement {
  static styles = [sharedStyles, css`
    :host { display: block; }

    .section {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      margin-bottom: 24px;
      overflow: hidden;
    }

    .section-header {
      padding: 12px 16px;
      font-weight: 600;
      background: var(--bg-tertiary);
      border-bottom: 1px solid var(--border);
    }

    .section-body {
      padding: 20px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .section-body.single { grid-template-columns: 1fr; }

    .field { min-width: 0; }

    .version-info {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    .version-current {
      font-family: var(--font-mono);
      font-size: 16px;
      font-weight: 600;
    }

    .version-status {
      font-size: 13px;
      padding: 4px 12px;
      border-radius: 12px;
    }

    .update-command {
      font-family: var(--font-mono);
      font-size: 12px;
      background: var(--bg-primary);
      padding: 8px 12px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-light);
      color: var(--text-secondary);
      margin-top: 12px;
      word-break: break-all;
    }

    .form-actions {
      grid-column: 1 / -1;
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
  `];

  @state() private version = { current: '', latest: null as string | null, updateAvailable: false, updateCommand: '' };
  @state() private settings: Record<string, string> = {};
  @state() private dirty = false;
  @state() private updating = false;

  connectedCallback() {
    super.connectedCallback();
    this.loadData();
  }

  private async loadData() {
    const [versionRes, settingsRes] = await Promise.all([
      GET<{ data: typeof this.version }>('/api/system/version'),
      GET<{ data: Record<string, string> }>('/api/settings'),
    ]);
    this.version = versionRes.data;
    this.settings = settingsRes.data;
  }

  private setSetting(key: string, value: string) {
    this.settings = { ...this.settings, [key]: value };
    this.dirty = true;
  }

  private async saveSettings() {
    try {
      await PATCH('/api/settings', this.settings);
      this.dirty = false;
      showToast('Settings saved', 'success');
    } catch (err: any) {
      showToast(err.body?.message || 'Failed to save', 'error');
    }
  }

  private async runUpdate() {
    const ok = await confirm(
      'Update GamePanel?',
      'This will pull the latest Docker image and restart the panel. You will be briefly disconnected.',
      { confirmText: 'Update now' },
    );
    if (!ok) return;

    this.updating = true;
    try {
      const res = await POST<{ data: { updated: boolean; message: string } }>('/api/system/update');
      if (res.data.updated) {
        showToast(res.data.message, 'success', 10000);
        // Poll for reconnection
        setTimeout(() => this.pollForReconnect(), 5000);
      } else {
        showToast(res.data.message, 'info');
      }
    } catch (err: any) {
      showToast(err.body?.message || 'Update failed', 'error');
    } finally {
      this.updating = false;
    }
  }

  private pollForReconnect() {
    const check = async () => {
      try {
        await GET('/api/health');
        showToast('GamePanel is back online!', 'success');
        this.loadData();
      } catch {
        setTimeout(check, 3000);
      }
    };
    check();
  }

  render() {
    return html`
      <h1 style="margin-bottom:24px">Settings</h1>

      <div class="section">
        <div class="section-header">Version & Updates</div>
        <div class="section-body single">
          <div class="version-info">
            <span class="version-current">v${this.version.current}</span>
            ${this.version.updateAvailable
              ? html`<span class="version-status status-warning">Update available: v${this.version.latest}</span>`
              : html`<span class="version-status status-success">Up to date</span>`
            }
            <button class="btn btn-primary" ?disabled=${this.updating} @click=${() => this.runUpdate()}>
              ${this.updating ? 'Updating...' : this.version.updateAvailable ? 'Update now' : 'Check & update'}
            </button>
          </div>
          <div class="update-command">
            Manual: ${this.version.updateCommand || 'cd /opt/gamepanel && docker compose pull && docker compose up -d'}
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-header">Network</div>
        <div class="section-body">
          <div class="field">
            <label>Local hostname / IP</label>
            <input type="text"
              placeholder="Auto-detect"
              .value=${this.settings.localHost || ''}
              @input=${(e: Event) => this.setSetting('localHost', (e.target as HTMLInputElement).value)}>
          </div>
          <div class="field">
            <label>External hostname / domain</label>
            <input type="text"
              placeholder="e.g. mc.example.com (optional)"
              .value=${this.settings.externalHost || ''}
              @input=${(e: Event) => this.setSetting('externalHost', (e.target as HTMLInputElement).value)}>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-header">Port Management</div>
        <div class="section-body">
          <div class="field">
            <div class="toggle">
              <input type="checkbox"
                .checked=${this.settings.portRangeEnabled === 'true'}
                @change=${(e: Event) => this.setSetting('portRangeEnabled', (e.target as HTMLInputElement).checked ? 'true' : 'false')}>
              <label style="margin-bottom:0">Restrict to port range</label>
            </div>
          </div>
          ${this.settings.portRangeEnabled === 'true' ? html`
            <div class="field">
              <label>Allowed port range</label>
              <div style="display:flex;gap:8px;align-items:center">
                <input type="number" placeholder="25565" style="flex:1"
                  .value=${this.settings.portRangeStart || ''}
                  @input=${(e: Event) => this.setSetting('portRangeStart', (e.target as HTMLInputElement).value)}>
                <span style="color:var(--text-muted)">—</span>
                <input type="number" placeholder="25600" style="flex:1"
                  .value=${this.settings.portRangeEnd || ''}
                  @input=${(e: Event) => this.setSetting('portRangeEnd', (e.target as HTMLInputElement).value)}>
              </div>
            </div>
          ` : ''}
          <div class="form-actions">
            <button class="btn btn-primary" ?disabled=${!this.dirty} @click=${() => this.saveSettings()}>
              Save Settings
            </button>
          </div>
        </div>
      </div>
    `;
  }
}
