import type { TimerEvent } from './api-types';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';

export type TimerListener = (event: TimerEvent) => void;

export class TimerStream {
  private eventSource?: EventSource;
  private sessionId?: string;
  private listeners = new Set<TimerListener>();

  connect(sessionId: string) {
    if (this.sessionId === sessionId && this.eventSource) {
      return;
    }

    this.disconnect();
    this.sessionId = sessionId;
    const url = `${API_BASE}/sessions/${sessionId}/stream`;
    this.eventSource = new EventSource(url);

    this.eventSource.addEventListener('timer-tick', (evt) => {
      this.handleEvent(evt as MessageEvent<string>);
    });
    this.eventSource.addEventListener('time-expired', (evt) => {
      this.handleEvent(evt as MessageEvent<string>);
    });
    this.eventSource.onerror = () => {
      console.warn('Timer SSE disconnected, retrying in 2s');
      setTimeout(() => {
        if (this.sessionId) {
          this.connect(this.sessionId);
        }
      }, 2000);
    };
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }
    this.sessionId = undefined;
  }

  subscribe(listener: TimerListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private handleEvent(evt: MessageEvent<string>) {
    try {
      const data = JSON.parse(evt.data) as TimerEvent;
      this.listeners.forEach((listener) => listener(data));
    } catch (error) {
      console.warn('Failed to parse timer event', error);
    }
  }
}
