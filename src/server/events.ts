import { EventEmitter } from 'node:events';
import { makeId, nowIso } from './time.js';
import type { BuneDb } from './db.js';
import type { AuditEvent } from './types.js';

export class EventBus {
  private readonly emitter = new EventEmitter();

  constructor(private readonly db: BuneDb) {}

  emitEvent(input: Omit<AuditEvent, 'id' | 'createdAt'>): AuditEvent {
    const event: AuditEvent = {
      id: makeId('evt'),
      createdAt: nowIso(),
      ...input
    };
    this.db.insertEvent(event);
    this.emitter.emit('event', event);
    return event;
  }

  onEvent(listener: (event: AuditEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }
}
