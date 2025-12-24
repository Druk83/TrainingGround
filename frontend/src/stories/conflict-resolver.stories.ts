import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
import '../components/conflict-resolver';
import type { OfflineOperation } from '../lib/offline-queue';

type ConflictArgs = {
  conflicts: OfflineOperation[];
};

const newId = () => `op-${Math.random().toString(36).slice(2, 8)}`;

const sampleConflict = (overrides: Partial<OfflineOperation> = {}): OfflineOperation => ({
  id: newId(),
  type: 'answer',
  sessionId: 'session-42',
  payload: { answer: 'Вариант B', createdAt: new Date().toISOString() },
  createdAt: Date.now(),
  attempts: 1,
  ...overrides,
});

const meta: Meta<ConflictArgs> = {
  title: 'Components/Conflict Resolver',
  tags: ['autodocs'],
  args: {
    conflicts: [sampleConflict()],
  },
};

export default meta;
type Story = StoryObj<ConflictArgs>;

const Template = ({ conflicts }: ConflictArgs) =>
  html`<conflict-resolver .conflicts=${conflicts}></conflict-resolver>`;

export const SingleConflict: Story = {
  render: Template,
};

export const MultipleConflicts: Story = {
  args: {
    conflicts: [
      sampleConflict({ id: 'op-1', type: 'answer' }),
      sampleConflict({
        id: 'op-2',
        type: 'hint',
        payload: { topic_id: 'grammar', requestedAt: new Date().toISOString() },
      }),
    ],
  },
  render: Template,
};

export const NoConflicts: Story = {
  args: {
    conflicts: [],
  },
  render: Template,
};
