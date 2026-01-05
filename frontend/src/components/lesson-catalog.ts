import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import type { LessonCard } from '@/lib/session-store';

@customElement('lesson-catalog')
export class LessonCatalog extends LitElement {
  static properties = {
    lessons: { type: Array },
    activeLessonId: { type: String },
  };

  declare lessons: LessonCard[];
  declare activeLessonId?: string;

  constructor() {
    super();
    this.lessons = [];
    this.activeLessonId = undefined;
  }

  static styles = css`
    :host {
      display: block;
      padding: var(--panel-padding);
      background: var(--surface-2);
      border-radius: var(--panel-radius);
      min-height: 100%;
    }

    h2 {
      margin: 0 0 1rem;
      font-size: 0.95rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    ul {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    button {
      width: 100%;
      text-align: left;
      padding: 1rem;
      border-radius: 0.9rem;
      border: 1px solid #243049;
      background: var(--surface-3);
      color: inherit;
      cursor: pointer;
      transition:
        border-color 0.2s,
        transform 0.2s;
    }

    button[disabled] {
      cursor: not-allowed;
      opacity: 1;
      color: #9fb8dd;
      border-color: #2f3d58;
    }

    button.active {
      border-color: var(--primary);
      box-shadow: 0 0 0 1px var(--primary-soft);
    }

    .label {
      font-size: 0.8rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .title {
      font-size: 1.05rem;
      font-weight: 600;
      margin: 0.2rem 0;
    }

    .meta {
      display: flex;
      gap: 1rem;
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-top: 0.4rem;
    }

    .meta span {
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
    }

    .progress-label {
      display: block;
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }

    .button-text {
      display: block;
      margin-top: 0.35rem;
      font-weight: 600;
    }

    .percent {
      font-size: 0.85rem;
      color: var(--primary);
      font-weight: 600;
    }

    progress {
      width: 100%;
      appearance: none;
      height: 0.4rem;
      border-radius: 999px;
      margin: 0.35rem 0;
    }

    @media (max-width: 767px) {
      :host {
        padding: calc(var(--panel-padding) - 0.25rem);
      }

      button {
        padding: 0.75rem;
      }

      .title {
        font-size: 0.95rem;
      }
    }
  `;

  render() {
    return html`
      <section aria-labelledby="catalog-heading">
        <h2 id="catalog-heading">Каталог уроков</h2>
        <ul>
          ${this.lessons.map((lesson) => this.renderLesson(lesson))}
        </ul>
      </section>
    `;
  }

  private renderLesson(lesson: LessonCard) {
    const disabled = lesson.status === 'locked';
    const active = lesson.status === 'active';
    return html`
      <li>
        <button
          class=${active ? 'active' : ''}
          ?disabled=${disabled}
          aria-pressed=${active}
          @click=${() => this.handleSelect(lesson.id)}
        >
          <span class="label">
            ${lesson.difficulty} • ${lesson.durationMinutes} мин • ${lesson.levels}
            уровней
          </span>
          <div class="title">${lesson.title}</div>
          <p>${lesson.summary}</p>
          <progress
            max="100"
            value=${lesson.progress}
            aria-label="Прогресс по уроку «${lesson.title}»"
          ></progress>
          <div class="meta">
            <span>${lesson.levelsCompleted} / ${lesson.levels} уровней</span>
            <span class="percent">${lesson.percentCorrect}% правильных</span>
          </div>
          <span class="progress-label">${this.renderLessonStatus(lesson)}</span>
          <span class="button-text">${this.renderButtonLabel(lesson)}</span>
        </button>
      </li>
    `;
  }

  private renderLessonStatus(lesson: LessonCard) {
    switch (lesson.status) {
      case 'locked':
        return 'Заблокирован — выполните 80% предыдущего урока';
      case 'active':
        return 'В процессе';
      case 'completed':
        return 'Завершён';
      default:
        return 'Готов к старту';
    }
  }

  private renderButtonLabel(lesson: LessonCard) {
    if (lesson.status === 'locked') {
      return 'Недоступно';
    }
    if (lesson.status === 'active') {
      return 'Продолжить';
    }
    if (lesson.status === 'completed') {
      return 'Пройти заново';
    }
    return 'Начать';
  }

  private handleSelect(lessonId: string) {
    this.dispatchEvent(
      new CustomEvent('lesson-selected', {
        detail: { lessonId },
        bubbles: true,
        composed: true,
      }),
    );
  }
}
