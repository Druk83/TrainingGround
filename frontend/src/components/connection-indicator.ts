import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('connection-indicator')
export class ConnectionIndicator extends LitElement {
  static properties = {
    online: { type: Boolean },
    queueSize: { type: Number },
    syncing: { type: Boolean },
    message: { type: String },
    conflicts: { type: Number },
  };

  online = true;
  queueSize = 0;
  syncing = false;
  message?: string;
  conflicts = 0;

  static styles = css`
    :host {
      display: block;
      padding: 0.7rem 1rem;
      border-radius: 999px;
      background: var(--surface-2);
      font-size: 0.85rem;
    }

    .status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .dot {
      width: 0.65rem;
      height: 0.65rem;
      border-radius: 50%;
    }

    .dot.online {
      background: var(--success);
    }

    .dot.offline {
      background: var(--warning);
    }

    button {
      margin-left: auto;
      border: none;
      background: transparent;
      color: var(--primary);
      font-weight: 600;
      cursor: pointer;
    }

    button[disabled] {
      opacity: 0.6;
      cursor: wait;
    }
  `;

  render() {
    const statusText = this.online ? 'Онлайн' : 'Офлайн';
    return html`
      <div class="status" aria-live="polite">
        <span class="dot ${this.online ? 'online' : 'offline'}" aria-hidden="true"></span>
        <span>${statusText}</span>
        <span>Очередь: ${this.queueSize}</span>
        ${this.conflicts ? html`<span>Конфликты: ${this.conflicts}</span>` : null}
        ${this.message ? html`<span>${this.message}</span>` : null}
        <button @click=${this.handleSync} ?disabled=${this.syncing}>
          ${this.syncing ? 'Синхронизируем...' : 'Синхронизировать'}
        </button>
      </div>
    `;
  }

  private handleSync() {
    this.dispatchEvent(
      new CustomEvent('sync-request', { bubbles: true, composed: true }),
    );
  }
}
