/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate, NetworkOnly } from 'workbox-strategies';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string }>;
};

precacheAndRoute(self.__WB_MANIFEST);
self.skipWaiting();
clientsClaim();

registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({ cacheName: 'tg-shell' }),
);

registerRoute(
  ({ url, request }) =>
    request.method === 'GET' &&
    url.origin === self.location.origin &&
    url.pathname.startsWith('/api'),
  new NetworkFirst({
    cacheName: 'tg-api-cache',
    networkTimeoutSeconds: 3,
  }),
);

registerRoute(
  ({ request }) => request.destination === 'style' || request.destination === 'script',
  new StaleWhileRevalidate({ cacheName: 'tg-assets' }),
);

const bgSync = new BackgroundSyncPlugin('tg-offline-queue', {
  maxRetentionTime: 24 * 60,
});

registerRoute(
  ({ url, request }) =>
    request.method === 'POST' &&
    url.origin === self.location.origin &&
    url.pathname.startsWith('/api/v1/sessions/') &&
    /(answers|hints)/.test(url.pathname),
  new NetworkOnly({ plugins: [bgSync] }),
  'POST',
);

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

setCatchHandler(async ({ event }) => {
  const request = (event as FetchEvent).request;
  if (request.destination === 'document') {
    const cached = await caches.match('/index.html');
    if (cached) {
      return cached;
    }
  }
  return Response.error();
});
