import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared.js';
import { GET, POST, DELETE } from '../services/api.js';
import { showToast } from '../components/toast.js';
import type { User, ApiToken } from '@gamepanel/shared';

@customElement('profile-page')
export class ProfilePage extends LitElement {
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

    .section-body { padding: 20px; }

    .form-row { margin-bottom: 16px; }
    .form-row:last-child { margin-bottom: 0; }

    .form-actions {
      display: flex;
      gap: 8px;
      margin-top: 16px;
    }

    .token-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid var(--border-light);
      font-size: 13px;
    }
    .token-row:last-child { border-bottom: none; }

    .token-name { font-weight: 500; flex: 1; }
    .token-date { color: var(--text-secondary); font-size: 12px; }

    .new-token-value {
      background: var(--bg-primary);
      border: 1px solid var(--success);
      border-radius: var(--radius);
      padding: 12px 16px;
      font-family: var(--font-mono);
      font-size: 13px;
      word-break: break-all;
      margin-bottom: 8px;
    }

    .new-token-warning {
      font-size: 12px;
      color: var(--warning);
      margin-bottom: 16px;
    }

    .create-token-form {
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }
    .create-token-form > div { flex: 1; }
  `];

  @state() private user: User | null = null;
  @state() private tokens: ApiToken[] = [];
  @state() private newTokenName = '';
  @state() private newTokenValue: string | null = null;
  @state() private passwordForm = { current: '', new: '', confirm: '' };

  connectedCallback() {
    super.connectedCallback();
    this.loadData();
  }

  private async loadData() {
    const [profileRes, tokensRes] = await Promise.all([
      GET<{ data: User }>('/api/profile'),
      GET<{ data: ApiToken[] }>('/api/profile/tokens'),
    ]);
    this.user = profileRes.data;
    this.tokens = tokensRes.data;
  }

  private async changePassword() {
    if (this.passwordForm.new !== this.passwordForm.confirm) {
      showToast('Passwords do not match', 'error');
      return;
    }
    try {
      await POST('/api/profile/password', {
        currentPassword: this.passwordForm.current,
        newPassword: this.passwordForm.new,
      });
      this.passwordForm = { current: '', new: '', confirm: '' };
      showToast('Password changed', 'success');
    } catch (err: any) {
      showToast(err.body?.message || 'Failed to change password', 'error');
    }
  }

  private async createToken() {
    if (!this.newTokenName) return;
    try {
      const res = await POST<{ data: ApiToken & { rawToken: string } }>('/api/profile/tokens', {
        name: this.newTokenName,
      });
      this.newTokenValue = res.data.rawToken;
      this.newTokenName = '';
      this.loadData();
      showToast('Token created', 'success');
    } catch (err: any) {
      showToast(err.body?.message || 'Failed to create token', 'error');
    }
  }

  private async deleteToken(id: string) {
    await DELETE(`/api/profile/tokens/${id}`);
    this.tokens = this.tokens.filter(t => t.id !== id);
    showToast('Token deleted', 'success');
  }

  private async copyToken() {
    if (!this.newTokenValue) return;
    await navigator.clipboard.writeText(this.newTokenValue);
    showToast('Token copied to clipboard', 'success', 2000);
  }

  render() {
    if (!this.user) return html`<p>Loading...</p>`;

    return html`
      <h1 style="margin-bottom:24px">Profile</h1>

      <div class="section">
        <div class="section-header">Account</div>
        <div class="section-body">
          <div class="form-row">
            <label>Username</label>
            <input type="text" .value=${this.user.username} disabled>
          </div>
          <div class="form-row">
            <label>Role</label>
            <input type="text" .value=${this.user.role} disabled>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-header">Change Password</div>
        <div class="section-body">
          <div class="form-row">
            <label>Current Password</label>
            <input type="password" .value=${this.passwordForm.current}
              @input=${(e: Event) => this.passwordForm = { ...this.passwordForm, current: (e.target as HTMLInputElement).value }}>
          </div>
          <div class="form-row">
            <label>New Password</label>
            <input type="password" .value=${this.passwordForm.new}
              @input=${(e: Event) => this.passwordForm = { ...this.passwordForm, new: (e.target as HTMLInputElement).value }}>
          </div>
          <div class="form-row">
            <label>Confirm New Password</label>
            <input type="password" .value=${this.passwordForm.confirm}
              @input=${(e: Event) => this.passwordForm = { ...this.passwordForm, confirm: (e.target as HTMLInputElement).value }}>
          </div>
          <div class="form-actions">
            <button class="btn btn-primary" @click=${() => this.changePassword()}>Change Password</button>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-header">API Tokens</div>
        <div class="section-body">
          ${this.newTokenValue ? html`
            <div class="new-token-value">${this.newTokenValue}</div>
            <div class="new-token-warning">Copy this token now — it won't be shown again.</div>
            <div style="margin-bottom:16px">
              <button class="btn btn-sm" @click=${() => this.copyToken()}>Copy</button>
              <button class="btn btn-sm" @click=${() => this.newTokenValue = null}>Dismiss</button>
            </div>
          ` : ''}

          <div class="create-token-form">
            <div>
              <label>Token Name</label>
              <input type="text" placeholder="e.g. Discord bot" .value=${this.newTokenName}
                @input=${(e: Event) => this.newTokenName = (e.target as HTMLInputElement).value}
                @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && this.createToken()}>
            </div>
            <button class="btn btn-primary" style="margin-bottom:0;height:42px" @click=${() => this.createToken()}>Create</button>
          </div>

          ${this.tokens.length > 0 ? html`
            <div style="margin-top:16px">
              ${this.tokens.map(t => html`
                <div class="token-row">
                  <span class="token-name">${t.name}</span>
                  <span class="token-date">Created ${t.createdAt}</span>
                  ${t.lastUsedAt ? html`<span class="token-date">Used ${t.lastUsedAt}</span>` : ''}
                  <button class="btn btn-sm btn-danger" @click=${() => this.deleteToken(t.id)}>Delete</button>
                </div>
              `)}
            </div>
          ` : html`<p style="color:var(--text-muted);margin-top:16px;font-size:13px">No API tokens yet.</p>`}
        </div>
      </div>
    `;
  }
}
