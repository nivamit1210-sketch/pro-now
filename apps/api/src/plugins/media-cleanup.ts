import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";

import { cleanupUploads } from "../domain/storage/media-cleanup.js";
import { purgeMatchFeedback } from "../domain/matching/retention.js";

const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

export default fp(async function mediaCleanup(app: FastifyInstance) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await cleanupUploads(app.prisma, app.providers.storage);
      if (result.pendingDeleted > 0 || result.retainedDeleted > 0 || result.failed > 0) {
        app.log.info({ ...result }, "media cleanup");
      }
      // Typed request text shares the media's retention period (D3).
      const matchFeedbackDeleted = await purgeMatchFeedback(app.prisma);
      if (matchFeedbackDeleted > 0) app.log.info({ matchFeedbackDeleted }, "match feedback retention");
    } catch (err) {
      app.log.error({ err }, "media cleanup failed");
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), CLEANUP_INTERVAL_MS);
  timer.unref?.();
  app.addHook("onClose", async () => clearInterval(timer));
  app.decorate("cleanupMediaNow", tick);
});

declare module "fastify" {
  interface FastifyInstance {
    cleanupMediaNow: () => Promise<void>;
  }
}
