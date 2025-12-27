/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import {
  NetworkFirst,
  CacheFirst,
  StaleWhileRevalidate,
  NetworkOnly,
} from 'workbox-strategies';
import { BackgroundSyncPlugin } from 'workbox-background-sync';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string }>;
};

// ============================================================================
// Subresource Integrity (SRI) Verification
// ============================================================================

interface SRIManifest {
  [filename: string]: {
    integrity: string;
    size: number;
  };
}

let sriManifest: SRIManifest | null = null;

/**
 * Load SRI manifest on Service Worker installation
 */
async function loadSRIManifest(): Promise<void> {
  try {
    const response = await fetch('/sri-manifest.json', { cache: 'no-cache' });
    if (response.ok) {
      sriManifest = await response.json();
      console.log(
        'SRI manifest loaded:',
        Object.keys(sriManifest || {}).length,
        'entries',
      );
    }
  } catch (error) {
    console.warn('Failed to load SRI manifest:', error);
  }
}

/**
 * Verify SRI integrity hash for a response
 * @param response - Response to verify
 * @param expectedIntegrity - Expected integrity hash (e.g., "sha384-...")
 * @returns true if integrity matches, false otherwise
 */
async function verifySRI(
  response: Response,
  expectedIntegrity: string,
): Promise<boolean> {
  if (!expectedIntegrity || !expectedIntegrity.startsWith('sha384-')) {
    return true; // No SRI check required
  }

  try {
    const clone = response.clone();
    const buffer = await clone.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-384', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashBase64 = btoa(String.fromCharCode(...hashArray));
    const computedIntegrity = `sha384-${hashBase64}`;

    const match = computedIntegrity === expectedIntegrity;
    if (!match) {
      console.error('SRI verification failed:', {
        url: response.url,
        expected: expectedIntegrity,
        computed: computedIntegrity,
      });
    }
    return match;
  } catch (error) {
    console.error('SRI verification error:', error);
    return false;
  }
}

/**
 * Get expected SRI hash for a URL
 */
function getExpectedSRI(url: string): string | null {
  if (!sriManifest) return null;

  // Extract filename from URL
  const urlObj = new URL(url);
  const pathname = urlObj.pathname;

  // Try exact match first
  const filename = pathname.substring(1); // Remove leading /
  if (sriManifest[filename]) {
    return sriManifest[filename].integrity;
  }

  // Try matching by basename for hashed files
  for (const [key, value] of Object.entries(sriManifest)) {
    if (
      pathname.includes(key) ||
      key.includes(pathname.substring(pathname.lastIndexOf('/') + 1))
    ) {
      return value.integrity;
    }
  }

  return null;
}

// Precache and route static assets
precacheAndRoute(self.__WB_MANIFEST);

// Skip waiting and claim clients immediately
self.skipWaiting();
clientsClaim();

// ============================================================================
// Cache Strategies
// ============================================================================

/**
 * Strategy 1: App Shell - Network First with fallback
 * For HTML navigation requests (pages)
 */
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'tg-shell-v1',
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 24 * 60 * 60, // 24 hours
      }),
    ],
  }),
);

/**
 * Strategy 2: API Requests - Network First
 * Prioritize fresh data, fallback to cache if offline
 */
registerRoute(
  ({ url, request }) =>
    request.method === 'GET' &&
    url.origin === self.location.origin &&
    url.pathname.startsWith('/api'),
  new NetworkFirst({
    cacheName: 'tg-api-v1',
    networkTimeoutSeconds: 3,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 5 * 60, // 5 minutes
      }),
    ],
  }),
);

/**
 * SRI Verification Plugin for Workbox
 * Verifies integrity of cached responses before serving
 */
class SRIPlugin {
  async cacheWillUpdate({ response }: any): Promise<Response | null> {
    const expectedIntegrity = getExpectedSRI(response.url);

    if (expectedIntegrity) {
      const isValid = await verifySRI(response, expectedIntegrity);
      if (!isValid) {
        console.error('SRI verification failed, blocking cache:', response.url);
        return null; // Don't cache invalid response
      }
    }

    return response;
  }

  async cachedResponseWillBeUsed(param: any): Promise<Response | undefined | null> {
    const { cachedResponse } = param;
    if (!cachedResponse) return cachedResponse;

    const expectedIntegrity = getExpectedSRI(cachedResponse.url);

    if (expectedIntegrity) {
      const isValid = await verifySRI(cachedResponse, expectedIntegrity);
      if (!isValid) {
        console.error('Cached response failed SRI verification:', cachedResponse.url);
        return null; // Don't serve invalid cached response
      }
    }

    return cachedResponse;
  }
}

const sriPlugin = new SRIPlugin();

/**
 * Strategy 3: Static Assets (JS, CSS) - Cache First with SRI
 * Serve from cache immediately, update in background
 */
registerRoute(
  ({ request }) => request.destination === 'script' || request.destination === 'style',
  new CacheFirst({
    cacheName: 'tg-static-assets-v1',
    plugins: [
      sriPlugin,
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      }),
    ],
  }),
);

/**
 * Strategy 4: Images - Cache First with long TTL
 */
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'tg-images-v1',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        purgeOnQuotaError: true, // Auto-delete if quota exceeded
      }),
    ],
  }),
);

/**
 * Strategy 5: Fonts - Cache First with very long TTL
 */
registerRoute(
  ({ request }) => request.destination === 'font',
  new CacheFirst({
    cacheName: 'tg-fonts-v1',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
      }),
    ],
  }),
);

/**
 * Strategy 6: Google Fonts - Stale While Revalidate
 */
registerRoute(
  ({ url }) =>
    url.origin === 'https://fonts.googleapis.com' ||
    url.origin === 'https://fonts.gstatic.com',
  new StaleWhileRevalidate({
    cacheName: 'tg-google-fonts-v1',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
      }),
    ],
  }),
);

// ============================================================================
// Background Sync for Offline POST Requests
// ============================================================================

/**
 * Background Sync Plugin
 * Queues failed POST requests and retries when online
 */
const bgSyncPlugin = new BackgroundSyncPlugin('tg-offline-queue', {
  maxRetentionTime: 24 * 60, // Retry for up to 24 hours (in minutes)
  onSync: async ({ queue }) => {
    let entry;
    while ((entry = await queue.shiftRequest())) {
      try {
        await fetch(entry.request);
        console.log('Background sync: successfully replayed request', entry.request.url);
      } catch (error) {
        console.error(
          'Background sync: failed to replay request',
          entry.request.url,
          error,
        );
        // Re-queue if still failing
        await queue.unshiftRequest(entry);
        throw error;
      }
    }
  },
});

/**
 * POST requests to sessions API - Network Only with Background Sync
 * Used for saving answers, hints, and progress
 */
registerRoute(
  ({ url, request }) =>
    request.method === 'POST' &&
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/api/v1/sessions/') ||
      url.pathname.startsWith('/api/v1/progress/')),
  new NetworkOnly({
    plugins: [bgSyncPlugin],
  }),
  'POST',
);

/**
 * Auth POST requests - Network Only (no caching for security)
 */
registerRoute(
  ({ url, request }) =>
    request.method === 'POST' &&
    url.origin === self.location.origin &&
    url.pathname.startsWith('/api/v1/auth/'),
  new NetworkOnly(),
  'POST',
);

// ============================================================================
// Offline Fallback
// ============================================================================

/**
 * Global catch handler for offline scenarios
 * Returns cached content or offline fallback page
 */
setCatchHandler(async ({ request }) => {
  // For navigation requests, try to return cached HTML or offline page
  if (request.destination === 'document') {
    // Try to get cached version of the requested page
    const cache = await caches.open('tg-shell-v1');
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    // If no cached page, return the app shell (index.html)
    const appShell = await cache.match('/index.html');
    if (appShell) {
      return appShell;
    }

    // Last resort: return a basic offline HTML
    return new Response(
      `<!DOCTYPE html>
      <html lang="ru">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Оффлайн - TrainingGround</title>
          <style>
            body {
              margin: 0;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              background: radial-gradient(circle at top, #162740, #050914);
              color: #f8fafc;
              font-family: 'Inter', system-ui, sans-serif;
              text-align: center;
              padding: 1rem;
            }
            .offline-container {
              max-width: 500px;
            }
            h1 {
              font-size: 2rem;
              margin-bottom: 1rem;
              background: linear-gradient(135deg, #2563eb 0%, #764ba2 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
            }
            p {
              color: #93adc9;
              line-height: 1.6;
            }
            button {
              margin-top: 2rem;
              padding: 0.75rem 2rem;
              background: linear-gradient(135deg, #2563eb 0%, #764ba2 100%);
              color: white;
              border: none;
              border-radius: 0.5rem;
              font-size: 1rem;
              font-weight: 600;
              cursor: pointer;
              font-family: inherit;
            }
            button:hover {
              opacity: 0.9;
            }
          </style>
        </head>
        <body>
          <div class="offline-container">
            <h1>Нет подключения к интернету</h1>
            <p>Вы находитесь в оффлайн-режиме. Некоторые функции могут быть недоступны.</p>
            <p>Ваш прогресс будет сохранен автоматически, когда соединение восстановится.</p>
            <button onclick="location.reload()">Попробовать снова</button>
          </div>
        </body>
      </html>`,
      {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      },
    );
  }

  // For API requests, return error with offline message
  if (request.url.includes('/api/')) {
    return new Response(
      JSON.stringify({
        error: 'offline',
        message: 'Нет подключения к интернету. Запрос будет повторен автоматически.',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  // Default: return network error
  return Response.error();
});

// ============================================================================
// Service Worker Lifecycle Events
// ============================================================================

/**
 * Handle SW messages (e.g., skip waiting)
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/**
 * Handle install event - precache critical resources and load SRI manifest
 */
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');

  // Pre-cache critical offline resources and load SRI manifest
  event.waitUntil(
    (async () => {
      try {
        // Load SRI manifest first
        await loadSRIManifest();

        // Then cache critical resources
        const cache = await caches.open('tg-critical-v1');
        await cache.addAll([
          '/',
          '/index.html',
          '/manifest.webmanifest',
          '/sri-manifest.json',
        ]);
      } catch (error) {
        console.error('Failed to cache critical resources:', error);
      }
    })(),
  );
});

/**
 * Handle activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');

  const currentCaches = [
    'tg-shell-v1',
    'tg-api-v1',
    'tg-static-assets-v1',
    'tg-images-v1',
    'tg-fonts-v1',
    'tg-google-fonts-v1',
    'tg-critical-v1',
  ];

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!currentCaches.includes(cacheName)) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        }),
      );
    }),
  );
});

/**
 * Periodic background sync for checking updates
 */
self.addEventListener('periodicsync', (event: any) => {
  if (event.tag === 'check-updates') {
    event.waitUntil(checkForUpdates());
  }
});

async function checkForUpdates() {
  try {
    // Check if there are new updates available
    const response = await fetch('/api/v1/version', { cache: 'no-store' });
    if (response.ok) {
      const data = await response.json();
      // Notify clients about updates
      const clients = await self.clients.matchAll();
      clients.forEach((client) => {
        client.postMessage({
          type: 'VERSION_UPDATE',
          version: data.version,
        });
      });
    }
  } catch (error) {
    console.error('Failed to check for updates:', error);
  }
}
