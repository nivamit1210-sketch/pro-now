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

    /*
     * ORDERED FOR SOMEONE ELSE (docs/18, 2026-10-01; Dvir, 2026-10-07):
     * the person who ordered decides from afar, so the quote shows what was
     * found: at least one photo of the fault and the finding in words; a
     * voice note may join them. Only the professional's own ready uploads.
     */
    const forSomeoneElse = Boolean(job.onSiteName);
    const mediaIds = [...new Set(body.mediaRefs)];
    const uploads = mediaIds.length
      ? await app.prisma.upload.findMany({
          where: { id: { in: mediaIds }, ownerId: req.user!.userId, status: "READY", kind: { in: ["PHOTO", "VOICE_NOTE"] } },
        })
      : [];
    if (uploads.length !== mediaIds.length) {
      return reply.status(422).send({ code: "UPLOADS_NOT_READY", message: "Every attachment must be a ready upload of this professional" });
    }
    if (forSomeoneElse && (!uploads.some((u) => u.kind === "PHOTO") || (body.notes ?? "").trim().length < 4)) {
      return reply.status(422).send({
        code: "QUOTE_EVIDENCE_REQUIRED",
        message: "A quote for someone else needs a photo of the fault and what was found, in words",
      });
    }

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
        media: { create: uploads.map((u) => ({ jobId, kind: u.kind, storageRef: u.storageKey, uploadId: u.id })) },
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
     * professional directly.
     *
     * Except when it was ordered for someone else: nobody at the door
     * decides, so the quote waits for the person who ordered to approve it
     * (Dvir, 2026-10-07). Still no money in the app: the person at home
     * pays the professional directly, the amount that was approved.
     */
    if (app.config.IN_APP_PAYMENTS === "off" && !forSomeoneElse) {
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

    const approved = await approveQuote(app, {
      quoteId,
      jobId: quote.jobId,
      jobStatus: quote.job.status,
      actor: "CUSTOMER",
      metadata: { idempotencyKey },
    });
    if (!approved) return reply.status(409).send({ code: "QUOTE_NOT_PENDING", message: "The quote was already decided" });
    return reply.send({ ok: true });
  });
}

async function approveQuote(
  app: FastifyInstance,
  a: { quoteId: string; jobId: string; jobStatus: JobState; actor: "CUSTOMER" | "SYSTEM"; metadata: Record<string, unknown> }
): Promise<boolean> {
  assertTransition(a.jobStatus, "IN_PROGRESS", a.actor);
  // Once: of two approvals at the same moment, one finds the quote still SENT.
  const { count } = await app.prisma.quote.updateMany({ where: { id: a.quoteId, status: "SENT" }, data: { status: "APPROVED" } });
  if (count === 0) return false;
  await app.prisma.job.update({ where: { id: a.jobId }, data: { status: "IN_PROGRESS", approvedQuoteId: a.quoteId } });
  await app.prisma.jobEvent.create({
    data: { jobId: a.jobId, type: "QUOTE_APPROVED", actor: a.actor, metadata: { quoteId: a.quoteId, ...a.metadata } },
  });
  return true;
}
