import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import type { OfflineOperation } from '@/lib/offline-queue';
import type { ConflictResolution } from '@/lib/session-store';

@customElement('conflict-resolver')
export class ConflictResolver extends LitElement {
  static properties = {
    conflicts: { type: Array },
  };

  conflicts: OfflineOperation[] = [];

  static styles = css`
    :host {
      display: block;
      padding: var(--panel-padding);
      background: var(--surface-2);
      border-radius: var(--panel-radius);
      border: 1px solid #1b2434;
    }

    h2 {
      margin: 0 0 0.5rem;
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
    }

    .empty {
      color: var(--text-muted);
      font-size: 0.9rem;
    }

    ul {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    li {
      background: var(--surface-3);
      border: 1px solid #2a364d;
      border-radius: 0.9rem;
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    pre {
      background: #02061755;
      border-radius: 0.5rem;
      padding: 0.5rem;
      margin: 0;
      font-size: 0.8rem;
      max-height: 180px;
      overflow: auto;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    button {
      border: none;
      border-radius: 999px;
      padding: 0.4rem 1rem;
      cursor: pointer;
      font-weight: 600;
    }

    button.primary {
      background: var(--primary);
      color: #fff;
    }

    button.secondary {
      background: var(--surface-1);
      color: var(--text-main);
    }

    button.destructive {
      background: var(--error);
      color: #fff;
    }

    .toolbar {
      display: flex;
      justify-content: flex-end;
      margin-top: 0.75rem;
    }
  `;

  render() {
    return html`
      <section>
        <h2>Конфликты синхронизации</h2>
        ${this.conflicts.length === 0
          ? html`<p class="empty">Все данные на сервере. Конфликтов нет.</p>`
          : html`
              <p class="empty">
                Обнаружено ${this.conflicts.length}
                ${this.conflicts.length === 1 ? 'конфликт' : 'конфликта'} — решите
                вручную.
              </p>
              <ul>
                ${this.conflicts.map((operation) => this.renderConflict(operation))}
              </ul>
              <div class="toolbar">
                <button class="secondary" @click=${this.handleClearAll}>
                  Отменить все
                </button>
              </div>
            `}
      </section>
    `;
  }

  private renderConflict(operation: OfflineOperation) {
    const createdAt = new Date(operation.createdAt).toLocaleString();
    return html`
      <li>
        <div class="meta">
          <span>Тип: ${operation.type}</span>
          <span>Сессия: ${operation.sessionId}</span>
          <span>Создано: ${createdAt}</span>
        </div>
        <pre>${JSON.stringify(operation.payload, null, 2)}</pre>
        <div class="actions">
          <button
            class="primary"
            @click=${() => this.emitResolution(operation.id, 'accept-server')}
          >
            Принять серверные
          </button>
          <button
            class="secondary"
            @click=${() => this.emitResolution(operation.id, 'keep-local')}
          >
            Оставить локальные
          </button>
        </div>
      </li>
    `;
  }

  private emitResolution(operationId: string, resolution: ConflictResolution) {
    this.dispatchEvent(
      new CustomEvent('resolve-conflict', {
        detail: { operationId, resolution },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleClearAll = () => {
    this.dispatchEvent(
      new CustomEvent('clear-conflicts', {
        bubbles: true,
        composed: true,
      }),
    );
  };
}
