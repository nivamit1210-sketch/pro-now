import { EventEmitter } from "node:events";

/**
 * Every job event, as it is written, to whoever is listening for that job
 * (docs/21 W6; W9 widens it to offers and location).
 *
 * In process, which is correct for the one API instance this runs as. A
 * second instance needs a shared channel (Postgres LISTEN/NOTIFY or Redis)
 * behind this same interface.
 *
 * The socket carries the fact that something changed, never the state
 * itself: clients re-read the job over REST (docs/06 §WebSocket), so a
 * missed or reordered message costs a refresh, not a wrong screen.
 */
export interface JobEventNotice {
  jobId: string;
  type: string;
  at: string;
  /** Who wrote it, and what it carried: for the notifications dispatcher, never sent to clients. */
  actor?: string;
  metadata?: unknown;
}

const ALL = Symbol("all-jobs");

export class JobEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // One listener per open socket; a busy job may have a few of each.
    this.emitter.setMaxListeners(0);
  }

  publish(notice: JobEventNotice): void {
    this.emitter.emit(notice.jobId, notice);
    this.emitter.emit(ALL, notice);
  }

  /** Every job's events: the notifications dispatcher listens here. */
  subscribeAll(listener: (notice: JobEventNotice) => void): () => void {
    this.emitter.on(ALL, listener);
    return () => this.emitter.off(ALL, listener);
  }

  subscribe(jobId: string, listener: (notice: JobEventNotice) => void): () => void {
    this.emitter.on(jobId, listener);
    return () => this.emitter.off(jobId, listener);
  }
}
