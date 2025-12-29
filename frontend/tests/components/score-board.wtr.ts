/// <reference types="mocha" />
import { html, fixture, expect } from '@open-wc/testing';
import '../../src/components/score-board';
import type { ScoreBoard } from '../../src/components/score-board';

describe('score-board', () => {
  it('shows key metrics and exposes aria-live status', async () => {
    const element = await fixture<ScoreBoard>(html`<score-board></score-board>`);
    element.data = {
      totalScore: 150,
      attempts: 2,
      correct: 2,
      accuracy: 100,
      currentStreak: 2,
      longestStreak: 5,
      hintsUsed: 1,
      hintsRemaining: 1,
    };
    await element.updateComplete;

    const cards = element.shadowRoot?.querySelectorAll('.card') ?? [];
    expect(cards[0].textContent).to.include('150');
    expect(cards[1].textContent).to.include('100%');

    const statusRegion = element.shadowRoot?.querySelector('section');
    expect(statusRegion?.getAttribute('role')).to.equal('status');
    const liveRegion = element.shadowRoot?.querySelector('[aria-live="polite"]');
    expect(liveRegion?.textContent).to.include('Баллы: 150');
  });

  it('shows delta message for recent scoring changes', async () => {
    const element = await fixture<ScoreBoard>(html`<score-board></score-board>`);
    element.data = {
      totalScore: 200,
      attempts: 4,
      correct: 4,
      accuracy: 100,
      currentStreak: 4,
      longestStreak: 4,
      hintsUsed: 0,
      hintsRemaining: 2,
      lastScoreDelta: 15,
      lastBonusApplied: true,
    };
    await element.updateComplete;

    const delta = element.shadowRoot?.querySelector('.delta');
    expect(delta?.textContent).to.include('+15 баллов');
    expect(delta?.textContent).to.include('бонус за серию');
  });

  it('shows hint penalty message when applicable', async () => {
    const element = await fixture<ScoreBoard>(html`<score-board></score-board>`);
    element.data = {
      totalScore: 130,
      attempts: 2,
      correct: 1,
      accuracy: 50,
      currentStreak: 0,
      longestStreak: 1,
      hintsUsed: 1,
      hintsRemaining: 1,
      lastScoreDelta: -5,
      lastHintPenalty: -5,
    };
    await element.updateComplete;

    const delta = element.shadowRoot?.querySelector('.delta');
    expect(delta?.textContent).to.include('Штраф');
    expect(delta?.textContent).to.include('-5');
  });
});
