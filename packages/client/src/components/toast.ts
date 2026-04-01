import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

interface ToastMessage {
  id: number;
  text: string;
  type: 'success' | 'error' | 'warning' | 'info';
  timeout: number;
}

let nextId = 0;

// Global toast instance
let toastInstance: ToastContainer | null = null;

export function showToast(text: string, type: ToastMessage['type'] = 'info', timeout = 4000): void {
  toastInstance?.addToast(text, type, timeout);
}

@customElement('toast-container')
export class ToastContainer extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      display: flex;
      flex-direction: column-reverse;
      gap: 8px;
      pointer-events: none;
    }

    .toast {
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 13px;
      font-family: var(--font-sans);
      color: white;
      pointer-events: auto;
      animation: slide-in 0.2s ease-out;
      cursor: pointer;
      max-width: 400px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .toast.removing {
      animation: slide-out 0.2s ease-in forwards;
    }

    .toast-success { background: #2ea043; }
    .toast-error { background: #da3633; }
    .toast-warning { background: #d29922; color: #1c2129; }
    .toast-info { background: #316dca; }

    @keyframes slide-in {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slide-out {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
  `;

  @state() private toasts: ToastMessage[] = [];

  connectedCallback() {
    super.connectedCallback();
    toastInstance = this;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (toastInstance === this) toastInstance = null;
  }

  addToast(text: string, type: ToastMessage['type'], timeout: number) {
    const id = nextId++;
    this.toasts = [...this.toasts, { id, text, type, timeout }];

    setTimeout(() => this.removeToast(id), timeout);
  }

  private removeToast(id: number) {
    const el = this.shadowRoot?.querySelector(`[data-id="${id}"]`);
    if (el) {
      el.classList.add('removing');
      setTimeout(() => {
        this.toasts = this.toasts.filter(t => t.id !== id);
      }, 200);
    } else {
      this.toasts = this.toasts.filter(t => t.id !== id);
    }
  }

  render() {
    return html`
      ${this.toasts.map(t => html`
        <div class="toast toast-${t.type}" data-id=${t.id} @click=${() => this.removeToast(t.id)}>
          ${t.text}
        </div>
      `)}
    `;
  }
}
