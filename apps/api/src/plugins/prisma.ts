import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { createPrisma } from "../db/prisma-client.js";
import { JobEventBus } from "../realtime/job-event-bus.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    jobEvents: JobEventBus;
  }
}

export default fp(async (app: FastifyInstance) => {
  const base = createPrisma(app.config.DATABASE_URL);
  const bus = new JobEventBus();

  /*
   * EVERY JOB EVENT IS ANNOUNCED, WHOEVER WROTE IT. Routes, the dispatch
   * engine, the offer-expiry sweep and the payment code all write
   * `job_events` through this client, so hooking the write here is the one
   * place that cannot be forgotten by the next writer.
   *
   * The extended client has the same API as PrismaClient; the cast only
   * hides the extension's own type from the rest of the app.
   */
  const prisma = base.$extends({
    query: {
      jobEvent: {
        async create({ args, query }) {
          const event = await query(args);
          const row = event as { jobId?: string; type?: string; createdAt?: Date; actor?: string; metadata?: unknown };
          if (row.jobId && row.type) {
            bus.publish({
              jobId: row.jobId,
              type: row.type,
              at: (row.createdAt ?? new Date()).toISOString(),
              actor: row.actor,
              metadata: row.metadata,
            });
          }
          return event;
        },
      },
    },
  }) as unknown as PrismaClient;

  app.decorate("prisma", prisma);
  app.decorate("jobEvents", bus);
  app.addHook("onClose", async () => {
    await base.$disconnect();
  });
});
