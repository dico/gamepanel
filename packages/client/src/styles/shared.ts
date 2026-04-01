import { css } from 'lit';

/**
 * Shared styles for all GamePanel Lit components.
 *
 * Usage: static styles = [sharedStyles, css`...component-specific...`];
 *
 * Provides consistent base styles so components don't duplicate CSS.
 * Any changes here propagate to all components that use it.
 */
export const sharedStyles = css`
  /* ===== Reset ===== */
  a { text-decoration: none; color: inherit; }

  /* ===== Typography ===== */
  h1 { font-size: 24px; font-weight: 700; }
  h2 { font-size: 20px; font-weight: 600; }
  h3 { font-size: 16px; font-weight: 600; }

  /* ===== Buttons ===== */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 500;
    font-family: var(--font-sans);
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    white-space: nowrap;
  }
  .btn:hover { background: var(--bg-hover); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-sm { padding: 4px 10px; font-size: 12px; }
  .btn-lg { padding: 10px 24px; font-size: 14px; }

  .btn-primary {
    background: var(--accent);
    border-color: var(--accent);
    color: white;
  }
  .btn-primary:hover { background: var(--accent-hover); }

  .btn-success {
    background: var(--success-bg);
    border-color: var(--success);
    color: var(--success);
  }
  .btn-success:hover { background: var(--success); color: white; }

  .btn-danger {
    color: var(--danger);
  }
  .btn-danger:hover { background: var(--danger-bg); }

  .btn-danger-fill {
    background: var(--danger);
    border-color: var(--danger);
    color: white;
  }
  .btn-danger-fill:hover { background: #e5534b; }

  .btn-ghost {
    background: transparent;
    border-color: transparent;
  }
  .btn-ghost:hover { background: var(--bg-hover); }

  /* ===== Form controls ===== */
  label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
    margin-bottom: 6px;
  }

  input, select, textarea {
    display: block;
    width: 100%;
    padding: 10px 12px;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text-primary);
    font-size: 14px;
    font-family: var(--font-sans);
    outline: none;
    box-sizing: border-box;
    height: 42px;
  }
  input:focus, select:focus, textarea:focus {
    border-color: var(--accent);
  }

  select {
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238b949e' d='M2 4l4 4 4-4'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    padding-right: 32px;
  }

  textarea {
    height: auto;
    min-height: 80px;
    resize: vertical;
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1.5;
  }

  /* ===== Toggle / Checkbox ===== */
  .toggle {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .toggle input[type="checkbox"] {
    width: 40px;
    height: 22px;
    appearance: none;
    -webkit-appearance: none;
    background: var(--bg-hover);
    border-radius: 11px;
    position: relative;
    cursor: pointer;
    border: 1px solid var(--border);
    padding: 0;
    flex-shrink: 0;
  }
  .toggle input[type="checkbox"]::after {
    content: '';
    position: absolute;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--text-muted);
    top: 2px;
    left: 2px;
    transition: all 0.2s;
  }
  .toggle input[type="checkbox"]:checked {
    background: var(--accent);
    border-color: var(--accent);
  }
  .toggle input[type="checkbox"]:checked::after {
    background: white;
    left: 20px;
  }

  /* ===== Badges ===== */
  .badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .badge-running { background: var(--success-bg); color: var(--success); }
  .badge-stopped { background: var(--bg-hover); color: var(--text-muted); }
  .badge-error { background: var(--danger-bg); color: var(--danger); }
  .badge-creating { background: var(--info-bg); color: var(--info); }
  .badge-online { background: var(--success-bg); color: var(--success); }
  .badge-offline { background: var(--bg-hover); color: var(--text-muted); }

  /* ===== Cards ===== */
  .card {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
  }

  .card-header {
    padding: 12px 16px;
    font-weight: 600;
    font-size: 14px;
    background: var(--bg-tertiary);
    border-bottom: 1px solid var(--border);
  }

  /* ===== Status messages ===== */
  .status-success { background: var(--success-bg); color: var(--success); padding: 8px 12px; border-radius: var(--radius-sm); font-size: 13px; }
  .status-error { background: var(--danger-bg); color: var(--danger); padding: 8px 12px; border-radius: var(--radius-sm); font-size: 13px; }
  .status-warning { background: var(--warning-bg); color: var(--warning); padding: 8px 12px; border-radius: var(--radius-sm); font-size: 13px; }
  .status-info { background: var(--info-bg); color: var(--info); padding: 8px 12px; border-radius: var(--radius-sm); font-size: 13px; }

  /* ===== Layout helpers ===== */
  .empty {
    text-align: center;
    padding: 48px 32px;
    color: var(--text-muted);
  }
`;
