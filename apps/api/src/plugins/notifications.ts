import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import type { NotificationProvider } from "@pro-now/types";
import { UserEventBus } from "../realtime/user-event-bus.js";
import { createWebPushProvider, noPushProvider } from "../infra/notifications/web-push.js";
import { notifyForJobEvent } from "../domain/notifications/dispatch.js";
import { drainEmailOutbox } from "../domain/notifications/email-outbox.js";

/**
 * Notifications (docs/21 W9): the per-user channel, the dispatcher on the
 * job event bus, Web Push when VAPID keys are set, and the email outbox
 * worker. After prisma and auth (it uses app.email).
 */
declare module "fastify" {
  interface FastifyInstance {
    userEvents: UserEventBus;
    push: NotificationProvider;
    drainEmailNow: () => Promise<void>;
  }
}

const OUTBOX_EVERY_MS = 20_000;

export default fp(async (app: FastifyInstance) => {
  const c = app.config;
  const users = new UserEventBus();
  const push =
    c.VAPID_PUBLIC_KEY && c.VAPID_PRIVATE_KEY && c.VAPID_SUBJECT
      ? createWebPushProvider(app.prisma, { publicKey: c.VAPID_PUBLIC_KEY, privateKey: c.VAPID_PRIVATE_KEY, subject: c.VAPID_SUBJECT })
      : noPushProvider;
  app.decorate("userEvents", users);
  app.decorate("push", push);

  const stop = app.jobEvents.subscribeAll((notice) => {
    void notifyForJobEvent({ prisma: app.prisma, push, users, log: app.log }, notice).catch((err: unknown) =>
      app.log.warn({ err: (err as Error).message, type: notice.type }, "notifications failed")
    );
  });

  let draining = false;
  const drain = async () => {
    if (draining) return;
    draining = true;
    try {
      const r = await drainEmailOutbox(app.prisma, app.email);
      if (r.sent || r.failed) app.log.info(r, "email outbox");
    } catch (err) {
      app.log.error({ err }, "email outbox failed");
    } finally {
      draining = false;
    }
  };
  const timer = setInterval(() => void drain(), OUTBOX_EVERY_MS);
  timer.unref?.();
  app.decorate("drainEmailNow", drain);
  app.addHook("onClose", async () => {
    stop();
    clearInterval(timer);
  });
  app.log.info({ push: push.vendorName }, "notifications configured");
});
