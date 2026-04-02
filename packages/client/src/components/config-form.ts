import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { PATCH } from '../services/api.js';
import { sharedStyles } from '../styles/shared.js';
import { showToast } from './toast.js';
import type { GameTemplate, ConfigField, ConfigGroup, Server } from '@gamepanel/shared';

@customElement('config-form')
export class ConfigForm extends LitElement {
  static styles = [sharedStyles, css`
    :host { display: block; }

    .section {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      margin-bottom: 16px;
      overflow: hidden;
    }

    .section-header {
      padding: 12px 16px;
      font-weight: 600;
      font-size: 14px;
      background: var(--bg-tertiary);
      border-bottom: 1px solid var(--border);
    }

    .section-body {
      padding: 16px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .field { min-width: 0; }
    .field.full-width { grid-column: 1 / -1; }

    .description {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    .advanced-toggle {
      font-size: 12px;
      color: var(--accent);
      background: none;
      border: none;
      cursor: pointer;
      padding: 8px 0;
    }
    .advanced-toggle:hover { text-decoration: underline; }

    .actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 20px;
    }

  `];

  @property({ type: Object }) server!: Server;
  @property({ type: Object }) template!: GameTemplate;

  @state() private values: Record<string, string> = {};
  @state() private showAdvanced = false;
  @state() private dirty = false;

  connectedCallback() {
    super.connectedCallback();
    // Initialize values from server's current environment + configValues
    this.values = { ...this.server.environment, ...this.server.configValues };
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('server') && this.server) {
      this.values = { ...this.server.environment, ...this.server.configValues };
      this.dirty = false;
    }
  }

  private setValue(key: string, value: string) {
    this.values = { ...this.values, [key]: value };
    this.dirty = true;
  }

  private async save() {
    // Split values back into environment and configValues
    const envKeys = new Set(this.template.environment.configurable.map(f => f.key));
    const environment: Record<string, string> = {};
    const configValues: Record<string, string> = {};

    for (const [key, value] of Object.entries(this.values)) {
      if (envKeys.has(key)) {
        environment[key] = value;
      } else {
        configValues[key] = value;
      }
    }

    try {
      await PATCH(`/api/servers/${this.server.id}`, { environment, configValues });
      this.dirty = false;
      this.dispatchEvent(new CustomEvent('saved'));
      this.dispatchEvent(new CustomEvent('needs-recreate', { bubbles: true, composed: true }));
    } catch (err: any) {
      showToast(err.body?.message || 'Failed to save', 'error');
    }
  }

  private getGroups(): (ConfigGroup & { fields: ConfigField[] })[] {
    const groups = [...(this.template.configGroups || [])].sort((a, b) => a.order - b.order);
    const allFields = [
      ...this.template.environment.configurable,
      ...(this.template.configFiles?.flatMap(cf => cf.managedFields ?? []) ?? []),
    ];

    return groups.map(g => ({
      ...g,
      fields: allFields.filter(f => f.group === g.id),
    })).filter(g => g.fields.length > 0);
  }

  private isFieldVisible(field: ConfigField): boolean {
    if (!field.dependsOn) return true;
    const depValue = this.values[field.dependsOn.key];
    return String(depValue) === String(field.dependsOn.value);
  }

  private renderField(field: ConfigField) {
    if (!this.isFieldVisible(field)) return '';

    const value = this.values[field.key] ?? String(field.default);

    switch (field.type) {
      case 'boolean':
        return html`
          <div class="field">
            <div class="toggle">
              <input type="checkbox"
                .checked=${value === 'true'}
                @change=${(e: Event) => this.setValue(field.key, (e.target as HTMLInputElement).checked ? 'true' : 'false')}>
              <label style="margin-bottom:0">${field.label}</label>
            </div>
            ${field.description ? html`<div class="description">${field.description}</div>` : ''}
          </div>`;

      case 'select':
        return html`
          <div class="field">
            <label>${field.label}</label>
            <select .value=${value} @change=${(e: Event) => this.setValue(field.key, (e.target as HTMLSelectElement).value)}>
              ${field.options?.map(o => html`<option value=${o} ?selected=${value === o}>${o}</option>`)}
            </select>
            ${field.description ? html`<div class="description">${field.description}</div>` : ''}
          </div>`;

      case 'number':
        return html`
          <div class="field">
            <label>${field.label}</label>
            <input type="number"
              .value=${value}
              min=${field.validation?.min ?? ''}
              max=${field.validation?.max ?? ''}
              @input=${(e: Event) => this.setValue(field.key, (e.target as HTMLInputElement).value)}>
            ${field.description ? html`<div class="description">${field.description}</div>` : ''}
          </div>`;

      case 'password':
        return html`
          <div class="field">
            <label>${field.label}</label>
            <input type="password" .value=${value}
              @input=${(e: Event) => this.setValue(field.key, (e.target as HTMLInputElement).value)}>
            ${field.description ? html`<div class="description">${field.description}</div>` : ''}
          </div>`;

      case 'text':
        return html`
          <div class="field full-width">
            <label>${field.label}</label>
            <textarea .value=${value}
              @input=${(e: Event) => this.setValue(field.key, (e.target as HTMLTextAreaElement).value)}></textarea>
            ${field.description ? html`<div class="description">${field.description}</div>` : ''}
          </div>`;

      default: // string
        return html`
          <div class="field">
            <label>${field.label}</label>
            <input type="text" .value=${value}
              @input=${(e: Event) => this.setValue(field.key, (e.target as HTMLInputElement).value)}>
            ${field.description ? html`<div class="description">${field.description}</div>` : ''}
          </div>`;
    }
  }

  render() {
    const groups = this.getGroups();
    const normalGroups = groups.filter(g => !g.advanced);
    const advancedGroups = groups.filter(g => g.advanced);

    return html`
      ${normalGroups.map(group => html`
        <div class="section">
          <div class="section-header">${group.label}</div>
          <div class="section-body">
            ${group.fields.map(f => this.renderField(f))}
          </div>
        </div>
      `)}

      ${advancedGroups.length > 0 ? html`
        <button class="advanced-toggle" @click=${() => this.showAdvanced = !this.showAdvanced}>
          ${this.showAdvanced ? 'Hide' : 'Show'} advanced settings
        </button>
        ${this.showAdvanced ? advancedGroups.map(group => html`
          <div class="section">
            <div class="section-header">${group.label}</div>
            <div class="section-body">
              ${group.fields.map(f => this.renderField(f))}
            </div>
          </div>
        `) : ''}
      ` : ''}

      <div class="actions">
        <button class="btn btn-primary" ?disabled=${!this.dirty} @click=${() => this.save()}>
          Save Configuration
        </button>
      </div>

    `;
  }
}
