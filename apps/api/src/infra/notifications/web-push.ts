import webpush from "web-push";
import type { PrismaClient } from "@prisma/client";
import type { NotificationProvider, PushMessage } from "@pro-now/types";

/**
 * Web Push with our own VAPID keys (docs/21 W9): no third-party push
 * vendor, the browser's own push service. A subscription the push service
 * says is gone (404/410) is deleted; anything else is left for next time.
 */
export function createWebPushProvider(
  db: PrismaClient,
  keys: { publicKey: string; privateKey: string; subject: string },
  send: typeof webpush.sendNotification = webpush.sendNotification.bind(webpush)
): NotificationProvider {
  return {
    vendorName: "web-push",
    isSandbox: false,
    async sendPush(message: PushMessage) {
      const subs = await db.pushSubscription.findMany({ where: { userId: message.userId } });
      let delivered = false;
      for (const s of subs) {
        try {
          await send(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title: message.title, body: message.body, data: message.data ?? {} }),
            { vapidDetails: keys, TTL: 60 * 60 }
          );
          delivered = true;
          await db.pushSubscription.update({ where: { id: s.id }, data: { lastSuccessAt: new Date() } });
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        }
      }
      return { delivered };
    },
  };
}

/** No VAPID keys configured: push is off; in-app and email still work. */
export const noPushProvider: NotificationProvider = {
  vendorName: "none",
  isSandbox: false,
  async sendPush() {
    return { delivered: false };
  },
};
