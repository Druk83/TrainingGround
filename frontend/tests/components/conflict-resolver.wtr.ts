/// <reference types="mocha" />
import { html, fixture, expect, oneEvent } from '@open-wc/testing';
import '../../src/components/conflict-resolver';
import type { ConflictResolver } from '../../src/components/conflict-resolver';
import type { OfflineOperation } from '../../src/lib/offline-queue';

const makeConflict = (overrides: Partial<OfflineOperation> = {}): OfflineOperation => ({
  id: 'op-1',
  type: 'answer',
  sessionId: 'session-1',
  payload: { answer: '42' },
  createdAt: Date.now(),
  attempts: 0,
  ...overrides,
});

describe('conflict-resolver', () => {
  it('lists conflicts with metadata and payload preview', async () => {
    const element = await fixture<ConflictResolver>(html`<conflict-resolver></conflict-resolver>`);
    element.conflicts = [makeConflict()];
    await element.updateComplete;

    const rows = element.shadowRoot?.querySelectorAll('li') ?? [];
    expect(rows.length).to.equal(1);
    expect(rows[0].textContent).to.include('Тип: answer');
    expect(rows[0].textContent).to.include('Сессия: session-1');
  });

  it('emits resolve-conflict with selected action', async () => {
    const element = await fixture<ConflictResolver>(html`<conflict-resolver></conflict-resolver>`);
    element.conflicts = [makeConflict()];
    await element.updateComplete;

    const eventPromise = oneEvent(element, 'resolve-conflict');
    (element.shadowRoot?.querySelector('button.primary') as HTMLButtonElement)?.click();
    const event = await eventPromise;
    expect(event.detail.operationId).to.equal('op-1');
    expect(event.detail.resolution).to.equal('accept-server');
  });

  it('emits clear-conflicts from bulk action button', async () => {
    const element = await fixture<ConflictResolver>(html`<conflict-resolver></conflict-resolver>`);
    element.conflicts = [makeConflict({ id: 'op-2' })];
    await element.updateComplete;

    const eventPromise = oneEvent(element, 'clear-conflicts');
    (element.shadowRoot?.querySelector('.toolbar button') as HTMLButtonElement)?.click();
    await eventPromise;
  });
});
