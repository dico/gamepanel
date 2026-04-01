import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared.js';
import { GET, PATCH, POST } from '../services/api.js';
import { onWsEvent } from '../services/ws.js';
import type { Notification } from '@gamepanel/shared';

@customElement('notification-panel')
export class NotificationPanel extends LitElement {
  static styles = [sharedStyles, css`
    :host {
      position: relative;
      display: inline-flex;
    }

    .bell {
      background: none;
      border: none;
      color: var(--text-secondary);
      font-size: 18px;
      padding: 4px 8px;
      cursor: pointer;
      position: relative;
    }
    .bell:hover { color: var(--text-primary); }

    .badge {
      position: absolute;
      top: 0;
      right: 2px;
      background: var(--danger);
      color: white;
      font-size: 10px;
      font-weight: 700;
      min-width: 16px;
      height: 16px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
    }

    .dropdown {
      position: absolute;
      top: 100%;
      right: 0;
      width: 360px;
      max-height: 400px;
      overflow-y: auto;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      z-index: 300;
      margin-top: 8px;
    }

    .dropdown-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      font-weight: 600;
      font-size: 14px;
    }

    .mark-all {
      font-size: 12px;
      color: var(--accent);
      background: none;
      border: none;
      cursor: pointer;
    }
    .mark-all:hover { text-decoration: underline; }

    .notification-item {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-light);
      font-size: 13px;
      cursor: pointer;
    }
    .notification-item:hover { background: var(--bg-hover); }
    .notification-item:last-child { border-bottom: none; }
    .notification-item.unread { border-left: 3px solid var(--accent); }

    .notif-title {
      font-weight: 600;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .level-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .level-critical { background: var(--danger); }
    .level-warning { background: var(--warning); }
    .level-info { background: var(--info); }

    .notif-message { color: var(--text-secondary); font-size: 12px; }
    .notif-time { color: var(--text-muted); font-size: 11px; margin-top: 4px; }

  `];

  @state() private notifications: Notification[] = [];
  @state() private unreadCount = 0;
  @state() private open = false;
  private cleanupWs?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this.loadNotifications();

    this.cleanupWs = onWsEvent((event) => {
      if (event.type === 'notification') {
        this.notifications = [event.notification, ...this.notifications];
        this.unreadCount++;
      }
    });

    // Close on outside click
    document.addEventListener('click', this.handleOutsideClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.cleanupWs?.();
    document.removeEventListener('click', this.handleOutsideClick);
  }

  private handleOutsideClick = (e: Event) => {
    if (!this.open) return;
    const path = e.composedPath();
    if (!path.includes(this)) {
      this.open = false;
    }
  };

  private async loadNotifications() {
    try {
      const res = await GET<{ data: Notification[]; total: number }>('/api/notifications?limit=20');
      this.notifications = res.data;
      this.unreadCount = this.notifications.filter(n => !n.read).length;
    } catch { /* ignore */ }
  }

  private async markRead(id: string) {
    await PATCH(`/api/notifications/${id}/read`, {});
    this.notifications = this.notifications.map(n =>
      n.id === id ? { ...n, read: true } : n
    );
    this.unreadCount = this.notifications.filter(n => !n.read).length;
  }

  private async markAllRead() {
    await POST('/api/notifications/read-all');
    this.notifications = this.notifications.map(n => ({ ...n, read: true }));
    this.unreadCount = 0;
  }

  private formatTime(iso: string): string {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diff = now.getTime() - d.getTime();
      if (diff < 60_000) return 'Just now';
      if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
      if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
      return d.toLocaleDateString();
    } catch { return iso; }
  }

  render() {
    return html`
      <button class="bell" @click=${(e: Event) => { e.stopPropagation(); this.open = !this.open; }}>
        &#x1F514;
        ${this.unreadCount > 0 ? html`<span class="badge">${this.unreadCount}</span>` : ''}
      </button>

      ${this.open ? html`
        <div class="dropdown">
          <div class="dropdown-header">
            <span>Notifications</span>
            ${this.unreadCount > 0 ? html`
              <button class="mark-all" @click=${() => this.markAllRead()}>Mark all read</button>
            ` : ''}
          </div>
          ${this.notifications.length === 0
            ? html`<div class="empty">No notifications</div>`
            : this.notifications.map(n => html`
              <div class="notification-item ${n.read ? '' : 'unread'}"
                   @click=${() => !n.read && this.markRead(n.id)}>
                <div class="notif-title">
                  <span class="level-dot level-${n.level}"></span>
                  ${n.title}
                </div>
                ${n.message ? html`<div class="notif-message">${n.message}</div>` : ''}
                <div class="notif-time">${this.formatTime(n.createdAt)}</div>
              </div>
            `)
          }
        </div>
      ` : ''}
    `;
  }
}
