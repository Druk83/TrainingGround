/// <reference types="mocha" />
import { html, fixture, expect, oneEvent } from '@open-wc/testing';
import '../../src/components/hint-panel';
import type { HintPanel } from '../../src/components/hint-panel';
import type { HintEntry, ExplanationEntry } from '../../src/lib/session-store';

const sampleHint = (overrides: Partial<HintEntry> = {}): HintEntry => ({
  id: 'hint-1',
  text: 'Подсказка 1',
  cost: 5,
  source: 'model',
  timestamp: Date.now(),
  ...overrides,
});

const sampleExplanation = (overrides: Partial<ExplanationEntry> = {}): ExplanationEntry => ({
  id: 'exp-1',
  text: 'Объяснение ответа',
  ruleRefs: ['1.1'],
  source: 'cache',
  tookMs: 15,
  generatedAt: new Date().toISOString(),
  ...overrides,
});

describe('hint-panel', () => {
  it('renders existing hints and explanations', async () => {
    const element = await fixture<HintPanel>(html`<hint-panel></hint-panel>`);
    element.hints = [sampleHint({ text: 'Первый совет' })];
    element.explanations = [sampleExplanation({ text: 'Подробное объяснение' })];
    await element.updateComplete;

    const shadowText = element.shadowRoot?.textContent ?? '';
    expect(shadowText).to.include('Первый совет');
    expect(shadowText).to.include('Подробное объяснение');
    expect(shadowText).to.include('Стоимость');
  });

  it('emits request-hint when the button is clicked', async () => {
    const element = await fixture<HintPanel>(html`<hint-panel></hint-panel>`);
    const eventPromise = oneEvent(element, 'request-hint');
    element.shadowRoot?.querySelector('button')?.click();
    await eventPromise;
  });

  it('disables request button when hint limit is reached', async () => {
    const element = await fixture<HintPanel>(html`
      <hint-panel
        .availableHints=${0}
        .maxHints=${2}
        .hotkeysEnabled=${false}
      ></hint-panel>
    `);
    await element.updateComplete;

    const button = element.shadowRoot?.querySelector('button');
    expect(button?.hasAttribute('disabled')).to.be.true;
    const limitMessage = element.shadowRoot?.querySelector('.hint-limit');
    expect(limitMessage?.textContent).to.include('Лимит подсказок');
  });
});
