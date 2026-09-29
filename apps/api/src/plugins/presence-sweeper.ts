import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { sweepSilentProfessionals } from "../domain/dispatch/presence-sweep.js";

/**
 * Takes silent professionals offline (docs/21 W7). Silence is twice the
 * location-freshness threshold: one missed ping is a bad signal, two is a
 * closed tab.
 */
const SWEEP_EVERY_MS = 30_000;

export default fp(async function presenceSweeper(app: FastifyInstance) {
  const silenceSeconds = app.config.LOCATION_FRESHNESS_THRESHOLD_SECONDS * 2;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const offline = await sweepSilentProfessionals(app.prisma, silenceSeconds);
      if (offline.length > 0) app.log.info({ count: offline.length }, "silent professionals taken offline");
    } catch (err) {
      app.log.error({ err }, "presence sweep failed");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), SWEEP_EVERY_MS);
  timer.unref?.();
  app.addHook("onClose", async () => clearInterval(timer));
  app.decorate("sweepPresenceNow", tick);
});

declare module "fastify" {
  interface FastifyInstance {
    sweepPresenceNow: () => Promise<void>;
  }
}
