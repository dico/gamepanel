import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared.js';
import { login } from '../services/auth.js';
import { navigate } from '../router.js';

@customElement('login-page')
export class LoginPage extends LitElement {
  static styles = [sharedStyles, css`
    :host {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }

    .login-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 40px;
      margin: 16px;
      width: 100%;
      max-width: 380px;
    }

    h1 {
      color: var(--accent);
      margin-bottom: 8px;
    }

    .subtitle {
      color: var(--text-secondary);
      margin-bottom: 32px;
      font-size: 14px;
    }

    input { margin-bottom: 16px; }

    .submit-btn {
      width: 100%;
      padding: 10px;
      background: var(--accent);
      color: white;
      border: none;
      border-radius: var(--radius);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    .submit-btn:hover { background: var(--accent-hover); }
    .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  `];

  @state() private error = '';
  @state() private loading = false;

  private async handleSubmit(e: Event) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const username = (form.querySelector('[name="username"]') as HTMLInputElement).value;
    const password = (form.querySelector('[name="password"]') as HTMLInputElement).value;

    this.loading = true;
    this.error = '';

    try {
      await login(username, password);
      navigate('/');
    } catch (err: any) {
      this.error = err.body?.message || 'Login failed';
    } finally {
      this.loading = false;
    }
  }

  render() {
    return html`
      <div class="login-card">
        <h1>GamePanel</h1>
        <p class="subtitle">Sign in to manage your servers</p>
        ${this.error ? html`<div class="status-error" style="margin-bottom:16px">${this.error}</div>` : ''}
        <form @submit=${this.handleSubmit}>
          <label>Username</label>
          <input name="username" type="text" autocomplete="username" autofocus required>
          <label>Password</label>
          <input name="password" type="password" autocomplete="current-password" required>
          <button class="submit-btn" type="submit" ?disabled=${this.loading}>
            ${this.loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    `;
  }
}
