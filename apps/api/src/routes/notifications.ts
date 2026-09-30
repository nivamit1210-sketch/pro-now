import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

/**
 * The inbox and the phone's push subscription (docs/21 W9).
 *
 * The inbox is where a missed push is still found; reading marks it read.
 * A subscription belongs to the signed-in person and is replaced when the
 * same browser subscribes again (the endpoint is unique).
 */
const subscriptionSchema = z
  .object({
    endpoint: z.string().url().max(1000),
    keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
  })
  .strict();

export default async function notificationRoutes(app: FastifyInstance) {
  const signedIn = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) await reply.status(401).send({ code: "UNAUTHENTICATED", message: "Missing or invalid session" });
  };
  const me = { onRequest: signedIn };

  app.get("/v1/me/notifications", me, async (req) => {
    const rows = await app.prisma.notification.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return {
      unread: rows.filter((r) => !r.readAt).length,
      notifications: rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        body: r.body,
        url: (r.data as { url?: string } | null)?.url ?? null,
        read: r.readAt !== null,
        at: r.createdAt.toISOString(),
      })),
    };
  });

  app.post("/v1/me/notifications/read", me, async (req) => {
    const { count } = await app.prisma.notification.updateMany({
      where: { userId: req.user!.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { read: count };
  });

  /** The public half of our VAPID key, or null when push is off. */
  app.get("/v1/push/public-key", async () => ({ publicKey: app.config.VAPID_PUBLIC_KEY ?? null }));

  app.post("/v1/me/push-subscriptions", me, async (req, reply) => {
    if (!app.config.VAPID_PUBLIC_KEY) return reply.status(409).send({ code: "PUSH_OFF", message: "Push is not configured on this server" });
    const body = subscriptionSchema.parse(req.body);
    await app.prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      update: { userId: req.user!.userId, p256dh: body.keys.p256dh, auth: body.keys.auth },
      create: {
        userId: req.user!.userId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: String(req.headers["user-agent"] ?? "").slice(0, 200),
      },
    });
    return reply.status(201).send({ ok: true });
  });

  app.delete("/v1/me/push-subscriptions", me, async (req) => {
    const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.body);
    const { count } = await app.prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user!.userId } });
    return { removed: count };
  });
}
