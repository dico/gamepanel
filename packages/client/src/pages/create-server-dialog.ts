import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared.js';
import { POST } from '../services/api.js';
import type { GameTemplate, GameNode } from '@gamepanel/shared';

@customElement('create-server-dialog')
export class CreateServerDialog extends LitElement {
  static styles = [sharedStyles, css`
    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 200;
    }

    .dialog {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 32px;
      width: 100%;
      max-width: 500px;
      max-height: 80vh;
      overflow-y: auto;
      margin: 16px;
      box-sizing: border-box;
    }

    input, select { margin-bottom: 16px; }

    .env-section { margin-top: 8px; margin-bottom: 16px; }
    .env-section h3 { font-size: 14px; color: var(--text-secondary); margin-bottom: 12px; }

    .env-field { margin-bottom: 12px; }
    .env-field .description {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: -12px;
      margin-bottom: 12px;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 24px;
    }
  `];

  @property({ type: Array }) templates: GameTemplate[] = [];
  @property({ type: Array }) nodes: GameNode[] = [];

  @state() private selectedTemplate = '';
  @state() private name = '';
  @state() private selectedNode = 'local';
  @state() private envValues: Record<string, string> = {};
  @state() private loading = false;
  @state() private error = '';

  private get template(): GameTemplate | undefined {
    return this.templates.find(t => t.slug === this.selectedTemplate);
  }

  private handleTemplateChange(e: Event) {
    this.selectedTemplate = (e.target as HTMLSelectElement).value;
    // Set defaults
    const tmpl = this.template;
    if (tmpl) {
      const env: Record<string, string> = {};
      for (const field of tmpl.environment.configurable) {
        env[field.key] = String(field.default);
      }
      this.envValues = env;
      if (!this.name) {
        this.name = `My ${tmpl.name}`;
      }
    }
  }

  private async handleCreate() {
    if (!this.name || !this.selectedTemplate) return;

    this.loading = true;
    this.error = '';

    try {
      await POST('/api/servers', {
        name: this.name,
        nodeId: this.selectedNode,
        templateSlug: this.selectedTemplate,
        environment: this.envValues,
        autoStart: true,
      });
      this.dispatchEvent(new CustomEvent('created'));
    } catch (err: any) {
      this.error = err.body?.message || err.message || 'Failed to create server';
    } finally {
      this.loading = false;
    }
  }

  render() {
    const tmpl = this.template;

    return html`
      <div class="overlay" @click=${(e: Event) => { if (e.target === e.currentTarget) this.dispatchEvent(new CustomEvent('close')); }}>
        <div class="dialog">
          <h2>Create Server</h2>

          ${this.error ? html`<div class="status-error" style="margin-bottom:16px">${this.error}</div>` : ''}

          ${tmpl ? html`
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding:12px;background:var(--bg-primary);border:1px solid var(--border);border-radius:var(--radius)">
              <img src="/api/templates/images/${tmpl.image}" alt="" style="width:80px;height:37px;border-radius:var(--radius-sm);object-fit:cover">
              <div>
                <div style="font-weight:600">${tmpl.name}</div>
                <div style="font-size:12px;color:var(--text-secondary)">${tmpl.category}</div>
              </div>
            </div>
          ` : ''}

          <label>Game</label>
          <select @change=${this.handleTemplateChange}>
            <option value="">Select a game...</option>
            ${this.templates.map(t => html`<option value=${t.slug}>${t.name}</option>`)}
          </select>

          <label>Server Name</label>
          <input type="text" .value=${this.name} @input=${(e: Event) => this.name = (e.target as HTMLInputElement).value}>

          <label>Node</label>
          <select .value=${this.selectedNode} @change=${(e: Event) => this.selectedNode = (e.target as HTMLSelectElement).value}>
            ${this.nodes.map(n => html`<option value=${n.id}>${n.name}</option>`)}
          </select>

          ${tmpl && tmpl.environment.configurable.length > 0 ? html`
            <div class="env-section">
              <h3>Configuration</h3>
              ${tmpl.environment.configurable.map(field => html`
                <div class="env-field">
                  <label>${field.label}</label>
                  ${field.type === 'select'
                    ? html`<select
                        .value=${this.envValues[field.key] ?? String(field.default)}
                        @change=${(e: Event) => {
                          this.envValues = { ...this.envValues, [field.key]: (e.target as HTMLSelectElement).value };
                        }}>
                        ${field.options?.map(o => html`<option value=${o}>${o}</option>`)}
                      </select>`
                    : html`<input
                        type=${field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
                        .value=${this.envValues[field.key] ?? String(field.default)}
                        @input=${(e: Event) => {
                          this.envValues = { ...this.envValues, [field.key]: (e.target as HTMLInputElement).value };
                        }}>`
                  }
                  ${field.description ? html`<div class="description">${field.description}</div>` : ''}
                </div>
              `)}
            </div>
          ` : ''}

          <div class="actions">
            <button class="btn" @click=${() => this.dispatchEvent(new CustomEvent('close'))}>Cancel</button>
            <button class="btn btn-primary" ?disabled=${this.loading || !this.selectedTemplate || !this.name} @click=${this.handleCreate}>
              ${this.loading ? 'Creating...' : 'Create & Start'}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}
