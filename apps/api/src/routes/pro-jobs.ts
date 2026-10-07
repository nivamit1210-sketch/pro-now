import type { FastifyInstance } from "fastify";
import { requireRole } from "../auth/access.js";
import type { ProJobDetailView, QuoteView } from "@pro-now/types";
import { jobServiceNameHe } from "../domain/job/service-name.js";

/**
 * GET /v1/pro/jobs/:id — the assigned job, as the professional sees it.
 *
 * ---------------------------------------------------------------------
 * WHY THIS HAD TO EXIST
 * ---------------------------------------------------------------------
 * The professional's job screens had nowhere to get their facts from.
 * `GET /v1/jobs/:id` does not expand the address, the customer or the
 * service, so the screens showed "מלצ׳ט 19, תל אביב" and "ETA: 8 דקות" —
 * the same street and the same eight minutes to every professional on
 * every job — and the quote screen pre-filled "החלפת סיפון ₪220" whatever
 * the trade was. This is the same hole `/v1/jobs/:id/match` was dug for on
 * the customer's side, on the other side of the job.
 *
 * ---------------------------------------------------------------------
 * THE ADDRESS IS RELEASED HERE, AND ONLY HERE
 * ---------------------------------------------------------------------
 * /docs/12-PRIVACY.md: before assignment the professional sees a coarse
 * area label; after it, the full address. So this endpoint refuses anyone
 * who is not the assigned professional — not to be tidy, but because the
 * precise home address of a customer is the thing this route hands out.
 */
export default async function proJobsRoutes(app: FastifyInstance) {
  app.get("/v1/pro/jobs/:id", { onRequest: requireRole("PROFESSIONAL") }, async (req, reply) => {
    const { id: jobId } = req.params as { id: string };

    const professional = await app.prisma.professionalProfile.findUnique({
      where: { userId: req.user!.userId },
    });
    if (!professional) {
      return reply.status(404).send({ code: "PROFESSIONAL_NOT_FOUND", message: "No professional profile" });
    }

    const job = await app.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        service: true,
        address: true,
        customer: { include: { user: { select: { name: true } } } },
        // The customer's own attachments; what the professional sent with a quote stays with the quote.
        media: { where: { quoteId: null }, include: { upload: true }, orderBy: { createdAt: "asc" } },
        offers: { where: { status: "ACCEPTED" }, orderBy: { offeredAt: "desc" }, take: 1 },
        quotes: { orderBy: { version: "desc" }, include: { lineItems: true } },
      },
    });
    if (!job) return reply.status(404).send({ code: "JOB_NOT_FOUND", message: "Job not found" });

    /*
     * The gate. Anyone else asking is asking for somebody's home address.
     * 404 rather than 403, so the endpoint does not confirm that a job
     * with this id exists to someone who has no business knowing.
     */
    if (job.assignedProfessionalId !== professional.id) {
      return reply.status(404).send({ code: "JOB_NOT_FOUND", message: "Job not found" });
    }

    const acceptedOffer = job.offers[0];
    const professionalService = await app.prisma.professionalService.findFirst({
      where: { professionalId: professional.id, serviceId: job.serviceId },
    });

    /*
     * PAYOUT, AND WHEN IT IS HONESTLY UNKNOWABLE.
     *
     * A FIXED job's payout is the configured price. A VISIT_QUOTE job's is
     * the visit fee until a quote is approved, and the total after — so
     * before that it is an estimate and says so. HOURLY and DISTANCE_TIME
     * depend on what happens, and null is the only true answer
     * (/CLAUDE.md §3, transparent provider payout: shown "whenever the
     * amount is knowable", which means silent when it is not).
     */
    const approvedQuote = job.quotes.find((q) => q.id === job.approvedQuoteId);
    const base = professionalService?.basePriceMinorUnits ?? null;
    const knowable = job.service.priceModel === "FIXED" || job.service.priceModel === "VISIT_QUOTE";
    const payoutMinorUnits = approvedQuote?.totalMinorUnits ?? (knowable ? base : null);
    const payoutIsEstimate =
      approvedQuote === undefined && job.service.priceModel === "VISIT_QUOTE";

    /*
     * "SENT" is the only status a quote waiting on the customer can hold
     * (/docs/05-DATABASE.md §Quote versioning — SENT | APPROVED |
     * DECLINED | SUPERSEDED). This looked for "PENDING_APPROVAL", which
     * nothing in the codebase ever writes, so a professional who had a
     * quote out was always told there was none.
     *
     * The row is mapped rather than passed through: `QuoteView.createdAt`
     * is an ISO string and the line items are the part the screen shows.
     */
    const toView = (q: (typeof job.quotes)[number]): QuoteView => ({
      id: q.id,
      jobId: q.jobId,
      version: q.version,
      versionHash: q.versionHash,
      status: q.status,
      totalMinorUnits: q.totalMinorUnits,
      notes: q.notes,
      createdAt: q.createdAt.toISOString(),
      lineItems: q.lineItems.map((li) => ({
        id: li.id,
        quoteId: li.quoteId,
        description: li.description,
        quantity: li.quantity,
        unitPriceMinorUnits: li.unitPriceMinorUnits,
        kind: li.kind,
      })),
    });
    const sentQuote = job.quotes.find((q) => q.status === "SENT");
    const pendingQuote: QuoteView | null = sentQuote ? toView(sentQuote) : null;

    const etaSeconds = acceptedOffer?.etaSecondsSnapshot ?? null;

    const media = await Promise.all(
      job.media
        .filter((item) => !item.upload || item.upload.status === "READY")
        .map(async (item) => ({
        id: item.id,
        kind: item.kind,
        mime: item.upload?.mime ?? "application/octet-stream",
        bytes: item.upload?.bytes ?? 0,
        url: await app.providers.storage.createPresignedGet({ key: item.storageRef, expiresInSeconds: 120 }),
        }))
    );

    const result: ProJobDetailView = {
      jobId: job.id,
      status: job.status,
      serviceId: job.serviceId,
      serviceNameHe: jobServiceNameHe(job),
      serviceCode: job.service.code,
      priceModel: job.service.priceModel,
      addressHe: job.address?.formatted ?? "",
      // After assignment only (this route checks it): for Waze / Google Maps.
      lat: job.address?.lat ?? null,
      lng: job.address?.lng ?? null,
      /*
       * Floor, entrance and door code have no column yet. Null rather than
       * an empty string dressed as an answer — the screen omits the line.
       */
      accessNoteHe: null,
      /*
       * The customer's own name when they gave one. `fullName` is
       * optional on CustomerProfile — plenty of people never fill it in —
       * and an empty string is the honest answer, which the screen renders
       * as an initial rather than as a made-up name.
       */
      // First name only: the professional needs to know whom to ask for, not more.
      customerNameHe: (job.customer?.fullName ?? job.customer?.user.name ?? "").trim().split(/\s+/)[0] ?? "",
      descriptionHe: job.description ?? null,
      /*
       * WHAT THE CUSTOMER ANSWERED, KEYED BY QUESTION.
       *
       * The intake exists so a professional arrives knowing where the
       * water is standing and which floor to climb. It was being collected
       * and then dropped between two screens on the customer's side; now
       * it is stored, and this is the only reason storing it is worth
       * anything.
       *
       * Passed through rather than rendered: the QUESTIONS live in the
       * catalogue, which the app has, and pairing them here would mean the
       * server holding a second copy of the wording.
       */
      structuredAnswers: (job.structuredAnswers as Record<string, unknown> | null) ?? null,
      /*
       * The ETA snapshot taken when the offer was made, and never
       * recomputed here. A professional who is already driving has a
       * better estimate than we do.
       */
      routeEtaMinutes: etaSeconds === null ? null : Math.round(etaSeconds / 60),
      payoutMinorUnits,
      payoutIsEstimate,
      pendingQuote,
      // The agreed quote. With no money in the app (D1) a quote is approved
      // on sending, so this is where the professional sees what they sent.
      approvedQuote: approvedQuote ? toView(approvedQuote) : null,
      // Ordered for someone else: who opens the door, and the code to say.
      onSiteNameHe: job.onSiteName,
      doorCodeHe: job.doorCode,
      media,
    };

    return reply.send(result);
  });
}
