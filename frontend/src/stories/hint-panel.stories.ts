import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
import '../components/hint-panel';
import type { HintEntry, ExplanationEntry } from '../lib/session-store';

type HintPanelArgs = {
  hints: HintEntry[];
  explanations: ExplanationEntry[];
  loading: boolean;
  error?: string;
  hotkeysEnabled: boolean;
  availableHints?: number;
  maxHints?: number;
};

const sampleHints: HintEntry[] = [
  {
    id: 'hint-1',
    text: 'Подумайте о порядке слов: подлежащее, сказуемое, дополнение.',
    cost: 5,
    source: 'coach',
    timestamp: Date.now() - 60_000,
  },
  {
    id: 'hint-2',
    text: 'Используйте вводную конструкцию, чтобы связать абзацы.',
    cost: 5,
    source: 'coach',
    timestamp: Date.now(),
  },
];

const sampleExplanations: ExplanationEntry[] = [
  {
    id: 'exp-1',
    text: 'Ответ основан на правиле согласования сказуемого с подлежащим.',
    ruleRefs: ['§53'],
    source: 'cache',
    tookMs: 120,
    generatedAt: new Date().toISOString(),
  },
];

const meta: Meta<HintPanelArgs> = {
  title: 'Components/Hint Panel',
  tags: ['autodocs'],
  args: {
    hints: sampleHints,
    explanations: sampleExplanations,
    loading: false,
    hotkeysEnabled: true,
    availableHints: 1,
    maxHints: 2,
  },
};

export default meta;
type Story = StoryObj<HintPanelArgs>;

const Template = ({
  hints,
  explanations,
  loading,
  error,
  hotkeysEnabled,
  availableHints,
  maxHints,
}: HintPanelArgs) =>
  html`<hint-panel
    .hints=${hints}
    .explanations=${explanations}
    .loading=${loading}
    .error=${error}
    .hotkeysEnabled=${hotkeysEnabled}
    .availableHints=${availableHints}
    .maxHints=${maxHints}
  ></hint-panel>`;

export const Ready: Story = {
  render: Template,
};

export const Loading: Story = {
  args: {
    hints: [],
    explanations: [],
    loading: true,
    hotkeysEnabled: false,
  },
  render: Template,
};

export const ErrorState: Story = {
  args: {
    hints: [],
    explanations: [],
    loading: false,
    error: 'Лимит подсказок исчерпан',
    availableHints: 0,
    maxHints: 2,
  },
  render: Template,
};

export const LimitReached: Story = {
  args: {
    hints: [],
    explanations: [],
    loading: false,
    availableHints: 0,
    maxHints: 2,
  },
  render: Template,
};
