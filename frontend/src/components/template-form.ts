import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

export type TemplatePIIFlag = 'email' | 'phone' | 'name';

export interface TemplateFormValues {
  slug: string;
  levelId: string;
  difficulty: 'A1' | 'A2' | 'B1' | 'B2' | '';
  type: 'mcq' | 'text_input' | 'true_false' | '';
  questionText: string;
  correctAnswer: string;
  options: string[];
  ruleIds: string[];
  hintTemplate: string;
  explanationTemplate: string;
  sources: string[];
  piiFlags: TemplatePIIFlag[];
}

const DEFAULT_FORM_VALUES: TemplateFormValues = {
  slug: '',
  levelId: '',
  difficulty: '',
  type: '',
  questionText: '',
  correctAnswer: '',
  options: [],
  ruleIds: [],
  hintTemplate: '',
  explanationTemplate: '',
  sources: [],
  piiFlags: [],
};

@customElement('template-form')
export class TemplateForm extends LitElement {
  static styles = css`
    :host {
      display: block;
      color: var(--text-main);
    }

    form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    label {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
    }

    input,
    select,
    textarea {
      background: var(--surface-1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: var(--radius-large);
      color: var(--text-main);
      padding: 0.55rem 0.8rem;
      font: inherit;
    }

    textarea {
      min-height: 100px;
      resize: vertical;
    }

    .field-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
    }

    .row-meta {
      margin: 0.25rem 0 0;
      color: var(--text-muted);
      font-size: 0.8rem;
    }

    .pii-list {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .pii-checkbox {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.85rem;
      color: var(--text-main);
    }

    .actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      align-items: center;
    }

    .error {
      padding: 0.75rem 1rem;
      border-radius: var(--radius-medium);
      background: rgba(248, 113, 113, 0.15);
      border: 1px solid rgba(248, 113, 113, 0.7);
      color: #991b1b;
      font-size: 0.9rem;
    }
  `;

  @property({ type: String }) mode: 'create' | 'edit' = 'create';
  @property({ type: Object }) initialValues?: TemplateFormValues;
  @property({ type: Boolean }) submitting = false;
  @property({ type: Boolean }) disabled = false;

  @state() private values: TemplateFormValues = { ...DEFAULT_FORM_VALUES };
  @state() private error?: string;

  updated(changed: Map<string, unknown>) {
    if (changed.has('initialValues') && this.initialValues) {
      this.values = this.buildInitialValues(this.initialValues);
      this.error = undefined;
    }
  }

  render() {
    const { type, options, ruleIds, sources, piiFlags } = this.values;
    return html`
      <form @submit=${this.handleSubmit}>
        <div class="field-grid">
          <label>
            Slug
            <input
              name="slug"
              placeholder="new-template-slug"
              .value=${this.values.slug}
              @input=${(event: Event) =>
                this.updateValue('slug', (event.currentTarget as HTMLInputElement).value)}
              required
              pattern="[a-z0-9-]+"
            />
          </label>
          <label>
            Уровень (ObjectId)
            <input
              name="levelId"
              placeholder="63a57c..."
              .value=${this.values.levelId}
              @input=${(event: Event) =>
                this.updateValue(
                  'levelId',
                  (event.currentTarget as HTMLInputElement).value,
                )}
              required
            />
          </label>
          <label>
            Сложность
            <select
              .value=${this.values.difficulty}
              @change=${(event: Event) => {
                const value = (event.currentTarget as HTMLSelectElement)
                  .value as TemplateFormValues['difficulty'];
                this.updateValue('difficulty', value);
              }}
            >
              <option value="">Не указано</option>
              <option value="A1">A1</option>
              <option value="A2">A2</option>
              <option value="B1">B1</option>
              <option value="B2">B2</option>
            </select>
          </label>
          <label>
            Тип задания
            <select
              .value=${this.values.type}
              @change=${(event: Event) => {
                const value = (event.currentTarget as HTMLSelectElement)
                  .value as TemplateFormValues['type'];
                this.updateValue('type', value);
              }}
            >
              <option value="">Выберите</option>
              <option value="mcq">MCQ</option>
              <option value="text_input">Text Input</option>
              <option value="true_false">True / False</option>
            </select>
          </label>
        </div>

        <label>
          Текст задания
          <textarea
            .value=${this.values.questionText}
            @input=${(event: Event) =>
              this.updateValue(
                'questionText',
                (event.currentTarget as HTMLTextAreaElement).value,
              )}
            placeholder="Найдите форму слова ..."
            required
          ></textarea>
        </label>

        <div class="field-grid">
          <label>
            Правильный ответ
            <input
              .value=${this.values.correctAnswer}
              @input=${(event: Event) =>
                this.updateValue(
                  'correctAnswer',
                  (event.currentTarget as HTMLInputElement).value,
                )}
              required
            />
          </label>
          ${type === 'mcq'
            ? html`
                <label>
                  Варианты (по одному в строке)
                  <textarea
                    .value=${options.join('\n')}
                    @input=${(event: Event) =>
                      this.updateList(
                        'options',
                        (event.currentTarget as HTMLTextAreaElement).value,
                      )}
                    placeholder="Вариант А
Вариант В"
                  ></textarea>
                </label>
              `
            : null}
        </div>

        <div class="field-grid">
          <label>
            Правила (ObjectId, одна строка)
            <textarea
              .value=${ruleIds.join('\n')}
              @input=${(event: Event) =>
                this.updateList(
                  'ruleIds',
                  (event.currentTarget as HTMLTextAreaElement).value,
                )}
              required
            ></textarea>
          </label>
          <label>
            Источники (по одной ссылке)
            <textarea
              .value=${sources.join('\n')}
              @input=${(event: Event) =>
                this.updateList(
                  'sources',
                  (event.currentTarget as HTMLTextAreaElement).value,
                )}
              placeholder="https://..."
            ></textarea>
          </label>
        </div>

        <div class="field-grid">
          <label>
            Шаблон подсказки
            <textarea
              .value=${this.values.hintTemplate}
              @input=${(event: Event) =>
                this.updateValue(
                  'hintTemplate',
                  (event.currentTarget as HTMLTextAreaElement).value,
                )}
              placeholder="{word:noun:genitive}"
            ></textarea>
          </label>
          <label>
            Шаблон объяснения
            <textarea
              .value=${this.values.explanationTemplate}
              @input=${(event: Event) =>
                this.updateValue(
                  'explanationTemplate',
                  (event.currentTarget as HTMLTextAreaElement).value,
                )}
              placeholder="{word:noun:genitive}"
            ></textarea>
          </label>
        </div>

        <div>
          <p class="row-meta">PII flags</p>
          <div class="pii-list">
            ${(['email', 'phone', 'name'] as TemplatePIIFlag[]).map(
              (flag) => html`
                <label class="pii-checkbox">
                  <input
                    type="checkbox"
                    .checked=${piiFlags.includes(flag)}
                    @change=${() => this.togglePIIFlag(flag)}
                  />
                  ${flag}
                </label>
              `,
            )}
          </div>
        </div>

        ${this.error ? html`<div class="error">${this.error}</div>` : null}

        <div class="actions">
          <button
            class="primary"
            type="submit"
            ?disabled=${this.submitting || this.disabled}
          >
            ${this.mode === 'create' ? 'Создать шаблон' : 'Сохранить изменения'}
          </button>
          <button
            class="secondary"
            type="button"
            @click=${this.handleCancel}
            ?disabled=${this.submitting}
          >
            Отмена
          </button>
        </div>
      </form>
    `;
  }

  private handleSubmit(event: Event) {
    event.preventDefault();
    if (this.submitting || this.disabled) {
      return;
    }

    const validation = this.validateForm();
    if (!validation.valid) {
      this.error = validation.message;
      return;
    }

    this.error = undefined;
    this.dispatchEvent(
      new CustomEvent('form-submit', {
        detail: this.values,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleCancel() {
    this.dispatchEvent(new CustomEvent('form-cancel', { bubbles: true, composed: true }));
  }

  private validateForm() {
    if (!/^[a-z0-9-]+$/.test(this.values.slug)) {
      return { valid: false, message: 'Slug должен содержать только латиницу и дефисы.' };
    }

    if (!this.values.levelId.trim()) {
      return { valid: false, message: 'Укажите уровень (ObjectId).' };
    }

    if (!this.values.questionText.trim()) {
      return { valid: false, message: 'Текст задания не может быть пустым.' };
    }

    if (!this.values.correctAnswer.trim()) {
      return { valid: false, message: 'Укажите правильный ответ.' };
    }

    if (!this.values.ruleIds.length) {
      return { valid: false, message: 'Добавьте хотя бы одно правило.' };
    }

    if (this.values.type === 'mcq' && this.values.options.length < 2) {
      return { valid: false, message: 'MCQ требует минимум два варианта.' };
    }

    return { valid: true };
  }

  private updateValue<K extends keyof TemplateFormValues>(
    field: K,
    value: TemplateFormValues[K],
  ) {
    this.values = { ...this.values, [field]: value };
    this.error = undefined;
  }

  private updateList(field: 'options' | 'ruleIds' | 'sources', value: string) {
    const normalized = value
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    this.values = { ...this.values, [field]: normalized };
    this.error = undefined;
  }

  private togglePIIFlag(flag: TemplatePIIFlag) {
    const piFlags = this.values.piiFlags.includes(flag)
      ? this.values.piiFlags.filter((item) => item !== flag)
      : [...this.values.piiFlags, flag];
    this.values = { ...this.values, piiFlags: piFlags };
  }

  private buildInitialValues(values: TemplateFormValues): TemplateFormValues {
    return {
      ...DEFAULT_FORM_VALUES,
      ...values,
      options: [...values.options],
      ruleIds: [...values.ruleIds],
      sources: [...values.sources],
      piiFlags: [...values.piiFlags],
    };
  }
}
