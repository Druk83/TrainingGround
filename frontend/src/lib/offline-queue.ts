import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { nanoid } from 'nanoid';

type OperationType = 'answer' | 'hint';

export interface OfflineOperation {
  id: string;
  type: OperationType;
  sessionId: string;
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
}

interface OfflineQueueDb extends DBSchema {
  operations: {
    key: string;
    value: OfflineOperation;
    indexes: { 'by-created': number };
  };
}

export interface FlushResult {
  synced: string[];
  conflicts: OfflineOperation[];
  failures: OfflineOperation[];
}

export type OfflineQueueEvent =
  | { type: 'synced'; ids: string[] }
  | { type: 'conflict'; operations: OfflineOperation[] }
  | { type: 'queued'; operation: OfflineOperation };

export interface OperationResult {
  ok: boolean;
  status: number;
}

export type OperationHandler = (operation: OfflineOperation) => Promise<OperationResult>;

export class OfflineQueue extends EventTarget {
  private dbPromise?: Promise<IDBPDatabase<OfflineQueueDb>>;
  private enabled = typeof indexedDB !== 'undefined';
  private dbName: string;

  constructor(dbName = 'lesson-offline') {
    super();
    this.dbName = dbName;
    if (this.enabled) {
      this.dbPromise = openDB<OfflineQueueDb>(this.dbName, 1, {
        upgrade(db) {
          const store = db.createObjectStore('operations', { keyPath: 'id' });
          store.createIndex('by-created', 'createdAt');
        },
      });
    } else {
      console.warn('IndexedDB is unavailable; offline queue disabled');
    }
  }

  async enqueue(
    type: OperationType,
    sessionId: string,
    payload: Record<string, unknown>,
  ) {
    if (!this.dbPromise) {
      return;
    }

    const operation: OfflineOperation = {
      id: nanoid(),
      type,
      sessionId,
      payload,
      createdAt: Date.now(),
      attempts: 0,
    };

    const db = await this.dbPromise;
    await db.put('operations', operation);
    this.dispatch({ type: 'queued', operation });
  }

  async list() {
    if (!this.dbPromise) {
      return [];
    }
    const db = await this.dbPromise;
    return db.getAllFromIndex('operations', 'by-created');
  }

  async flush(handlers: Record<OperationType, OperationHandler>): Promise<FlushResult> {
    if (!this.dbPromise) {
      return { synced: [], conflicts: [], failures: [] };
    }

    const ops = await this.list();
    const synced: string[] = [];
    const conflicts: OfflineOperation[] = [];
    const failures: OfflineOperation[] = [];

    for (const operation of ops) {
      const handler = handlers[operation.type];
      if (!handler) {
        failures.push(operation);
        continue;
      }

      try {
        const result = await handler(operation);
        if (result.ok) {
          await this.remove(operation.id);
          synced.push(operation.id);
        } else if (result.status === 409 || result.status === 410) {
          conflicts.push(operation);
          await this.remove(operation.id);
        } else {
          await this.bumpAttempts(operation.id);
          failures.push(operation);
        }
      } catch (error) {
        console.warn('Failed to flush operation', error);
        await this.bumpAttempts(operation.id);
        failures.push(operation);
      }
    }

    if (synced.length) {
      this.dispatch({ type: 'synced', ids: synced });
    }
    if (conflicts.length) {
      this.dispatch({ type: 'conflict', operations: conflicts });
    }

    return { synced, conflicts, failures };
  }

  async size() {
    if (!this.dbPromise) {
      return 0;
    }
    const db = await this.dbPromise;
    return db.count('operations');
  }

  private async remove(id: string) {
    if (!this.dbPromise) {
      return;
    }
    const db = await this.dbPromise;
    await db.delete('operations', id);
  }

  private async bumpAttempts(id: string) {
    if (!this.dbPromise) {
      return;
    }
    const db = await this.dbPromise;
    const operation = await db.get('operations', id);
    if (!operation) {
      return;
    }
    operation.attempts += 1;
    await db.put('operations', operation);
  }

  private dispatch(event: OfflineQueueEvent) {
    this.dispatchEvent(new CustomEvent('offline-queue', { detail: event }));
  }

  onEvent(handler: (event: OfflineQueueEvent) => void) {
    const listener = (evt: Event) => {
      const detail = (evt as CustomEvent<OfflineQueueEvent>).detail;
      handler(detail);
    };
    this.addEventListener('offline-queue', listener);
    return () => this.removeEventListener('offline-queue', listener);
  }
}
