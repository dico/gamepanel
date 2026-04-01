import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { sharedStyles } from './styles/shared.js';
import { checkAuth, logout, onAuthChange } from './services/auth.js';
import { connectEventStream } from './services/ws.js';
import { route, resolve, navigate, notFound } from './router.js';
import type { User } from '@gamepanel/shared';

import './pages/login-page.js';
import './pages/dashboard-page.js';
import './pages/server-page.js';
import './pages/profile-page.js';
import './pages/nodes-page.js';
import './pages/settings-page.js';
import './pages/status-page.js';
import './components/notification-panel.js';
import './components/toast.js';
import './components/confirm-dialog.js';

@customElement('app-shell')
export class AppShell extends LitElement {
  static styles = [sharedStyles, css`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      overflow-x: hidden;
    }

    nav {
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      height: var(--nav-height);
      padding: 0 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .nav-left {
      display: flex;
      align-items: center;
      gap: 32px;
    }

    .brand {
      font-size: 18px;
      font-weight: 700;
      color: var(--accent);
    }

    .nav-links { display: flex; gap: 4px; }
    .nav-links a {
      padding: 6px 12px;
      border-radius: var(--radius-sm);
      color: var(--text-secondary);
      font-size: 14px;
      font-weight: 500;
      transition: all 0.15s;
    }
    .nav-links a:hover { color: var(--text-primary); background: var(--bg-hover); }
    .nav-links a.active { color: var(--text-primary); background: var(--bg-tertiary); }

    .nav-right {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .user-info { color: var(--text-secondary); font-size: 13px; }

    .theme-toggle {
      background: none;
      border: none;
      color: var(--text-secondary);
      font-size: 18px;
      padding: 4px;
      cursor: pointer;
    }

    main {
      flex: 1;
      padding: 24px;
      max-width: 1200px;
      margin: 0 auto;
      width: 100%;
      overflow-x: hidden;
    }
  `];

  @state() private user: User | null = null;
  @state() private currentPage: string = 'dashboard';
  @state() private pageParams: Record<string, string> = {};

  connectedCallback() {
    super.connectedCallback();

    onAuthChange((user) => {
      this.user = user;
      if (!user && this.currentPage !== 'login') navigate('/login');
    });

    route('/', () => { this.currentPage = 'dashboard'; });
    route('/servers', () => { this.currentPage = 'dashboard'; });
    route('/servers/:id', (params) => { this.currentPage = 'server'; this.pageParams = params; });
    route('/nodes', () => { this.currentPage = 'nodes'; });
    route('/settings', () => { this.currentPage = 'settings'; });
    route('/profile', () => { this.currentPage = 'profile'; });
    route('/status/:id', (params) => { this.currentPage = 'status'; this.pageParams = params; });
    route('/login', () => { this.currentPage = 'login'; });
    notFound(() => { this.currentPage = 'dashboard'; });

    checkAuth().then((user) => {
      // Status page doesn't need auth
      if (this.currentPage === 'status') return;
      if (!user) navigate('/login');
      else { connectEventStream(); resolve(); }
    });
  }

  private async handleLogout() {
    await logout();
    navigate('/login');
  }

  private renderPage() {
    switch (this.currentPage) {
      case 'login': return html`<login-page style="flex:1;display:flex"></login-page>`;
      case 'status': return html`<status-page style="flex:1;display:flex" .serverId=${this.pageParams.id}></status-page>`;
      case 'server': return html`<server-page .serverId=${this.pageParams.id}></server-page>`;
      case 'nodes': return html`<nodes-page></nodes-page>`;
      case 'settings': return html`<settings-page></settings-page>`;
      case 'profile': return html`<profile-page></profile-page>`;
      default: return html`<dashboard-page></dashboard-page>`;
    }
  }

  render() {
    if (this.currentPage === 'login' || this.currentPage === 'status') {
      return html`<main style="padding:0;flex:1;display:flex">${this.renderPage()}</main>`;
    }

    const path = location.pathname;
    return html`
      <nav>
        <div class="nav-left">
          <a href="/" class="brand">GamePanel</a>
          <div class="nav-links">
            <a href="/servers" class=${path === '/' || path === '/servers' ? 'active' : ''}>Servers</a>
            <a href="/nodes" class=${path === '/nodes' ? 'active' : ''}>Nodes</a>
            <a href="/settings" class=${path === '/settings' ? 'active' : ''}>Settings</a>
          </div>
        </div>
        <div class="nav-right">
          <notification-panel></notification-panel>
          <a href="/profile" class="nav-links" style="font-size:13px;color:var(--text-secondary)">${this.user?.username}</a>
          <button class="theme-toggle" @click=${this.toggleTheme} title="Toggle theme">&#9681;</button>
          <button class="btn btn-sm" @click=${this.handleLogout}>Logout</button>
        </div>
      </nav>
      <main>${this.renderPage()}</main>
      <toast-container></toast-container>
      <confirm-dialog></confirm-dialog>
    `;
  }

  private toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? '' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('gamepanel-theme', next || 'dark');
  }
}

// Restore theme on load
const saved = localStorage.getItem('gamepanel-theme');
if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');
