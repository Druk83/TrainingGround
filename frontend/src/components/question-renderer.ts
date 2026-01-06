import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

export type QuestionType = 'text' | 'mcq' | 'true-false';

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  options?: {
    id: string;
    text: string;
    correct?: boolean;
  }[];
}

@customElement('question-renderer')
export class QuestionRenderer extends LitElement {
  @property({ type: Object })
  declare question?: Question;

  @property({ type: String })
  declare answer: string;

  @property({ type: Boolean })
  declare submitDisabled: boolean;

  @property({ type: Boolean })
  declare hotkeysEnabled: boolean;

  @state()
  declare private selectedOption?: string;

  constructor() {
    super();
    this.answer = '';
    this.submitDisabled = false;
    this.hotkeysEnabled = false;
    this.selectedOption = undefined;
  }

  static styles = css`
    :host {
      display: block;
    }

    .question-text {
      margin-bottom: 1.5rem;
      font-size: clamp(1.25rem, 4vw, 2.2rem);
      line-height: 1.3;
      color: var(--text-main);
    }

    .question-options {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }

    .option-group {
      display: flex;
      align-items: center;
      padding: 1rem;
      background: var(--surface-3);
      border: 2px solid #1f2937;
      border-radius: 0.75rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .option-group:hover {
      border-color: var(--primary);
      background: #1a2332;
    }

    .option-group.selected {
      border-color: var(--primary);
      background: #1a2848;
    }

    input[type='radio'],
    input[type='checkbox'] {
      margin-right: 0.75rem;
      cursor: pointer;
      width: 1.25rem;
      height: 1.25rem;
    }

    .option-text {
      flex: 1;
      color: var(--text-main);
    }

    textarea {
      width: 100%;
      min-height: 160px;
      background: var(--surface-3);
      color: inherit;
      border: 1px solid #1f2937;
      border-radius: 1rem;
      padding: 1rem;
      font-size: 1rem;
      resize: vertical;
      font-family: inherit;
    }

    textarea:focus {
      outline: none;
      border-color: var(--primary);
    }

    .button-group {
      display: flex;
      gap: 0.75rem;
      margin-top: 1.5rem;
      flex-wrap: wrap;
    }

    button {
      padding: 0.75rem 1.5rem;
      border-radius: 0.5rem;
      border: none;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.2s;
    }

    button.primary {
      background: var(--primary);
      color: white;
    }

    button.primary:hover:not(:disabled) {
      opacity: 0.9;
      transform: translateY(-1px);
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .hotkey-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-left: 0.35rem;
      padding: 0.1rem 0.4rem;
      border-radius: 0.5rem;
      border: 1px solid #334155;
      font-size: 0.75rem;
      text-transform: uppercase;
      background: #02061755;
    }

    .field-meta {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin: 0.5rem 0 0;
    }

    @media (max-width: 767px) {
      textarea {
        min-height: 130px;
        font-size: 0.95rem;
      }

      button {
        width: 100%;
        text-align: center;
      }
    }
  `;

  protected willUpdate(changed: Map<string, unknown>) {
    if (changed.has('question')) {
      this.selectedOption = undefined;
      this.answer = '';
    }
  }

  render() {
    if (!this.question) {
      return nothing;
    }

    return html`
      <div class="question-text">${this.question.text}</div>
      ${this.renderContent()}
    `;
  }

  private renderContent() {
    switch (this.question?.type) {
      case 'mcq':
        return this.renderMCQ();
      case 'true-false':
        return this.renderTrueFalse();
      case 'text':
      default:
        return this.renderTextInput();
    }
  }

  private renderMCQ() {
    if (!this.question?.options) return nothing;

    return html`
      <div class="question-options">
        ${this.question.options.map(
          (option) => html`
            <label
              class="option-group ${this.selectedOption === option.id ? 'selected' : ''}"
            >
              <input
                type="radio"
                name="answer"
                .value=${option.id}
                .checked=${this.selectedOption === option.id}
                @change=${(e: Event) => this.onOptionSelect(e, option.id)}
              />
              <span class="option-text">${option.text}</span>
            </label>
          `,
        )}
      </div>
      <div class="button-group">
        <button
          class="primary"
          @click=${this.handleSubmit}
          ?disabled=${!this.selectedOption || this.submitDisabled}
        >
          Проверить ответ
        </button>
      </div>
    `;
  }

  private renderTrueFalse() {
    return html`
      <div class="question-options">
        <label class="option-group ${this.selectedOption === 'true' ? 'selected' : ''}">
          <input
            type="radio"
            name="answer"
            value="true"
            .checked=${this.selectedOption === 'true'}
            @change=${(e: Event) => this.onOptionSelect(e, 'true')}
          />
          <span class="option-text">✓ Верно</span>
        </label>
        <label class="option-group ${this.selectedOption === 'false' ? 'selected' : ''}">
          <input
            type="radio"
            name="answer"
            value="false"
            .checked=${this.selectedOption === 'false'}
            @change=${(e: Event) => this.onOptionSelect(e, 'false')}
          />
          <span class="option-text">✗ Неверно</span>
        </label>
      </div>
      <div class="button-group">
        <button
          class="primary"
          @click=${this.handleSubmit}
          ?disabled=${!this.selectedOption || this.submitDisabled}
        >
          Проверить ответ
        </button>
      </div>
    `;
  }

  private renderTextInput() {
    return html`
      <textarea
        .value=${this.answer}
        @input=${this.onInput}
        @keydown=${this.onKeyDown}
        placeholder="Введите развёрнутый ответ..."
        aria-label="Ответ на задание"
      ></textarea>
      <div class="field-meta">
        ${this.hotkeysEnabled
          ? html`Горячие клавиши: Ctrl+Enter внутри поля, S (вне поля ввода).
            ${this.renderHotKeyBadge('S')}`
          : html`Введите развёрнутый ответ и нажмите «Отправить».`}
      </div>
      <div class="button-group">
        <button
          class="primary"
          @click=${this.handleSubmit}
          ?disabled=${!this.answer.trim() || this.submitDisabled}
        >
          Отправить ответ ${this.hotkeysEnabled ? this.renderHotKeyBadge('S') : nothing}
        </button>
      </div>
    `;
  }

  private renderHotKeyBadge(key: string) {
    return html`<span class="hotkey-badge" aria-hidden="true">${key}</span>`;
  }

  private onInput(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    this.answer = target.value;
    this.dispatchEvent(
      new CustomEvent('answer-typing', { bubbles: true, composed: true }),
    );
  }

  private onKeyDown(event: KeyboardEvent) {
    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault();
      this.handleSubmit();
    }
  }

  private onOptionSelect(event: Event, optionId: string) {
    const input = event.target as HTMLInputElement;
    if (input.checked) {
      this.selectedOption = optionId;
      this.answer = optionId;
    }
  }

  private handleSubmit() {
    const answerValue =
      this.question?.type === 'text' ? this.answer : this.selectedOption;

    if (!answerValue?.trim()) {
      this.dispatchEvent(
        new CustomEvent('answer-error', {
          detail: { message: 'Выберите ответ перед отправкой.' },
          bubbles: true,
          composed: true,
        }),
      );
      return;
    }

    this.dispatchEvent(
      new CustomEvent('answer-submit', {
        detail: { answer: answerValue },
        bubbles: true,
        composed: true,
      }),
    );
  }

  public getAnswer(): string | undefined {
    return this.question?.type === 'text' ? this.answer : this.selectedOption;
  }
}
