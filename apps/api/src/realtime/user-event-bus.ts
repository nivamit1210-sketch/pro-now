import { EventEmitter } from "node:events";

/**
 * What one person should hear right now, whichever job it is about
 * (docs/21 W9): a new offer for a professional, a notification for anyone.
 * In process, like the job bus; the socket carries it, REST stays the truth.
 */
export interface UserNotice {
  type: "OFFER" | "NOTIFICATION";
  title?: string;
  body?: string;
  url?: string;
  jobId?: string;
}

export class UserEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(userId: string, notice: UserNotice): void {
    this.emitter.emit(userId, notice);
  }

  subscribe(userId: string, listener: (notice: UserNotice) => void): () => void {
    this.emitter.on(userId, listener);
    return () => this.emitter.off(userId, listener);
  }
}
