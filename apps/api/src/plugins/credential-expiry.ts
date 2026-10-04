import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";

import { runExpiryCheck } from "../domain/credentials/expiry-run.js";

/**
 * The hourly credential expiry check (docs/10 §Life after approval): the
 * first run a minute after start, then every hour (cheap: notices are once-only). After notifications
 * (it uses app.push and app.userEvents).
 */
const FIRST_RUN_MS = 60_000;
const EVERY_MS = 60 * 60 * 1000;

export default fp(async function credentialExpiry(app: FastifyInstance) {
  const check = (now?: Date) => runExpiryCheck({ prisma: app.prisma, push: app.push, users: app.userEvents, log: app.log }, now);

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await check();
      if (result.notices > 0 || result.expired > 0) app.log.info({ ...result }, "credential expiry");
    } catch (err) {
      app.log.error({ err }, "credential expiry failed");
    } finally {
      running = false;
    }
  };

  let interval: ReturnType<typeof setInterval> | undefined;
  const first = setTimeout(() => {
    void tick();
    interval = setInterval(() => void tick(), EVERY_MS);
    interval.unref?.();
  }, FIRST_RUN_MS);
  first.unref?.();
  app.addHook("onClose", async () => {
    clearTimeout(first);
    if (interval) clearInterval(interval);
  });
  app.decorate("checkCredentialExpiryNow", check);
});

declare module "fastify" {
  interface FastifyInstance {
    checkCredentialExpiryNow: (now?: Date) => Promise<{ notices: number; expired: number }>;
  }
}
