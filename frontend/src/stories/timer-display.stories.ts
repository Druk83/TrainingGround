import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
import '../components/timer-display';
import type { TimerState } from '../lib/session-store';

type TimerArgs = {
  data: TimerState;
};

const meta: Meta<TimerArgs> = {
  title: 'Components/Timer Display',
  tags: ['autodocs'],
  args: {
    data: {
      status: 'running',
      totalSeconds: 600,
      remainingSeconds: 520,
      lastUpdated: new Date().toISOString(),
    },
  },
};

export default meta;

type Story = StoryObj<TimerArgs>;

const Template = ({ data }: TimerArgs) =>
  html`<timer-display .data=${data}></timer-display>`;

export const Running: Story = {
  render: Template,
};

export const Expired: Story = {
  args: {
    data: {
      status: 'expired',
      totalSeconds: 600,
      remainingSeconds: 0,
      lastUpdated: new Date().toISOString(),
    },
  },
  render: Template,
};
