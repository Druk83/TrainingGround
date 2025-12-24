/// <reference types="mocha" />
import { html, fixture, expect, oneEvent } from '@open-wc/testing';
import '../../src/components/connection-indicator';
import type { ConnectionIndicator } from '../../src/components/connection-indicator';

describe('connection-indicator', () => {
  it('reflects connectivity state and queue metrics', async () => {
    const element = await fixture<ConnectionIndicator>(
      html`<connection-indicator></connection-indicator>`,
    );
    element.online = false;
    element.queueSize = 3;
    element.conflicts = 1;
    element.message = 'Нет подключения';
    await element.updateComplete;

    const status = element.shadowRoot?.querySelector('.status')?.textContent ?? '';
    expect(status).to.include('Офлайн');
    expect(status).to.include('Очередь: 3');
    expect(status).to.include('Конфликты: 1');
    expect(status).to.include('Нет подключения');
  });

  it('emits sync-request when clicking the button', async () => {
    const element = await fixture<ConnectionIndicator>(
      html`<connection-indicator></connection-indicator>`,
    );
    const request = oneEvent(element, 'sync-request');
    element.shadowRoot?.querySelector('button')?.click();
    await request;
  });
});
