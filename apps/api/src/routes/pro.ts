import type { FastifyInstance } from "fastify";
import { notFound, ownShift, requireRole } from "../auth/access.js";
import { earningsFor, outsideAppEarningsFor } from "../domain/payments/earnings.js";
import { SUMMARY_INCLUDE, professionalSummary } from "../domain/professional-summary.js";
import { startShiftSchema, locationPingSchema } from "@pro-now/validation";
import { assertPresenceTransition, canEndShift } from "../domain/job/pro-presence-transitions.js";
import type { OfferCardView, ProPresenceState, ProPublicProfileView } from "@pro-now/types";
import { coarseAreaLabel } from "../domain/privacy/area-label.js";

/**
 * See /docs/06-API-SPEC.md, /docs/07-JOB-STATE-MACHINE.md §Professional
 * presence, /docs/05-DATABASE.md §Availability session.
 */
/** "דנה לוי" → "דנה ל׳": a first name and an initial, never a full name (docs/12 privacy). */
export function reviewerLabelHe(fullName: string | null): string | null {
  const [first, last] = (fullName ?? "").trim().split(/\s+/);
  if (!first) return null;
  return last ? `${first} ${last.charAt(0)}׳` : first;
}

export default async function proRoutes(app: FastifyInstance) {
  app.post("/v1/pro/shifts", { onRequest: requireRole("PROFESSIONAL") }, async (req, reply) => {
    const body = startShiftSchema.parse(req.body);
    const professional = await app.prisma.professionalProfile.findUnique({ where: { userId: req.user!.userId } });
    if (!professional) return reply.status(404).send({ code: "PROFESSIONAL_NOT_FOUND", message: "No professional profile" });

    if (professional.verificationStatus !== "APPROVED") {
      return reply.status(403).send({
        code: "VERIFICATION_INCOMPLETE",
        message: "Professional must be APPROVED before going online — see /docs/10-TRUST-VERIFICATION.md",
      });
    }

    assertPresenceTransition(professional.presenceState as ProPresenceState, "STARTING_SHIFT");

    const session = await app.prisma.availabilitySession.create({
      data: { professionalId: professional.id, enabledServiceIds: body.enabledServiceIds },
    });

    await app.prisma.professionalLocation.create({
      data: { professionalId: professional.id, lat: body.lat, lng: body.lng, capturedAt: new Date() },
    });

    await app.prisma.professionalProfile.update({
      where: { id: professional.id },
      data: { presenceState: "AVAILABLE" },
    });

    return reply.send({ sessionId: session.id, presenceState: "AVAILABLE" });
  });

  app.post("/v1/pro/shifts/:id/end", { onRequest: requireRole("PROFESSIONAL") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const professional = await app.prisma.professionalProfile.findUnique({ where: { userId: req.user!.userId } });
    if (!professional) return reply.status(404).send({ code: "PROFESSIONAL_NOT_FOUND", message: "No professional profile" });

    if (!canEndShift(professional.presenceState as ProPresenceState)) {
      return reply.status(409).send({
        code: "SHIFT_END_BLOCKED",
        message: "Cannot end shift while committed to an active job — see /docs/07-JOB-STATE-MACHINE.md",
      });
    }

    const shift = await ownShift(app.prisma, req.user!.userId, id);
    if (!shift) return notFound(reply, "SHIFT");

    await app.prisma.availabilitySession.update({ where: { id }, data: { endedAt: new Date(), status: "ENDED" } });
    await app.prisma.professionalProfile.update({ where: { id: professional.id }, data: { presenceState: "OFFLINE" } });
    return reply.send({ ok: true, presenceState: "OFFLINE" });
  });

  app.post("/v1/pro/location", { onRequest: requireRole("PROFESSIONAL") }, async (req, reply) => {
    const body = locationPingSchema.parse(req.body);
    const professional = await app.prisma.professionalProfile.findUnique({ where: { userId: req.user!.userId } });
    if (!professional) return reply.status(404).send({ code: "PROFESSIONAL_NOT_FOUND", message: "No professional profile" });

    // OFFLINE professionals are never tracked — see /docs/12-PRIVACY.md.
    if (professional.presenceState === "OFFLINE") {
      return reply.status(409).send({ code: "NOT_TRACKED_WHILE_OFFLINE", message: "Location is not accepted while OFFLINE" });
    }

    await app.prisma.professionalLocation.create({
      data: {
        professionalId: professional.id,
        lat: body.lat,
        lng: body.lng,
        accuracyMeters: body.accuracyMeters,
        headingDegrees: body.headingDegrees,
        speedMps: body.speedMetersPerSecond,
        capturedAt: new Date(body.capturedAt),
      },
    });
    // After the write: the customer re-reads the position just stored.
    await announceLocation(app, professional.id);
    return reply.send({ ok: true });
  });

  app.get("/v1/pro/earnings", { onRequest: requireRole("PROFESSIONAL") }, async (req, reply) => {
    const professional = await app.prisma.professionalProfile.findUnique({ where: { userId: req.user!.userId } });
    if (!professional) return reply.status(404).send({ code: "PROFESSIONAL_NOT_FOUND", message: "No professional profile" });

    // Earnings are derived from ledger_entries, never summed ad-hoc from
    // jobs — see /docs/05-DATABASE.md §Payments.
    /*
     * GROSS AND NET, BOTH FROM THE LEDGER.
     *
     * The professional's screen showed "ברוטו ₪2,100" and "עמלת פלטפורמה
     * −₪420" written into the component — a 20% commission, to everybody,
     * when the commission percentage is an open business decision
     * (/CLAUDE.md §4). The app was announcing a rate nobody had set.
     *
     * Both numbers come from ledger rows now, or neither does. What was
     * actually charged is CUSTOMER_CHARGE; what the professional is owed
     * is PROFESSIONAL_PAYABLE; the difference is what was taken, and it is
     * a SUBTRACTION of two recorded facts rather than a percentage
     * applied. When there are no charge rows, gross is null and the
     * screen omits the breakdown instead of implying a deduction of zero.
     */
    const entries = await app.prisma.ledgerEntry.findMany({
      where: { payment: { job: { assignedProfessionalId: professional.id } } },
    });

    const payable = entries.filter((e) => e.entryType === "PROFESSIONAL_PAYABLE");
    const charges = entries.filter((e) => e.entryType === "CUSTOMER_CHARGE");

    const netMinorUnits = payable.reduce((sum, e) => sum + e.amountMinorUnits, 0);
    const grossMinorUnits =
      charges.length === 0 ? null : charges.reduce((sum, e) => sum + e.amountMinorUnits, 0);

    /*
     * The four lifetime numbers stay, because `verify:journey` and the
     * old client read them and a professional's running total is a real
     * thing to want. What is new is the BREAKDOWN beside them: a week of
     * days and a list of jobs, each with every deduction named.
     *
     * `ProEarningsBody` was designed for exactly that shape and the
     * shipped screen has never rendered it, because this endpoint could
     * not feed it. The ledger has held the shape since §21.
     */
    // No money moves through the app (D1): the receipts are the record, not the ledger.
    const breakdown =
      app.config.IN_APP_PAYMENTS === "off"
        ? await outsideAppEarningsFor(app.prisma, professional.id)
        : await earningsFor(app.prisma, professional.id);

    return reply.send({
      netMinorUnits,
      grossMinorUnits,
      currency: "ILS",
      jobCount: payable.length,
      breakdown,
    });
  });

  /**
   * Their profile as customers see it — built by the function the match
   * card uses, so what they see here is what a customer is shown. Only
   * approved services: those are the ones a customer can be sent them for.
   */
  app.get("/v1/pro/public-profile", { onRequest: requireRole("PROFESSIONAL") }, async (req, reply) => {
    const pro = await app.prisma.professionalProfile.findUnique({ where: { userId: req.user!.userId }, include: SUMMARY_INCLUDE });
    if (!pro) return reply.status(404).send({ code: "PROFESSIONAL_NOT_FOUND", message: "No professional profile" });

    const approved = pro.services.filter((s) => s.status.trim().toUpperCase() === "APPROVED");
    const [catalogue, reviews, professional] = await Promise.all([
      app.prisma.service.findMany({ where: { id: { in: approved.map((s) => s.serviceId) } }, select: { id: true, code: true, nameHe: true } }),
      app.prisma.review.findMany({
        where: { professionalId: pro.id, moderationStatus: "PUBLISHED" },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, overallRating: true, text: true, createdAt: true, reviewer: { select: { fullName: true } }, job: { select: { service: { select: { nameHe: true } } } } },
      }),
      professionalSummary(app, pro, approved.map((s) => s.serviceId)),
    ]);

    const body: ProPublicProfileView = {
      professional,
      services: approved.flatMap((s) => {
        const service = catalogue.find((c) => c.id === s.serviceId);
        return service ? [{ serviceId: s.serviceId, serviceCode: service.code, nameHe: service.nameHe, basePriceMinorUnits: s.basePriceMinorUnits ?? null }] : [];
      }),
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.overallRating,
        text: r.text,
        createdAt: r.createdAt.toISOString(),
        serviceNameHe: r.job.service.nameHe,
        reviewerLabelHe: reviewerLabelHe(r.reviewer.fullName),
      })),
    };
    return reply.send(body);
  });

  app.get("/v1/pro/verification", { onRequest: requireRole("PROFESSIONAL") }, async (req, reply) => {
    const professional = await app.prisma.professionalProfile.findUnique({
      where: { userId: req.user!.userId },
      include: { identityVerification: true, businessProfile: true, credentials: true, externalProfiles: true },
    });
    if (!professional) return reply.status(404).send({ code: "PROFESSIONAL_NOT_FOUND", message: "No professional profile" });
    return reply.send({ professional });
  });

  /**
   * GET /v1/pro/offers/current — the payload behind the professional's
   * offer card.
   *
   * Two rules are enforced here rather than in the client, because a client
   * cannot be trusted to withhold data it has been given:
   *
   *  - The customer's precise address is NEVER included before the job is
   *    assigned. Only a coarse area label derived by
   *    `domain/privacy/area-label.ts` crosses the wire
   *    (/docs/12-PRIVACY.md).
   *  - The expected payout is included whenever it is knowable, and is
   *    `null` — not a plausible placeholder — when it is not
   *    (/CLAUDE.md §3, transparent provider payout).
   */
  app.get("/v1/pro/offers/current", { onRequest: requireRole("PROFESSIONAL") }, async (req, reply) => {
    const professional = await app.prisma.professionalProfile.findUnique({
      where: { userId: req.user!.userId },
    });
    if (!professional) {
      return reply.status(404).send({ code: "PROFESSIONAL_NOT_FOUND", message: "No professional profile" });
    }

    const offer = await app.prisma.dispatchOffer.findFirst({
      where: {
        professionalId: professional.id,
        status: { in: ["CREATED", "SENT", "VIEWED"] },
        expiresAt: { gt: new Date() },
      },
      orderBy: { offeredAt: "desc" },
      include: { job: { include: { service: true, address: true } } },
    });

    if (!offer) return reply.status(204).send();

    const priceModel: string = offer.job.service.priceModel;

    /*
     * A VISIT_QUOTE job's payout is genuinely not knowable before the
     * on-site diagnosis produces a quote, so it is reported as unknown.
     * HOURLY depends on hours actually worked, so it is knowable only as an
     * estimate. FIXED and DISTANCE_TIME resolve to the snapshot taken at
     * dispatch time.
     */
    /*
     * FROM THE PROFESSIONAL'S OWN PRICE (W7). Dispatch never wrote
     * `payoutMinorUnitsSnapshot`, so every offer said "unknown" — even a
     * fixed price, where the amount is exact. The professional's own
     * configured price answers it, as it already does on the job screen:
     *   FIXED        the price, exactly;
     *   VISIT_QUOTE  at least the visit fee (the quote comes on site);
     *   HOURLY       the minimum billable time at their rate;
     *   DISTANCE     unknown until the distance is measured.
     * No money moves through the app (D1), so what the customer pays them
     * directly is what they receive; a commission would change this line.
     */
    const own = await app.prisma.professionalService.findUnique({
      where: { professionalId_serviceId: { professionalId: offer.professionalId, serviceId: offer.job.serviceId } },
    });
    const base = own?.basePriceMinorUnits ?? null;
    const snapshot: number | null = offer.payoutMinorUnitsSnapshot ?? null;
    const expectedPayoutMinorUnits: number | null =
      snapshot ??
      (base === null
        ? null
        : priceModel === "HOURLY"
          ? Math.round((base * Math.max(60, own?.minimumBillableMinutes ?? 60)) / 60)
          : priceModel === "DISTANCE_TIME"
            ? null
            : base);
    const payoutIsEstimate = priceModel !== "FIXED";

    const result: OfferCardView = {
      offerId: offer.id,
      jobId: offer.jobId,
      serviceNameHe: offer.job.service.nameHe,
      serviceCode: offer.job.service.code,
      priceModel: offer.job.service.priceModel,
      currency: "ILS",
      offeredAt: offer.offeredAt.toISOString(),
      expiresAt: offer.expiresAt.toISOString(),
      eta:
        offer.etaSecondsSnapshot === null || offer.etaSecondsSnapshot === undefined
          ? null
          : {
              etaSeconds: offer.etaSecondsSnapshot,
              distanceMeters: null,
              // The snapshot does not record its provenance; under-claim.
              isRouteBased: false,
              computedAt: offer.offeredAt.toISOString(),
            },
      expectedPayoutMinorUnits,
      payoutIsEstimate,
      // Coarse area only — see the note above and area-label.ts.
      customerAreaLabel: coarseAreaLabel(offer.job.address?.formatted ?? null),
      jobDescription: offer.job.description ?? null,
    };

    return reply.send(result);
  });
}

/**
 * THE CUSTOMER'S ETA MOVES WITH THEM (docs/21 W9). While a professional is
 * on their way, a new position tells the job's socket that the ETA may
 * have changed; the customer's screen re-reads it (GET /jobs/:id/match).
 * No coordinates cross the socket, and at most one notice per job every
 * 10 seconds.
 */
const lastAnnounced = new Map<string, number>();
async function announceLocation(app: FastifyInstance, professionalId: string) {
  const job = await app.prisma.job.findFirst({
    where: { assignedProfessionalId: professionalId, status: { in: ["PRO_ASSIGNED", "PRO_EN_ROUTE"] } },
    select: { id: true },
  });
  if (!job) return;
  const now = Date.now();
  if (now - (lastAnnounced.get(job.id) ?? 0) < 10_000) return;
  lastAnnounced.set(job.id, now);
  app.jobEvents.publish({ jobId: job.id, type: "PRO_LOCATION", at: new Date(now).toISOString() });
}
