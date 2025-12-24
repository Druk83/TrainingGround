import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
import '../components/connection-indicator';

type ConnectionArgs = {
  online: boolean;
  queueSize: number;
  syncing: boolean;
  message?: string;
  conflicts: number;
};

const meta: Meta<ConnectionArgs> = {
  title: 'Components/Connection Indicator',
  tags: ['autodocs'],
  args: {
    online: true,
    queueSize: 0,
    syncing: false,
    message: 'Все в порядке',
    conflicts: 0,
  },
};

export default meta;
type Story = StoryObj<ConnectionArgs>;

const Template = ({ online, queueSize, syncing, message, conflicts }: ConnectionArgs) =>
  html`<connection-indicator
    .online=${online}
    .queueSize=${queueSize}
    .syncing=${syncing}
    .message=${message}
    .conflicts=${conflicts}
  ></connection-indicator>`;

export const Online: Story = {
  render: Template,
};

export const OfflineWithQueue: Story = {
  args: {
    online: false,
    queueSize: 3,
    syncing: false,
    message: 'Нет подключения',
    conflicts: 1,
  },
  render: Template,
};

export const Syncing: Story = {
  args: {
    queueSize: 2,
    syncing: true,
    message: 'Синхронизация ответа...',
  },
  render: Template,
};
