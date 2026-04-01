import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared.js';
import { GET, POST, DELETE } from '../services/api.js';
import { showToast } from './toast.js';
import { confirm } from './confirm-dialog.js';
import type { Backup } from '@gamepanel/shared';

@customElement('backup-manager')
export class BackupManagerComponent extends LitElement {
  static styles = [sharedStyles, css`
    :host { display: block; }

    .create-form {
      display: flex;
      gap: 8px;
      align-items: flex-end;
      margin-bottom: 20px;
    }
    .create-form > div { flex: 1; }

    .backup-list {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
    }

    .backup-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-light);
      font-size: 13px;
    }
    .backup-row:last-child { border-bottom: none; }

    .backup-name { font-weight: 500; flex: 1; }
    .backup-meta {
      color: var(--text-secondary);
      font-size: 12px;
      display: flex;
      gap: 16px;
    }

    .backup-actions { display: flex; gap: 6px; }
  `];

  @property() serverId = '';
  @property() serverStatus = '';
  @state() private backups: Backup[] = [];
  @state() private backupName = '';
  @state() private creating = false;

  connectedCallback() {
    super.connectedCallback();
    this.loadBackups();
  }

  private async loadBackups() {
    try {
      const res = await GET<{ data: Backup[] }>(`/api/servers/${this.serverId}/backups`);
      this.backups = res.data;
    } catch { /* ignore */ }
  }

  private async createBackup() {
    this.creating = true;
    try {
      await POST(`/api/servers/${this.serverId}/backups`, { name: this.backupName || undefined });
      this.backupName = '';
      showToast('Backup created', 'success');
      this.loadBackups();
    } catch (err: any) {
      showToast(err.body?.message || 'Backup failed', 'error');
    } finally {
      this.creating = false;
    }
  }

  private async restoreBackup(backup: Backup) {
    if (this.serverStatus === 'running') {
      showToast('Stop the server before restoring', 'warning');
      return;
    }
    const ok = await confirm('Restore backup?', `This will overwrite server data with "${backup.name}". This cannot be undone.`, { confirmText: 'Restore', danger: true });
    if (!ok) return;

    try {
      await POST(`/api/backups/${backup.id}/restore`);
      showToast('Backup restored', 'success');
    } catch (err: any) {
      showToast(err.body?.message || 'Restore failed', 'error');
    }
  }

  private async deleteBackup(backup: Backup) {
    const ok = await confirm('Delete backup?', `"${backup.name}" will be permanently deleted.`, { confirmText: 'Delete', danger: true });
    if (!ok) return;

    try {
      await DELETE(`/api/backups/${backup.id}`);
      this.backups = this.backups.filter(b => b.id !== backup.id);
      showToast('Backup deleted', 'success');
    } catch { /* ignore */ }
  }

  private formatSize(bytes: number | null): string {
    if (!bytes) return '-';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  private formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
    } catch { return iso; }
  }

  render() {
    return html`
      <div class="create-form">
        <div>
          <label>Backup Name (optional)</label>
          <input type="text" placeholder="e.g. Before update" .value=${this.backupName}
            @input=${(e: Event) => this.backupName = (e.target as HTMLInputElement).value}
            @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && this.createBackup()}>
        </div>
        <button class="btn btn-primary" style="height:42px" ?disabled=${this.creating} @click=${() => this.createBackup()}>
          ${this.creating ? 'Creating...' : 'Create Backup'}
        </button>
      </div>

      ${this.backups.length === 0
        ? html`<p style="color:var(--text-muted);font-size:13px">No backups yet.</p>`
        : html`
          <div class="backup-list">
            ${this.backups.map(b => html`
              <div class="backup-row">
                <span class="backup-name">${b.name}</span>
                <div class="backup-meta">
                  <span>${this.formatSize(b.sizeBytes)}</span>
                  <span>${this.formatDate(b.createdAt)}</span>
                </div>
                <div class="backup-actions">
                  <a class="btn btn-sm" href="/api/backups/${b.id}/download" @click=${(e: Event) => e.stopPropagation()}>Download</a>
                  <button class="btn btn-sm" @click=${() => this.restoreBackup(b)}>Restore</button>
                  <button class="btn btn-sm btn-danger" @click=${() => this.deleteBackup(b)}>Delete</button>
                </div>
              </div>
            `)}
          </div>
        `}
    `;
  }
}
