import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared.js';

interface ConfirmRequest {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  resolve: (confirmed: boolean) => void;
}

let dialogInstance: ConfirmDialog | null = null;

/**
 * Show a confirm dialog. Returns a promise that resolves to true/false.
 * Usage: if (await confirm('Delete?', 'This cannot be undone.')) { ... }
 */
export function confirm(
  title: string,
  message: string,
  opts?: { confirmText?: string; cancelText?: string; danger?: boolean },
): Promise<boolean> {
  return new Promise((resolve) => {
    dialogInstance?.show({
      title,
      message,
      confirmText: opts?.confirmText,
      cancelText: opts?.cancelText,
      danger: opts?.danger,
      resolve,
    });
  });
}

@customElement('confirm-dialog')
export class ConfirmDialog extends LitElement {
  static styles = [sharedStyles, css`
    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 300;
    }

    .dialog {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 28px;
      width: 100%;
      max-width: 420px;
    }

    .title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 12px;
    }

    .message {
      color: var(--text-secondary);
      font-size: 14px;
      line-height: 1.5;
      margin-bottom: 24px;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  `];

  @state() private request: ConfirmRequest | null = null;

  connectedCallback() {
    super.connectedCallback();
    dialogInstance = this;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (dialogInstance === this) dialogInstance = null;
  }

  show(request: ConfirmRequest) {
    this.request = request;
  }

  private close(confirmed: boolean) {
    this.request?.resolve(confirmed);
    this.request = null;
  }

  render() {
    if (!this.request) return '';

    const { title, message, confirmText, cancelText, danger } = this.request;

    return html`
      <div class="overlay" @click=${(e: Event) => { if (e.target === e.currentTarget) this.close(false); }}>
        <div class="dialog">
          <div class="title">${title}</div>
          <div class="message">${message}</div>
          <div class="actions">
            <button class="btn" @click=${() => this.close(false)}>${cancelText || 'Cancel'}</button>
            <button class="btn ${danger ? 'btn-danger-fill' : 'btn-primary'}" @click=${() => this.close(true)}>
              ${confirmText || 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}
