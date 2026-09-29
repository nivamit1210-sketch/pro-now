import type { FastifyInstance } from "fastify";
import type { JobState } from "@pro-now/types";
import { createQuoteSchema, approveQuoteSchema } from "@pro-now/validation";
import { buildQuoteVersion } from "../domain/pricing/quote-hash.js";
import { assertTransition } from "../domain/job/transitions.js";
import { assignedJob, notFound, quoteForCustomer, requireRole } from "../auth/access.js";

/**
 * See /docs/05-DATABASE.md §Quote versioning and /docs/02-UX-FLOWS.md C12/P19.
 * A quote is immutable once sent; edits create a new version. The
 * customer approves an exact version/hash — the server re-validates line
 * items and never trusts a client-submitted total.
 */
export default async function quotesRoutes(app: FastifyInstance) {
  app.post("/v1/jobs/:id/quotes", { onRequest: requireRole("PROFESSIONAL") }, async (req, reply) => {
    const { id: jobId } = req.params as { id: string };
    const body = createQuoteSchema.parse(req.body);

    const job = await assignedJob(app.prisma, req.user!.userId, jobId);
    if (!job) return notFound(reply, "JOB");

    assertTransition(job.status, "WAITING_QUOTE_APPROVAL", "PROFESSIONAL");

    const latestVersion = await app.prisma.quote.count({ where: { jobId } });
    // Total and hash are built together so the hash can never bind a total
    // different from the one stored — see domain/pricing/quote-hash.ts.
    const { totalMinorUnits, versionHash } = buildQuoteVersion(jobId, latestVersion + 1, body.lineItems);

    // Supersede any prior quote for this job.
    await app.prisma.quote.updateMany({ where: { jobId, status: "SENT" }, data: { status: "SUPERSEDED" } });

    const quote = await app.prisma.quote.create({
      data: {
        jobId,
        version: latestVersion + 1,
        versionHash,
        totalMinorUnits,
        notes: body.notes,
        lineItems: {
          create: body.lineItems.map((li) => ({
            description: li.description,
            quantity: li.quantity,
            unitPriceMinorUnits: li.unitPriceMinorUnits,
            kind: li.kind,
          })),
        },
      },
      include: { lineItems: true },
    });

    await app.prisma.job.update({ where: { id: jobId }, data: { status: "WAITING_QUOTE_APPROVAL" } });
    await app.prisma.jobEvent.create({
      data: { jobId, type: "QUOTE_SENT", actor: "PROFESSIONAL", metadata: { quoteId: quote.id, versionHash } },
    });

    /*
     * APPROVED ON SENDING, WHILE NO MONEY MOVES (docs/21 §5 D1). The quote
     * is the record of what was agreed at the door; the customer pays the
     * professional directly. "Only the orderer approves" returns with
     * in-app payments, and this route then waits for them again.
     */
    if (app.config.IN_APP_PAYMENTS === "off") {
      await approveQuote(app, { quoteId: quote.id, jobId, jobStatus: "WAITING_QUOTE_APPROVAL", actor: "SYSTEM", metadata: { auto: true, rule: "D1" } });
      return reply.send({ quote: { ...quote, status: "APPROVED" }, autoApproved: true });
    }

    return reply.send({ quote });
  });

  app.post("/v1/quotes/:id/approve", { onRequest: requireRole("CUSTOMER") }, async (req, reply) => {
    const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
    if (!idempotencyKey) {
      return reply.status(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key header is required" });
    }

    const { id: quoteId } = req.params as { id: string };
    const body = approveQuoteSchema.parse({ ...(req.body as object), quoteId });

    const quote = await quoteForCustomer(app.prisma, req.user!.userId, quoteId);
    if (!quote) return notFound(reply, "QUOTE");

    if (quote.versionHash !== body.quoteVersionHash) {
      return reply.status(409).send({
        code: "QUOTE_VERSION_MISMATCH",
        message: "The quote has changed since you last viewed it — please review the latest version",
      });
    }
    if (quote.status !== "SENT") {
      return reply.status(409).send({ code: "QUOTE_NOT_PENDING", message: `Quote status is ${quote.status}` });
    }

    await approveQuote(app, {
      quoteId,
      jobId: quote.jobId,
      jobStatus: quote.job.status,
      actor: "CUSTOMER",
      metadata: { idempotencyKey },
    });
    return reply.send({ ok: true });
  });
}

async function approveQuote(
  app: FastifyInstance,
  a: { quoteId: string; jobId: string; jobStatus: JobState; actor: "CUSTOMER" | "SYSTEM"; metadata: Record<string, unknown> }
) {
  assertTransition(a.jobStatus, "IN_PROGRESS", a.actor);
  await app.prisma.quote.update({ where: { id: a.quoteId }, data: { status: "APPROVED" } });
  await app.prisma.job.update({ where: { id: a.jobId }, data: { status: "IN_PROGRESS", approvedQuoteId: a.quoteId } });
  await app.prisma.jobEvent.create({
    data: { jobId: a.jobId, type: "QUOTE_APPROVED", actor: a.actor, metadata: { quoteId: a.quoteId, ...a.metadata } },
  });
}
