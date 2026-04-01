import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared.js';
import { GET, DELETE } from '../services/api.js';
import { api } from '../services/api.js';
import { confirm } from './confirm-dialog.js';
import { showToast } from './toast.js';

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size: number | null;
  modified: string;
}

@customElement('file-manager')
export class FileManager extends LitElement {
  static styles = [sharedStyles, css`
    :host { display: block; }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
      padding: 8px 12px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }

    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 4px;
      flex: 1;
      font-family: var(--font-mono);
      font-size: 13px;
      overflow-x: auto;
    }

    .breadcrumb button {
      background: none;
      border: none;
      color: var(--accent);
      font-family: var(--font-mono);
      font-size: 13px;
      padding: 2px 4px;
      border-radius: 3px;
      cursor: pointer;
    }
    .breadcrumb button:hover { background: var(--bg-hover); }
    .breadcrumb span { color: var(--text-muted); }


    .file-list {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
    }

    .file-row {
      display: grid;
      grid-template-columns: 1fr 100px 160px 80px;
      align-items: center;
      padding: 8px 16px;
      border-bottom: 1px solid var(--border-light);
      font-size: 13px;
      cursor: pointer;
      transition: background 0.1s;
    }
    .file-row:hover { background: var(--bg-hover); }
    .file-row:last-child { border-bottom: none; }

    .file-row.header {
      background: var(--bg-secondary);
      font-weight: 600;
      color: var(--text-secondary);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      cursor: default;
    }
    .file-row.header:hover { background: var(--bg-secondary); }

    .file-name {
      display: flex;
      align-items: center;
      gap: 8px;
      overflow: hidden;
    }
    .file-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .file-icon { font-size: 16px; flex-shrink: 0; }
    .file-size { color: var(--text-secondary); text-align: right; }
    .file-modified { color: var(--text-secondary); }
    .file-actions { text-align: right; }

    .empty {
      padding: 48px;
      text-align: center;
      color: var(--text-muted);
    }

    /* Editor */
    .editor-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .editor-header h3 { font-size: 14px; }

    .editor-path {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--text-secondary);
    }

    textarea {
      width: 100%;
      min-height: 400px;
      background: #0d1117;
      color: #c9d1d9;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
      font-family: var(--font-mono);
      font-size: 13px;
      line-height: 1.5;
      resize: vertical;
      outline: none;
      tab-size: 4;
    }
    textarea:focus { border-color: var(--accent); }

    .editor-actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
      justify-content: flex-end;
    }

    .btn-save {
      background: var(--accent);
      border-color: var(--accent);
      color: white;
      padding: 6px 20px;
    }
    .btn-save:hover { background: var(--accent-hover); }

    .status-msg {
      font-size: 12px;
      padding: 6px 12px;
      border-radius: var(--radius-sm);
      margin-top: 8px;
    }
    .status-msg.success { background: var(--success-bg); color: var(--success); }
    .status-msg.error { background: var(--danger-bg); color: var(--danger); }

    .dropzone {
      border: 2px dashed var(--border);
      border-radius: var(--radius);
      padding: 32px;
      text-align: center;
      color: var(--text-muted);
      font-size: 13px;
      margin-bottom: 16px;
      transition: all 0.15s;
      cursor: pointer;
    }
    .dropzone:hover, .dropzone.dragover {
      border-color: var(--accent);
      color: var(--accent);
      background: var(--info-bg);
    }
    .dropzone input { display: none; }

    .upload-progress {
      font-size: 12px;
      color: var(--accent);
      padding: 8px 0;
    }
  `];

  @property() serverId = '';
  @state() private currentPath = '/';
  @state() private entries: FileEntry[] = [];
  @state() private loading = true;
  @state() private editingFile: { path: string; name: string; content: string } | null = null;
  @state() private saveStatus: { type: 'success' | 'error'; message: string } | null = null;
  @state() private uploading = false;
  @state() private dragover = false;

  private popHandler = () => {
    // Browser back while editing → go back to file list instead of leaving page
    if (this.editingFile) {
      this.editingFile = null;
    }
  };

  connectedCallback() {
    super.connectedCallback();
    this.loadDirectory();
    window.addEventListener('popstate', this.popHandler);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('popstate', this.popHandler);
  }

  private async loadDirectory(path?: string) {
    if (path !== undefined) this.currentPath = path;
    this.loading = true;
    this.editingFile = null;
    this.saveStatus = null;
    try {
      const res = await GET<{ data: FileEntry[] }>(`/api/servers/${this.serverId}/files?path=${encodeURIComponent(this.currentPath)}`);
      this.entries = res.data;
    } catch {
      this.entries = [];
    }
    this.loading = false;
  }

  private handleClick(entry: FileEntry) {
    if (entry.type === 'directory') {
      const newPath = this.currentPath === '/'
        ? `/${entry.name}`
        : `${this.currentPath}/${entry.name}`;
      this.loadDirectory(newPath);
    } else {
      this.openFile(entry);
    }
  }

  private async openFile(entry: FileEntry) {
    const filePath = this.currentPath === '/'
      ? `/${entry.name}`
      : `${this.currentPath}/${entry.name}`;

    // Only open text-editable files
    const textExtensions = ['.properties', '.json', '.yml', '.yaml', '.txt', '.cfg', '.conf', '.ini', '.log', '.xml', '.toml', '.env', '.sh', '.bat', '.cmd'];
    const ext = '.' + entry.name.split('.').pop()?.toLowerCase();
    if (!textExtensions.includes(ext) && entry.size && entry.size > 1024 * 1024) {
      return; // Skip large/binary files
    }

    try {
      const res = await GET<{ data: { content: string; name: string; path: string } }>(
        `/api/servers/${this.serverId}/files/read?path=${encodeURIComponent(filePath)}`
      );
      this.editingFile = { path: filePath, name: res.data.name, content: res.data.content };
      this.saveStatus = null;
      history.pushState({ fileManager: true }, '', location.href);
    } catch (err: any) {
      this.saveStatus = { type: 'error', message: err.body?.message || 'Failed to read file' };
    }
  }

  private async saveFile() {
    if (!this.editingFile) return;
    const textarea = this.shadowRoot?.querySelector('textarea');
    if (!textarea) return;

    try {
      await api(`/api/servers/${this.serverId}/files/write`, {
        method: 'PUT',
        body: JSON.stringify({ path: this.editingFile.path, content: textarea.value }),
      });
      this.editingFile.content = textarea.value;
      this.saveStatus = { type: 'success', message: 'File saved' };
      showToast('File saved', 'success', 2000);
      setTimeout(() => { this.saveStatus = null; }, 3000);
    } catch (err: any) {
      this.saveStatus = { type: 'error', message: err.body?.message || 'Failed to save' };
    }
  }

  private async deleteEntry(e: Event, entry: FileEntry) {
    e.stopPropagation();
    const fullPath = this.currentPath === '/'
      ? `/${entry.name}`
      : `${this.currentPath}/${entry.name}`;

    const ok = await confirm(`Delete ${entry.type === 'directory' ? 'folder' : 'file'}?`, `"${entry.name}" will be permanently deleted.`, { confirmText: 'Delete', danger: true });
    if (!ok) return;

    try {
      await DELETE(`/api/servers/${this.serverId}/files?path=${encodeURIComponent(fullPath)}`);
      this.loadDirectory();
    } catch { /* ignore */ }
  }

  private navigateUp() {
    const parts = this.currentPath.split('/').filter(Boolean);
    parts.pop();
    this.loadDirectory('/' + parts.join('/'));
  }

  private getBreadcrumbs(): { name: string; path: string }[] {
    const parts = this.currentPath.split('/').filter(Boolean);
    const crumbs = [{ name: '/', path: '/' }];
    let accumulated = '';
    for (const part of parts) {
      accumulated += '/' + part;
      crumbs.push({ name: part, path: accumulated });
    }
    return crumbs;
  }

  private formatSize(bytes: number | null): string {
    if (bytes === null) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  private async uploadFiles(files: FileList | File[]) {
    if (!files.length) return;
    this.uploading = true;

    const formData = new FormData();
    for (const file of Array.from(files)) {
      formData.append('file', file);
    }

    try {
      await fetch(`/api/servers/${this.serverId}/files/upload?path=${encodeURIComponent(this.currentPath)}`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      showToast(`${files.length} file(s) uploaded`, 'success');
      this.loadDirectory();
    } catch {
      showToast('Upload failed', 'error');
    } finally {
      this.uploading = false;
    }
  }

  private handleDrop(e: DragEvent) {
    e.preventDefault();
    this.dragover = false;
    if (e.dataTransfer?.files.length) {
      this.uploadFiles(e.dataTransfer.files);
    }
  }

  private handleDragOver(e: DragEvent) {
    e.preventDefault();
    this.dragover = true;
  }

  private handleDragLeave() {
    this.dragover = false;
  }

  private triggerUpload() {
    const input = this.shadowRoot?.querySelector('.upload-input') as HTMLInputElement;
    input?.click();
  }

  private handleFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) {
      this.uploadFiles(input.files);
      input.value = '';
    }
  }

  private async createFolder() {
    const name = prompt('Folder name:');
    if (!name) return;

    try {
      await api(`/api/servers/${this.serverId}/files/mkdir`, {
        method: 'POST',
        body: JSON.stringify({ path: this.currentPath, name }),
      });
      showToast(`Folder "${name}" created`, 'success');
      this.loadDirectory();
    } catch (err: any) {
      showToast(err.body?.message || 'Failed to create folder', 'error');
    }
  }

  private getFileIcon(name: string, type: 'file' | 'directory'): string {
    if (type === 'directory') return '\u{1F4C1}';
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const icons: Record<string, string> = {
      json: '\u{1F4CB}', yml: '\u{1F4CB}', yaml: '\u{1F4CB}', toml: '\u{1F4CB}',
      properties: '\u2699\uFE0F', cfg: '\u2699\uFE0F', conf: '\u2699\uFE0F', ini: '\u2699\uFE0F',
      jar: '\u{1F4E6}', zip: '\u{1F4E6}', tar: '\u{1F4E6}', gz: '\u{1F4E6}',
      log: '\u{1F4DC}', txt: '\u{1F4DD}',
      sh: '\u{1F4BB}', bat: '\u{1F4BB}', cmd: '\u{1F4BB}',
      png: '\u{1F5BC}\uFE0F', jpg: '\u{1F5BC}\uFE0F', jpeg: '\u{1F5BC}\uFE0F', gif: '\u{1F5BC}\uFE0F',
    };
    return icons[ext] || '\u{1F4C4}';
  }

  private formatDate(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }

  render() {
    if (this.editingFile) return this.renderEditor();
    return this.renderBrowser();
  }

  private renderBrowser() {
    const crumbs = this.getBreadcrumbs();

    return html`
      <div class="toolbar">
        <div class="breadcrumb">
          ${crumbs.map((c, i) => html`
            ${i > 0 ? html`<span>/</span>` : ''}
            <button @click=${() => this.loadDirectory(c.path)}>${c.name}</button>
          `)}
        </div>
        <button class="btn btn-sm" @click=${() => this.createFolder()}>New Folder</button>
        <button class="btn btn-sm" @click=${() => this.triggerUpload()}>Upload</button>
        ${this.currentPath !== '/' ? html`<button class="btn btn-sm" @click=${() => this.navigateUp()}>Up</button>` : ''}
      </div>
      <input class="upload-input" type="file" multiple style="display:none" @change=${this.handleFileInput}>

      <div class="file-list">
        <div class="file-row header">
          <span>Name</span>
          <span class="file-size">Size</span>
          <span class="file-modified">Modified</span>
          <span></span>
        </div>
        ${this.loading
          ? html`<div class="empty">Loading...</div>`
          : this.entries.length === 0
            ? html`<div class="empty">Empty directory</div>`
            : this.entries.map(entry => html`
              <div class="file-row" @click=${() => this.handleClick(entry)}>
                <div class="file-name">
                  <span class="file-icon">${this.getFileIcon(entry.name, entry.type)}</span>
                  <span>${entry.name}</span>
                </div>
                <span class="file-size">${this.formatSize(entry.size)}</span>
                <span class="file-modified">${this.formatDate(entry.modified)}</span>
                <span class="file-actions">
                  <button class="btn btn-danger" @click=${(e: Event) => this.deleteEntry(e, entry)}
                    title="Delete" style="padding:2px 8px">x</button>
                </span>
              </div>
            `)
        }
      </div>

      ${this.uploading ? html`<div class="upload-progress">Uploading...</div>` : ''}

      <div class="dropzone ${this.dragover ? 'dragover' : ''}"
        @drop=${this.handleDrop}
        @dragover=${this.handleDragOver}
        @dragleave=${this.handleDragLeave}
        @click=${() => this.triggerUpload()}>
        Drop files here or click to upload
      </div>
    `;
  }

  private renderEditor() {
    return html`
      <div class="editor-header">
        <div>
          <h3>${this.editingFile!.name}</h3>
          <span class="editor-path">${this.editingFile!.path}</span>
        </div>
        <button class="btn" @click=${() => this.loadDirectory()}>Back to files</button>
      </div>
      <textarea .value=${this.editingFile!.content} spellcheck="false"></textarea>
      <div class="editor-actions">
        <button class="btn" @click=${() => this.loadDirectory()}>Cancel</button>
        <button class="btn btn-save" @click=${() => this.saveFile()}>Save</button>
      </div>
      ${this.saveStatus ? html`
        <div class="status-msg ${this.saveStatus.type}">${this.saveStatus.message}</div>
      ` : ''}
    `;
  }
}
