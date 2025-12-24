import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
import '../components/score-board';
import type { ScoreState } from '../lib/session-store';

type ScoreBoardArgs = {
  data: ScoreState;
};

const baseData: ScoreState = {
  totalScore: 180,
  attempts: 6,
  correct: 5,
  accuracy: 83,
  currentStreak: 3,
  longestStreak: 5,
  hintsUsed: 2,
  hintsRemaining: 1,
};

const meta: Meta<ScoreBoardArgs> = {
  title: 'Components/Score Board',
  tags: ['autodocs'],
  args: {
    data: baseData,
  },
};

export default meta;
type Story = StoryObj<ScoreBoardArgs>;

const Template = ({ data }: ScoreBoardArgs) =>
  html`<score-board .data=${data}></score-board>`;

export const Default: Story = {
  render: Template,
};

export const PerfectRun: Story = {
  args: {
    data: {
      ...baseData,
      totalScore: 320,
      attempts: 10,
      correct: 10,
      accuracy: 100,
      currentStreak: 10,
      longestStreak: 10,
      hintsUsed: 0,
      hintsRemaining: 2,
    },
  },
  render: Template,
};
