import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared.js';
import { GET, POST } from '../services/api.js';
import { showToast } from '../components/toast.js';
import { navigate } from '../router.js';
import type { GameTemplate, GameNode } from '@gamepanel/shared';

interface ImportEntry {
  name: string;
  path: string;
  fileCount: number;
  size: number;
  detectedGame: string | null;
}

@customElement('import-wizard')
export class ImportWizard extends LitElement {
  static styles = [sharedStyles, css`
    :host { display: block; }

    .steps {
      display: flex;
      gap: 8px;
      margin-bottom: 32px;
    }
    .step {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--text-muted);
    }
    .step.active { color: var(--accent); font-weight: 600; }
    .step.done { color: var(--success); }
    .step-num {
      width: 24px; height: 24px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700;
      background: var(--bg-hover); color: var(--text-muted);
    }
    .step.active .step-num { background: var(--accent); color: white; }
    .step.done .step-num { background: var(--success); color: white; }
    .step-divider { flex: 0; width: 32px; height: 1px; background: var(--border); }

    .section {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      margin-bottom: 24px;
    }

    .hint {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 6px;
      line-height: 1.4;
    }

    .folder-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: 16px;
    }

    .folder-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      cursor: pointer;
      transition: all 0.15s;
    }
    .folder-item:hover { border-color: var(--accent); }
    .folder-item.selected { border-color: var(--accent); background: var(--info-bg); }
    .folder-name { font-weight: 500; flex: 1; }
    .folder-meta { font-size: 12px; color: var(--text-secondary); display: flex; gap: 12px; }
    .folder-detected { font-size: 11px; padding: 2px 8px; border-radius: 8px; background: var(--success-bg); color: var(--success); }

    .empty-import {
      padding: 32px;
      text-align: center;
      color: var(--text-muted);
    }
    .empty-import code {
      display: block;
      margin-top: 12px;
      padding: 12px;
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      font-size: 13px;
      user-select: all;
    }

    .actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    input, select { margin-bottom: 12px; }
  `];

  @state() private step = 1;
  @state() private folders: ImportEntry[] = [];
  @state() private importDir = '';
  @state() private importDirExists = false;
  @state() private templates: GameTemplate[] = [];
  @state() private nodes: GameNode[] = [];
  @state() private selectedFolder: ImportEntry | null = null;
  @state() private serverName = '';
  @state() private selectedTemplate = '';
  @state() private selectedNode = 'local';
  @state() private importing = false;

  connectedCallback() {
    super.connectedCallback();
    this.loadData();
  }

  private async loadData() {
    const [importRes, templatesRes, nodesRes] = await Promise.all([
      GET<{ data: ImportEntry[]; importDir: string; exists: boolean }>('/api/import/list'),
      GET<{ data: GameTemplate[] }>('/api/templates'),
      GET<{ data: GameNode[] }>('/api/nodes'),
    ]);
    this.folders = importRes.data;
    this.importDir = importRes.importDir;
    this.importDirExists = importRes.exists;
    this.templates = templatesRes.data;
    this.nodes = nodesRes.data;
  }

  private selectFolder(folder: ImportEntry) {
    this.selectedFolder = folder;
    this.serverName = folder.name.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    if (folder.detectedGame) {
      this.selectedTemplate = folder.detectedGame;
    }
    this.step = 2;
  }

  private async doImport() {
    if (!this.selectedFolder || !this.serverName || !this.selectedTemplate) return;

    this.importing = true;
    try {
      const res = await POST<{ data: { id: string } }>('/api/import', {
        sourcePath: this.selectedFolder.path,
        name: this.serverName,
        templateSlug: this.selectedTemplate,
        nodeId: this.selectedNode,
        move: true,
      });
      showToast('Server imported successfully!', 'success');
      navigate(`/servers/${res.data.id}`);
    } catch (err: any) {
      showToast(err.body?.message || 'Import failed', 'error');
    } finally {
      this.importing = false;
    }
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  render() {
    return html`
      <h1 style="margin-bottom:8px">Import Server</h1>
      <p style="color:var(--text-secondary);margin-bottom:24px;font-size:14px">
        Import an existing game server from files on this machine.
      </p>

      <div class="steps">
        <div class="step ${this.step >= 1 ? (this.step > 1 ? 'done' : 'active') : ''}">
          <span class="step-num">1</span> Select folder
        </div>
        <div class="step-divider"></div>
        <div class="step ${this.step >= 2 ? (this.step > 2 ? 'done' : 'active') : ''}">
          <span class="step-num">2</span> Configure
        </div>
        <div class="step-divider"></div>
        <div class="step ${this.step >= 3 ? 'active' : ''}">
          <span class="step-num">3</span> Import
        </div>
      </div>

      ${this.step === 1 ? this.renderStep1() : ''}
      ${this.step === 2 ? this.renderStep2() : ''}
      ${this.step === 3 ? this.renderStep3() : ''}
    `;
  }

  private renderStep1() {
    if (!this.importDirExists || this.folders.length === 0) {
      return html`
        <div class="section">
          <div class="empty-import">
            <p>Copy your server files to the import directory on this machine:</p>
            <code>${this.importDir || '/opt/gamepanel/import'}</code>
            <p style="margin-top:16px">
              Each game server should be in its own subfolder. Use SCP, WinSCP, samba, or any file transfer method.
            </p>
            <p style="margin-top:12px">
              <button class="btn" @click=${() => this.loadData()}>Refresh</button>
            </p>
          </div>
        </div>
      `;
    }

    return html`
      <div class="section">
        <p style="color:var(--text-secondary);font-size:13px;margin-bottom:16px">
          Select a folder from <strong>${this.importDir}</strong> to import:
        </p>
        <div class="folder-list">
          ${this.folders.map(f => html`
            <div class="folder-item ${this.selectedFolder?.path === f.path ? 'selected' : ''}"
              @click=${() => this.selectFolder(f)}>
              <span class="folder-name">${f.name}</span>
              <div class="folder-meta">
                <span>${f.fileCount} files</span>
                <span>${this.formatSize(f.size)}</span>
              </div>
              ${f.detectedGame ? html`<span class="folder-detected">${f.detectedGame}</span>` : ''}
            </div>
          `)}
        </div>
      </div>
    `;
  }

  private renderStep2() {
    return html`
      <div class="section">
        <p style="color:var(--text-secondary);font-size:13px;margin-bottom:16px">
          Importing from: <strong>${this.selectedFolder?.name}</strong>
        </p>

        <label>Server Name</label>
        <input type="text" .value=${this.serverName}
          @input=${(e: Event) => this.serverName = (e.target as HTMLInputElement).value}>

        <label>Game Template</label>
        <select .value=${this.selectedTemplate}
          @change=${(e: Event) => this.selectedTemplate = (e.target as HTMLSelectElement).value}>
          <option value="">Select game...</option>
          ${this.templates.map(t => html`<option value=${t.slug} ?selected=${this.selectedTemplate === t.slug}>${t.name}</option>`)}
        </select>
        <div class="hint">Make sure this matches the game type of the files you're importing.</div>

        <label style="margin-top:12px">Node</label>
        <select .value=${this.selectedNode}
          @change=${(e: Event) => this.selectedNode = (e.target as HTMLSelectElement).value}>
          ${this.nodes.map(n => html`<option value=${n.id}>${n.name}</option>`)}
        </select>

        <div class="actions" style="margin-top:16px">
          <button class="btn" @click=${() => this.step = 1}>Back</button>
          <button class="btn btn-primary"
            ?disabled=${!this.serverName || !this.selectedTemplate}
            @click=${() => this.step = 3}>
            Continue
          </button>
        </div>
      </div>
    `;
  }

  private renderStep3() {
    return html`
      <div class="section">
        <h3 style="margin-bottom:16px">Confirm Import</h3>

        <div style="display:grid;grid-template-columns:120px 1fr;gap:8px;font-size:14px">
          <span style="color:var(--text-secondary)">Source:</span>
          <span style="font-family:var(--font-mono);font-size:13px">${this.selectedFolder?.path}</span>
          <span style="color:var(--text-secondary)">Server name:</span>
          <span>${this.serverName}</span>
          <span style="color:var(--text-secondary)">Game:</span>
          <span>${this.templates.find(t => t.slug === this.selectedTemplate)?.name ?? this.selectedTemplate}</span>
          <span style="color:var(--text-secondary)">Node:</span>
          <span>${this.nodes.find(n => n.id === this.selectedNode)?.name ?? this.selectedNode}</span>
        </div>

        <p style="color:var(--text-muted);font-size:12px;margin-top:16px">
          Files will be moved from the import directory into the server's data folder. The original folder will be removed.
        </p>

        <div class="actions" style="margin-top:20px">
          <button class="btn" @click=${() => this.step = 2}>Back</button>
          <button class="btn btn-primary" ?disabled=${this.importing} @click=${() => this.doImport()}>
            ${this.importing ? 'Importing...' : 'Import Server'}
          </button>
        </div>
      </div>
    `;
  }
}
