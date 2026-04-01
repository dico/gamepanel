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

    .subtitle { color: var(--text-primary); margin-bottom: 24px; font-size: 14px; }

    .steps {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 32px;
    }
    .step {
      display: flex; align-items: center; gap: 8px;
      font-size: 13px; color: var(--text-secondary);
    }
    .step.active { color: var(--accent); font-weight: 600; }
    .step.done { color: var(--success); }
    .step-num {
      width: 24px; height: 24px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700;
      background: var(--bg-hover); color: var(--text-secondary);
    }
    .step.active .step-num { background: var(--accent); color: white; }
    .step.done .step-num { background: var(--success); color: white; }
    .step-divider { width: 32px; height: 1px; background: var(--border); }

    .section {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      margin-bottom: 24px;
    }

    .section-title { font-size: 16px; font-weight: 600; margin-bottom: 8px; }
    .section-desc { color: var(--text-secondary); font-size: 13px; margin-bottom: 16px; line-height: 1.5; }

    .method-cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }

    .method-card {
      padding: 20px;
      background: var(--bg-primary);
      border: 2px solid var(--border);
      border-radius: var(--radius);
      cursor: pointer;
      transition: all 0.15s;
    }
    .method-card:hover { border-color: var(--accent); }
    .method-card.selected { border-color: var(--accent); background: var(--info-bg); }
    .method-card h3 { font-size: 14px; margin-bottom: 6px; }
    .method-card p { font-size: 13px; color: var(--text-secondary); line-height: 1.4; }

    .hint {
      font-size: 12px; color: var(--text-secondary); margin-top: 6px; line-height: 1.4;
    }

    .folder-list {
      display: flex; flex-direction: column; gap: 4px; margin-top: 16px;
    }

    .folder-item {
      display: flex; align-items: center; gap: 12px;
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
    .folder-detected {
      font-size: 11px; padding: 2px 8px; border-radius: 8px;
      background: var(--success-bg); color: var(--success);
    }

    .dropzone {
      border: 2px dashed var(--border);
      border-radius: var(--radius);
      padding: 40px;
      text-align: center;
      color: var(--text-secondary);
      font-size: 14px;
      transition: all 0.15s;
      cursor: pointer;
    }
    .dropzone:hover, .dropzone.dragover {
      border-color: var(--accent);
      color: var(--accent);
      background: var(--info-bg);
    }
    .dropzone input { display: none; }
    .dropzone .size-hint { font-size: 12px; color: var(--text-muted); margin-top: 8px; }

    .upload-progress {
      padding: 16px;
      text-align: center;
      color: var(--accent);
      font-size: 14px;
    }

    .confirm-grid {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 8px;
      font-size: 14px;
    }
    .confirm-grid .label { color: var(--text-secondary); }
    .confirm-grid .value { font-family: var(--font-mono); font-size: 13px; }

    .actions { display: flex; gap: 8px; justify-content: flex-end; }
    input, select { margin-bottom: 12px; }
  `];

  @state() private step = 1;
  @state() private method: 'folder' | 'upload' | null = null;
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
  @state() private uploading = false;
  @state() private uploadProgress = 0;
  @state() private uploadedPath = '';
  @state() private dragover = false;

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
    if (folder.detectedGame) this.selectedTemplate = folder.detectedGame;
    this.step = 2;
  }

  private async handleZipUpload(file: File) {
    if (!file.name.endsWith('.zip') && !file.name.endsWith('.tar.gz') && !file.name.endsWith('.tgz')) {
      showToast('Please upload a .zip or .tar.gz file', 'error');
      return;
    }

    this.uploading = true;
    this.uploadProgress = 0;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const result = await new Promise<{ path: string; name: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            this.uploadProgress = Math.round((e.loaded / e.total) * 100);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const json = JSON.parse(xhr.responseText);
              resolve(json.data);
            } catch { reject(new Error('Invalid response')); }
          } else {
            try {
              const json = JSON.parse(xhr.responseText);
              reject(new Error(json.message || `Upload failed (${xhr.status})`));
            } catch { reject(new Error(`Upload failed (${xhr.status})`)); }
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
        xhr.addEventListener('timeout', () => reject(new Error('Upload timed out')));

        xhr.open('POST', '/api/import/upload');
        xhr.withCredentials = true;
        xhr.timeout = 600000; // 10 min
        xhr.send(formData);
      });

      this.uploadedPath = result.path;
      this.serverName = file.name.replace(/\.(zip|tar\.gz|tgz)$/i, '').replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      showToast('File uploaded and extracted', 'success');
      this.step = 2;
    } catch (err: any) {
      showToast(err.message || 'Upload failed', 'error', 10000);
    } finally {
      this.uploading = false;
    }
  }

  private handleDrop(e: DragEvent) {
    e.preventDefault();
    this.dragover = false;
    if (e.dataTransfer?.files[0]) this.handleZipUpload(e.dataTransfer.files[0]);
  }

  private handleFileInput(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) this.handleZipUpload(file);
  }

  private async doImport() {
    if (!this.serverName || !this.selectedTemplate) return;
    const sourcePath = this.method === 'upload' ? this.uploadedPath : this.selectedFolder?.path;
    if (!sourcePath) return;

    this.importing = true;
    try {
      const res = await POST<{ data: { id: string } }>('/api/import', {
        sourcePath,
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
      <p class="subtitle">Import an existing game server from a backup or file transfer.</p>

      <div class="steps">
        ${[['1', 'Choose source'], ['2', 'Configure'], ['3', 'Import']].map(([num, label], i) => html`
          ${i > 0 ? html`<div class="step-divider"></div>` : ''}
          <div class="step ${this.step > i + 1 ? 'done' : this.step === i + 1 ? 'active' : ''}">
            <span class="step-num">${num}</span> ${label}
          </div>
        `)}
      </div>

      ${this.step === 1 ? this.renderStep1() : ''}
      ${this.step === 2 ? this.renderStep2() : ''}
      ${this.step === 3 ? this.renderStep3() : ''}
    `;
  }

  private renderStep1() {
    return html`
      <div class="section">
        <div class="section-title">How would you like to import?</div>
        <div class="section-desc">Choose how to get your server files into GamePanel.</div>

        <div class="method-cards">
          <div class="method-card ${this.method === 'upload' ? 'selected' : ''}"
            @click=${() => this.method = 'upload'}>
            <h3>Upload archive</h3>
            <p>Upload a .zip or .tar.gz file containing your server data. Best for files under 1 GB.</p>
          </div>
          <div class="method-card ${this.method === 'folder' ? 'selected' : ''}"
            @click=${() => this.method = 'folder'}>
            <h3>Server folder</h3>
            <p>Copy files to the server first via SCP, WinSCP, or samba, then select the folder here. Best for large files.</p>
          </div>
        </div>
      </div>

      ${this.method === 'upload' ? html`
        <div class="section">
          ${this.uploading ? html`
            <div class="upload-progress">
              <div>${this.uploadProgress < 100 ? `Uploading... ${this.uploadProgress}%` : 'Extracting on server...'}</div>
              <div style="margin-top:12px;height:6px;background:var(--bg-hover);border-radius:3px;overflow:hidden">
                <div style="height:100%;background:var(--accent);border-radius:3px;transition:width 0.3s;width:${this.uploadProgress}%"></div>
              </div>
              <div style="margin-top:8px;font-size:12px;color:var(--text-muted)">Large files may take a few minutes</div>
            </div>
          ` : html`
            <div class="dropzone ${this.dragover ? 'dragover' : ''}"
              @drop=${this.handleDrop}
              @dragover=${(e: DragEvent) => { e.preventDefault(); this.dragover = true; }}
              @dragleave=${() => this.dragover = false}
              @click=${() => (this.shadowRoot?.querySelector('.zip-input') as HTMLInputElement)?.click()}>
              Drop a .zip or .tar.gz file here, or click to browse
              <div class="size-hint">Recommended for files under 1 GB</div>
            </div>
            <input class="zip-input" type="file" accept=".zip,.tar.gz,.tgz" style="display:none" @change=${this.handleFileInput}>
          `}
        </div>
      ` : ''}

      ${this.method === 'folder' ? html`
        <div class="section">
          ${this.folders.length > 0 ? html`
            <div class="section-desc">
              Select a folder from <strong>${this.importDir}</strong>:
            </div>
            <div class="folder-list">
              ${this.folders.map(f => html`
                <div class="folder-item" @click=${() => this.selectFolder(f)}>
                  <span class="folder-name">${f.name}</span>
                  <div class="folder-meta">
                    <span>${f.fileCount} files</span>
                    <span>${this.formatSize(f.size)}</span>
                  </div>
                  ${f.detectedGame ? html`<span class="folder-detected">${f.detectedGame}</span>` : ''}
                </div>
              `)}
            </div>
            <div class="hint" style="margin-top:12px">
              Don't see your folder? Copy files to <code>${this.importDir}</code> and click Refresh.
            </div>
            <button class="btn btn-sm" style="margin-top:8px" @click=${() => this.loadData()}>Refresh</button>
          ` : html`
            <div class="section-title">No folders found</div>
            <div class="section-desc">
              Copy your server files to the import directory on this machine, then click Refresh:
            </div>
            <code style="display:block;padding:12px;background:var(--bg-primary);border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;color:var(--text-primary);user-select:all;margin-bottom:16px">
              ${this.importDir || '/opt/gamepanel/import'}
            </code>
            <div class="section-desc">
              Each game server should be in its own subfolder. Use SCP, WinSCP, samba, or any file transfer method.
            </div>
            <button class="btn" @click=${() => this.loadData()}>Refresh</button>
          `}
        </div>
      ` : ''}
    `;
  }

  private renderStep2() {
    return html`
      <div class="section">
        <div class="section-title">Configure server</div>
        <div class="section-desc">Set a name and select the matching game template for your imported files.</div>

        <label>Server Name</label>
        <input type="text" .value=${this.serverName}
          @input=${(e: Event) => this.serverName = (e.target as HTMLInputElement).value}>

        <label>Game Template</label>
        <select .value=${this.selectedTemplate}
          @change=${(e: Event) => this.selectedTemplate = (e.target as HTMLSelectElement).value}>
          <option value="">Select game...</option>
          ${this.templates.map(t => html`<option value=${t.slug} ?selected=${this.selectedTemplate === t.slug}>${t.name}</option>`)}
        </select>
        <div class="hint">Must match the game type of the files you are importing.</div>

        <label style="margin-top:12px">Node</label>
        <select .value=${this.selectedNode}
          @change=${(e: Event) => this.selectedNode = (e.target as HTMLSelectElement).value}>
          ${this.nodes.map(n => html`<option value=${n.id}>${n.name}</option>`)}
        </select>

        <div class="actions" style="margin-top:16px">
          <button class="btn" @click=${() => { this.step = 1; }}>Back</button>
          <button class="btn btn-primary" ?disabled=${!this.serverName || !this.selectedTemplate}
            @click=${() => this.step = 3}>Continue</button>
        </div>
      </div>
    `;
  }

  private renderStep3() {
    const sourcePath = this.method === 'upload' ? this.uploadedPath : this.selectedFolder?.path;
    return html`
      <div class="section">
        <div class="section-title">Confirm import</div>
        <div class="section-desc">Review the details below, then click Import to create the server.</div>

        <div class="confirm-grid">
          <span class="label">Source:</span>
          <span class="value">${sourcePath}</span>
          <span class="label">Server name:</span>
          <span>${this.serverName}</span>
          <span class="label">Game:</span>
          <span>${this.templates.find(t => t.slug === this.selectedTemplate)?.name ?? this.selectedTemplate}</span>
          <span class="label">Node:</span>
          <span>${this.nodes.find(n => n.id === this.selectedNode)?.name ?? this.selectedNode}</span>
        </div>

        <div class="hint" style="margin-top:16px">
          Files will be moved into the server's data folder. Ports will be assigned automatically.
        </div>

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
