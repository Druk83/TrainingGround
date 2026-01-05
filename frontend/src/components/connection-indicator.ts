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

  declare online: boolean;
  declare queueSize: number;
  declare syncing: boolean;
  declare message?: string;
  declare conflicts: number;

  constructor() {
    super();
    this.online = true;
    this.queueSize = 0;
    this.syncing = false;
    this.message = undefined;
    this.conflicts = 0;
  }

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
      opacity: 1;
      cursor: wait;
      color: #cbd5f5;
    }
  `;

  render() {
    const statusText = this.online ? 'Онлайн' : 'Офлайн';
    const showSyncButton = this.queueSize > 0 || this.syncing;
    return html`
      <div class="status" aria-live="polite">
        <span class="dot ${this.online ? 'online' : 'offline'}" aria-hidden="true"></span>
        <span>${statusText}</span>
        ${this.queueSize > 0 ? html`<span>Очередь: ${this.queueSize}</span>` : null}
        ${this.conflicts ? html`<span>Конфликты: ${this.conflicts}</span>` : null}
        ${this.message ? html`<span>${this.message}</span>` : null}
        ${showSyncButton
          ? html`<button @click=${this.handleSync} ?disabled=${this.syncing}>
              ${this.syncing ? 'Синхронизация…' : 'Синхронизировать'}
            </button>`
          : null}
      </div>
    `;
  }

  private handleSync() {
    this.dispatchEvent(
      new CustomEvent('sync-request', { bubbles: true, composed: true }),
    );
  }
}
