import type { AnalyticsEnvelope } from './api-types';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';

export function sendAnalyticsEvent(event: AnalyticsEnvelope) {
  const url = `${API_BASE}/sessions/${event.sessionId}/events`;
  const body = JSON.stringify({
    average_keypress_ms: event.averageKeypressMs,
    burst_keypresses: event.burstKeypresses,
    source: event.source,
    recorded_at: event.recordedAt,
    user_id: event.userId,
  });

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    navigator.sendBeacon(url, blob);
  } else {
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
      keepalive: true,
    }).catch((error) => {
      console.warn('Analytics beacon failed', error);
    });
  }
}
