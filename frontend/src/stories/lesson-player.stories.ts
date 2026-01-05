import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
import '../components/lesson-player';
import type { LessonStoreSnapshot, ScoreState, TimerState } from '../lib/session-store';

type LessonPlayerArgs = {
  session?: LessonStoreSnapshot['activeSession'];
  timer?: TimerState;
  scoreboard?: ScoreState;
  hotkeysEnabled: boolean;
};

const activeSession: NonNullable<LessonStoreSnapshot['activeSession']> = {
  id: 'session-1',
  lessonId: 'intro-grammar-course',
  taskId: 'intro-grammar',
  title: 'Тренировка: сложные предложения',
  description: 'Сформулируйте аргумент и приведите пример.',
  expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  startedAt: new Date().toISOString(),
  answerDraft: '',
};

const timer: TimerState = {
  status: 'running',
  totalSeconds: 600,
  remainingSeconds: 540,
  lastUpdated: new Date().toISOString(),
};

const scoreboard: ScoreState = {
  totalScore: 210,
  attempts: 4,
  correct: 3,
  accuracy: 75,
  currentStreak: 2,
  longestStreak: 4,
  hintsUsed: 1,
  hintsRemaining: 1,
};

const meta: Meta<LessonPlayerArgs> = {
  title: 'Components/Lesson Player',
  tags: ['autodocs'],
  args: {
    session: activeSession,
    timer,
    scoreboard,
    hotkeysEnabled: true,
  },
};

export default meta;
type Story = StoryObj<LessonPlayerArgs>;

const Template = ({ session, timer, scoreboard, hotkeysEnabled }: LessonPlayerArgs) =>
  html`<lesson-player
    .session=${session}
    .timer=${timer}
    .scoreboard=${scoreboard}
    .hotkeysEnabled=${hotkeysEnabled}
  ></lesson-player>`;

export const ActiveSession: Story = {
  render: Template,
};

export const NoLessonSelected: Story = {
  args: {
    session: undefined,
    timer: undefined,
    scoreboard: undefined,
  },
  render: Template,
};
