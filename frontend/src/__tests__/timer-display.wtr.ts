import { html, fixture, expect } from '@open-wc/testing';
import '../components/timer-display';
import type { TimerDisplay } from '../components/timer-display';

describe('timer-display', () => {
  it('shows remaining time', async () => {
    const el = await fixture<TimerDisplay>(html`<timer-display></timer-display>`);
    el.data = { status: 'running', remainingSeconds: 125, totalSeconds: 300 };
    await el.updateComplete;
    expect(el.shadowRoot?.textContent).to.contain('02:05');
  });
});
