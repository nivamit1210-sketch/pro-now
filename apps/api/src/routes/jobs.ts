import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { createJobSchema } from "@pro-now/validation";
import { triggerDispatch } from "../domain/dispatch/dispatch-service.js";
import { capturePaymentForJob } from "../domain/payments/capture-payment.js";
import { closeWithoutPayment, receiptFromEvents } from "../domain/payments/close-without-payment.js";
import {
  advancePresence,
  releaseAfterCompletion,
  releaseAfterCancellation,
} from "../domain/job/advance-presence.js";
import { assertTransition, nextAfterArrival } from "../domain/job/transitions.js";
import { loadPaidTotals, priceContextFor } from "../domain/pricing/price-context.js";
import { toMyJobSummary } from "../domain/job/my-jobs.js";
import { assignedJob, customerJob, notFound, requireRole } from "../auth/access.js";

/**
 * See /docs/06-API-SPEC.md and /docs/05-DATABASE.md §Job creation
 * transaction. POST /v1/jobs requires an Idempotency-Key header.
 */
export default async function jobsRoutes(app: FastifyInstance) {
  app.post("/v1/jobs", { onRequest: requireRole("CUSTOMER") }, async (req, reply) => {
    const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
    if (!idempotencyKey) {
      return reply.status(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Idempotency-Key header is required" });
    }
    const body = createJobSchema.parse(req.body);

    const customer = await app.prisma.customerProfile.upsert({
      where: { userId: req.user!.userId },
      update: {},
      create: { userId: req.user!.userId },
    });

    // A replay returns the caller's own job, never someone else's that
    // happens to carry the same key.
    const existing = await app.prisma.job.findUnique({ where: { idempotencyKey } });
    if (existing && existing.customerId !== customer.id) {
      return reply.status(409).send({ code: "IDEMPOTENCY_KEY_CONFLICT", message: "Use a new Idempotency-Key" });
    }
    if (existing) {
      return reply.send({ job: existing, replayed: true });
    }

    const address = await app.prisma.address.findUnique({ where: { id: body.addressId } });
    if (!address || address.customerId !== customer.id) {
      return reply.status(404).send({ code: "ADDRESS_NOT_FOUND", message: "Address not found for this customer" });
    }

    const service = await app.prisma.service.findUnique({ where: { id: body.serviceId } });
    if (!service) {
      return reply.status(404).send({ code: "SERVICE_NOT_FOUND", message: "Service not found" });
    }

    const mediaIds = [...new Set(body.mediaRefs)];
    const uploads = mediaIds.length
      ? await app.prisma.upload.findMany({
          // A job carries the customer's photos and voice notes only — never an identity photo or a document.
          where: { id: { in: mediaIds }, ownerId: req.user!.userId, status: "READY", kind: { in: ["PHOTO", "VOICE_NOTE"] } },
        })
      : [];
    if (uploads.length !== mediaIds.length) {
      return reply.status(422).send({
        code: "UPLOADS_NOT_READY",
        message: "Every attachment must be a ready upload owned by this customer",
      });
    }

    const job = await app.prisma.job.create({
      data: {
        customerId: customer.id,
        serviceId: service.id,
        addressId: address.id,
        description: body.description,
        // Validated as `Record<string, unknown>`; the column is `Json?`.
        structuredAnswers: body.structuredAnswers as Prisma.InputJsonValue,
        onSiteName: body.onSite?.name ?? null,
        onSitePhone: body.onSite?.phone ?? null,
        idempotencyKey,
        status: "DRAFT",
        media: {
          create: uploads.map((upload) => ({
            kind: upload.kind,
            storageRef: upload.storageKey,
            uploadId: upload.id,
          })),
        },
      },
    });

    await app.prisma.jobEvent.create({
      data: { jobId: job.id, type: "JOB_CREATED", actor: "CUSTOMER", actorId: req.user!.userId, metadata: {} },
    });

    // Dispatch is triggered inline for this delivery; a production build
    // moves this onto a queue so the HTTP response doesn't wait on it.
    const outcome = await triggerDispatch(
      app.prisma,
      app.providers.maps,
      job.id,
      app.config.DISPATCH_OFFER_TIMEOUT_SECONDS
    );

    const refreshedJob = await app.prisma.job.findUnique({ where: { id: job.id } });
    return reply.send({ job: refreshedJob, dispatch: outcome });
  });

  /**
   * The customer's own jobs, newest first: how the home screen finds the
   * job still in progress after a reload or a new tab (docs/21 W6), and
   * what the calls list (הקריאות שלי) shows — who came, the stars given,
   * and what the work came to (domain/job/my-jobs.ts).
   */
  app.get("/v1/jobs", { onRequest: requireRole("CUSTOMER") }, async (req) => {
    const jobs = await app.prisma.job.findMany({
      where: { customer: { userId: req.user!.userId } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        createdAt: true,
        service: { select: { nameHe: true, code: true } },
        assignedProfessional: { select: { id: true, displayName: true } },
        review: { select: { overallRating: true } },
        // Only the receipt's event, not the job's whole history.
        events: { where: { type: "SETTLED_OUTSIDE_APP" }, select: { type: true, metadata: true } },
      },
    });
    return { jobs: jobs.map(toMyJobSummary) };
  });

  app.get("/v1/jobs/:id", { onRequest: requireRole("CUSTOMER") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = await customerJob(app.prisma, req.user!.userId, id, {
      service: { select: { nameHe: true, code: true, priceModel: true } },
      review: { select: { overallRating: true } },
      events: { orderBy: { createdAt: "asc" } },
      offers: true,
      quotes: { include: { lineItems: true } },
    });
    if (!job) return notFound(reply, "JOB");

    /*
     * HOW THIS QUOTE SITS AGAINST WHAT PEOPLE ACTUALLY PAID.
     *
     * Amit: *"אחרי שמקבלים הצעת מחיר, צריך שיהיה מחיר בהשוואה לשוק לראות
     * אם יקר או לא יקר."*
     *
     * Computed on the SERVER, from approved quotes for this same service,
     * and sent as a finished judgement — the client is never handed other
     * people's prices to do arithmetic on. /CLAUDE.md §3: the server is
     * authoritative for the pricing result, and a range is a pricing
     * result.
     *
     * Null whenever there is no live quote to judge, and `available:
     * false` whenever there are not enough real jobs behind it. Both are
     * ordinary answers and the screen is built to show nothing for them.
     */
    const liveQuote = job.quotes.find((q) => q.status === "SENT" || q.id === job.approvedQuoteId);
    const priceContext = liveQuote
      ? priceContextFor({
          amountMinorUnits: liveQuote.totalMinorUnits,
          paid: await loadPaidTotals(app.prisma, { serviceId: job.serviceId, excludeJobId: job.id }),
        })
      : null;

    return reply.send({
      job,
      priceContext,
      // What the work came to, when the job closed without money in the app (D1).
      receipt: receiptFromEvents(job.events),
      // Why a cancelled job ended, in the server's words (e.g. NO_PROFESSIONAL_AVAILABLE).
      cancellationReason: cancellationReasonOf(job.events),
      ratingGiven: job.review?.overallRating ?? null,
      // Ordered for someone else: who is at home, and the code once a professional is assigned.
      onSite: job.onSiteName ? { name: job.onSiteName, doorCode: job.doorCode } : null,
      // The code to ask for at the door (the arrival screen). Only once someone is assigned.
      doorCode: job.assignedProfessionalId ? job.doorCode : null,
      paymentsInApp: app.config.IN_APP_PAYMENTS !== "off",
    });
  });

  /**
   * The customer confirms the work is done, and the money moves.
   *
   * COMPLETION_PENDING is the professional's claim; COMPLETED is the
   * customer agreeing with it. Putting the charge behind the customer's
   * tap rather than the professional's is the whole reason the state
   * machine has two states here instead of one, and it is why this route
   * checks who is asking.
   *
   * Everything after the confirmation is the server's: settle, authorise,
   * capture, write the ledger, open the review. None of it is reported by
   * a client — /docs/09-PAYMENTS.md §Ledger is explicit that the server
   * never trusts a client's "payment succeeded".
   */
  app.post("/v1/jobs/:id/confirm-completion", { onRequest: requireRole("CUSTOMER") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const idempotencyKey = (req.headers["idempotency-key"] as string) ?? `confirm_${id}`;

    const job = await customerJob(app.prisma, req.user!.userId, id);
    if (!job) return notFound(reply, "JOB");

    assertTransition(job.status, "COMPLETED", "CUSTOMER");
    await app.prisma.job.update({ where: { id }, data: { status: "COMPLETED" } });
    await app.prisma.jobEvent.create({
      data: {
        jobId: id,
        type: "COMPLETION_CONFIRMED",
        actor: "CUSTOMER",
        actorId: req.user!.userId,
        metadata: {},
      },
    });

    // No money in the app (D1): record what is owed and open the review.
    if (app.config.IN_APP_PAYMENTS === "off") {
      const receipt = await closeWithoutPayment(app.prisma, id);
      return reply.send({ ok: true, status: "REVIEW_PENDING", receipt });
    }

    const outcome = await capturePaymentForJob(
      app.prisma,
      app.providers.payment,
      id,
      idempotencyKey
    );

    if (outcome.status === "NOT_SETTLEABLE") {
      /*
       * The job stays COMPLETED and is not charged. 409 rather than 500:
       * nothing crashed, the server declined to invent an amount, and the
       * reason is in the job's events for Ops to act on.
       */
      return reply.status(409).send({
        code: "NOT_SETTLEABLE",
        message: "העבודה הושלמה, והמערכת לא יכולה לחשב סכום לחיוב ללא ניחוש. צוות התפעול יטפל.",
        reason: outcome.reason,
      });
    }

    return reply.send({ ok: true, ...outcome });
  });

  app.post("/v1/jobs/:id/cancel", { onRequest: requireRole("CUSTOMER") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = await customerJob(app.prisma, req.user!.userId, id);
    if (!job) return notFound(reply, "JOB");

    assertTransition(job.status, "CANCELLED", "CUSTOMER");

    await app.prisma.job.update({ where: { id }, data: { status: "CANCELLED" } });
    await app.prisma.jobEvent.create({
      data: { jobId: id, type: "JOB_CANCELLED", actor: "CUSTOMER", actorId: req.user!.userId, metadata: {} },
    });

    /*
     * Whoever was committed to this job is not any more. Without this a
     * cancelled job left its professional stranded mid-machine — EN_ROUTE
     * to somewhere nobody is waiting — and invisible to dispatch for the
     * rest of their shift, punished for a cancellation that was not
     * theirs.
     */
    await releaseAfterCancellation(app.prisma, job.assignedProfessionalId);

    return reply.send({ ok: true });
  });

  for (const [path, type, nextState, presenceStep] of [
    /*
     * The fourth column is the PROFESSIONAL'S step, and it was missing.
     *
     * These routes moved the job and never the person. Dispatch only
     * considers professionals who are AVAILABLE, and nothing ever moved
     * anybody off ASSIGNED — so a professional who accepted one job never
     * received another until they ended their shift. See
     * `advance-presence.ts`.
     */
    ["/v1/jobs/:id/en-route", "PRO_EN_ROUTE_REQUESTED", "PRO_EN_ROUTE", "EN_ROUTE"],
    ["/v1/jobs/:id/arrive", "PRO_ARRIVED_REQUESTED", "PRO_ARRIVED", "ARRIVED"],
    ["/v1/jobs/:id/start", "SERVICE_STARTED", "IN_PROGRESS", "SERVICING"],
    ["/v1/jobs/:id/complete", "SERVICE_COMPLETION_REQUESTED", "COMPLETION_PENDING", "RELEASE"],
  ] as const) {
    app.post(path, { onRequest: requireRole("PROFESSIONAL") }, async (req, reply) => {
      const { id } = req.params as { id: string };
      const job = await assignedJob(app.prisma, req.user!.userId, id, { service: true });
      if (!job) return notFound(reply, "JOB");

      /*
       * STARTING IS TWO DIFFERENT MOVES, AND THIS ROW DECIDED ONLY ONE.
       *
       * `/start` sent every job straight to IN_PROGRESS. For a VISIT_QUOTE
       * service that skips DIAGNOSIS entirely — the state where the
       * professional looks at the problem and writes a quote — so the job
       * jumped past the step where the price is agreed and landed in
       * "working" before the customer had approved anything.
       *
       * `nextAfterArrival` has encoded the right answer since the state
       * machine was written (/docs/07-JOB-STATE-MACHINE.md); this route
       * simply never asked it.
       */
      const target =
        nextState === "IN_PROGRESS"
          ? nextAfterArrival(job.service.priceModel === "VISIT_QUOTE")
          : nextState;

      assertTransition(job.status, target, "PROFESSIONAL");
      await app.prisma.job.update({ where: { id }, data: { status: target } });
      await app.prisma.jobEvent.create({
        data: { jobId: id, type, actor: "PROFESSIONAL", actorId: req.user!.userId, metadata: {} },
      });

      // The person moves with the job. A professional whose presence
      // cannot legally make this step is left where they are rather than
      // forced — see advancePresence.
      const presence =
        presenceStep === "RELEASE"
          ? await releaseAfterCompletion(app.prisma, job.assignedProfessionalId)
          : await advancePresence(app.prisma, job.assignedProfessionalId, presenceStep);

      return reply.send({ ok: true, status: target, presenceState: presence.to ?? undefined });
    });
  }
}

function cancellationReasonOf(events: Array<{ type: string; actor: string; metadata: unknown }>): string | null {
  const cancelled = [...events].reverse().find((e) => e.type === "JOB_CANCELLED");
  if (!cancelled) return null;
  const reason = (cancelled.metadata as { reason?: unknown } | null)?.reason;
  return typeof reason === "string" ? reason : `CANCELLED_BY_${cancelled.actor}`;
}
