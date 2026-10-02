import type { FastifyInstance } from "fastify";
import { externalReputationDisplay } from "../domain/reputation/external-display.js";
import { portraitForViewer } from "../domain/portrait.js";
import { customerJob, notFound, requireRole } from "../auth/access.js";
import {
  MIN_REVIEWS_FOR_RATING,
  type JobMatchView,
  type PriceQuoteView,
  type ProfessionalSummaryView,
  type VerificationBadgeKind,
} from "@pro-now/types";

/**
 * GET /v1/jobs/:id/match — the payload behind the customer's match card.
 *
 * This endpoint exists because the card previously had nowhere to get its
 * facts from: `GET /v1/jobs/:id` does not expand the assigned professional,
 * the accepted offer's ETA snapshot, or the price, so the screen rendered
 * hard-coded values instead. Every field
 * the card shows is assembled here, from real rows, or returned as null.
 *
 * The server is authoritative (/CLAUDE.md §3): the client renders this, it
 * does not compute any of it.
 */
export default async function matchRoutes(app: FastifyInstance) {
  app.get("/v1/jobs/:id/match", { onRequest: requireRole("CUSTOMER") }, async (req, reply) => {
    const { id: jobId } = req.params as { id: string };

    const job = await customerJob(app.prisma, req.user!.userId, jobId, {
        service: true,
        address: true,
        assignedProfessional: {
          include: {
            identityVerification: true,
            businessProfile: true,
            portraitUpload: true,
            credentials: true,
            services: true,
            externalProfiles: { include: { source: true, snapshots: { orderBy: { createdAt: "desc" }, take: 1 } } },
          },
        },
        offers: { where: { status: "ACCEPTED" }, orderBy: { offeredAt: "desc" }, take: 1 },
    });

    if (!job) return notFound(reply, "JOB");

    const pro = job.assignedProfessional;
    if (!pro) {
      return reply.status(409).send({
        code: "NO_PROFESSIONAL_ASSIGNED",
        message: "This job has no assigned professional yet",
      });
    }

    // --- Reputation: PRO NOW's own numbers only, never merged with external.
    const [ratingAggregate, completedJobs] = await Promise.all([
      app.prisma.review.aggregate({
        where: { professionalId: pro.id, moderationStatus: "PUBLISHED" },
        _avg: { overallRating: true },
        _count: { _all: true },
      }),
      app.prisma.job.count({
        where: { assignedProfessionalId: pro.id, status: { in: ["COMPLETED", "PAYMENT_CAPTURED", "CLOSED"] } },
      }),
    ]);

    const ratingCount: number = ratingAggregate._count._all ?? 0;
    const ratingAverage: number | null =
      ratingCount >= MIN_REVIEWS_FOR_RATING ? ratingAggregate._avg.overallRating ?? null : null;

    // --- Badges: enumerated facts, each derived from a row that exists.
    const verifications: VerificationBadgeKind[] = [];

    /*
     * A SANDBOX identity check is not a verification. `isSandbox` marks a
     * result produced by the stub adapter, and showing "זהות אומתה" for one
     * would be presenting mocked data as production — explicitly banned by
     * /CLAUDE.md §3 ("No fake integrations, no mocked data presented as
     * production, ever."). So the badge requires a real vendor result.
     */
    if (pro.identityVerification?.status === "VERIFIED" && pro.identityVerification.isSandbox === false) {
      verifications.push("IDENTITY_VERIFIED");
    }

    /*
     * The badge follows the explicit `verificationStatus`, never the mere
     * existence of a BusinessProfile row — that row only means the
     * professional entered details, not that anyone checked them
     * (/docs/10-TRUST-VERIFICATION.md §Onboarding step 3).
     */
    if (pro.businessProfile?.verificationStatus === "VERIFIED") {
      verifications.push("BUSINESS_VERIFIED");
    }

    const serviceCredentials = pro.credentials.filter(
      (c: { serviceId: string }) => c.serviceId === job.serviceId
    );
    const verifiedCredentials = serviceCredentials.filter(
      (c: { status: string }) => c.status === "VERIFIED"
    );
    if (verifiedCredentials.some((c: { type: string }) => c.type.toUpperCase() === "LICENSE")) {
      verifications.push("LICENSE_VERIFIED");
    }
    if (verifiedCredentials.length > 0) verifications.push("CREDENTIALS_CHECKED");

    const linkedExternal = pro.externalProfiles.find(
      (p: { linkStatus: string }) => p.linkStatus === "LINKED"
    );
    if (linkedExternal) verifications.push("EXTERNAL_REPUTATION_LINKED");

    /*
     * The external block was assembled straight from the newest snapshot:
     * whatever rating was on file went onto the card, however it had been
     * obtained, whatever the source's terms said, and however old it was.
     * `/docs/10` is specific about all three, and none of it was checked
     * here. `external-display.ts` now decides, and this route renders
     * what it returns.
     */
    const externalSnapshot = linkedExternal?.snapshots?.[0];
    const externalDisplay = linkedExternal
      ? externalReputationDisplay({
          linkStatus: linkedExternal.linkStatus,
          dataProvenance: linkedExternal.dataProvenance,
          allowedDisplayFields: linkedExternal.allowedDisplayFields,
          sourceIntegrationEnabled: linkedExternal.source?.integrationEnabled ?? false,
          sourceDisplayNameHe:
            linkedExternal.source?.displayNameHe || linkedExternal.source?.code || "",
          profileUrl: linkedExternal.profileUrl ?? null,
          rating: externalSnapshot?.rating ?? null,
          reviewCount: externalSnapshot?.reviewCount ?? null,
          lastVerifiedAt: externalSnapshot?.lastVerifiedAt ?? null,
        })
      : null;

    const face = await portraitForViewer(app.providers.storage, pro);
    const professional: ProfessionalSummaryView = {
      id: pro.id,
      displayName: pro.displayName,
      // The face chosen while joining (D1): only for the customer this professional was sent to.
      profilePhotoUrl: face.photoUrl,
      portraitKind: face.portraitKind,
      verifications,
      proNowCompletedJobs: completedJobs,
      proNowRatingAverage: ratingAverage,
      proNowRatingCount: ratingCount,
      externalReputation: externalDisplay
        ? {
            source: externalDisplay.source,
            ratingAverage: externalDisplay.ratingAverage,
            ratingCount: externalDisplay.ratingCount,
            profileUrl: externalDisplay.profileUrl,
          }
        : null,
    };

    // --- Price.
    const professionalService = pro.services.find(
      (s: { serviceId: string }) => s.serviceId === job.serviceId
    );
    const basePrice: number | null = professionalService?.basePriceMinorUnits ?? null;

    /*
     * Which fields are meaningful is decided by the service's priceModel —
     * see the pricing-configuration block on ProfessionalService in
     * schema.prisma and /docs/09-PAYMENTS.md §Pricing archetypes. A null
     * here means "the professional has not configured it", and the card
     * omits the line rather than showing a zero.
     */
    const price: PriceQuoteView = {
      priceModel: job.service.priceModel,
      currency: "ILS",
      ...(job.service.priceModel === "FIXED" ? { fixedTotalMinorUnits: basePrice } : {}),
      ...(job.service.priceModel === "VISIT_QUOTE" ? { visitFeeMinorUnits: basePrice } : {}),
      ...(job.service.priceModel === "HOURLY"
        ? {
            hourlyRateMinorUnits: basePrice,
            minimumBillableMinutes: professionalService?.minimumBillableMinutes ?? null,
          }
        : {}),
      ...(job.service.priceModel === "DISTANCE_TIME"
        ? {
            baseMinorUnits: basePrice,
            perKmMinorUnits: professionalService?.perKmMinorUnits ?? null,
            minimumFareMinorUnits: professionalService?.minimumFareMinorUnits ?? null,
          }
        : {}),
    };

    // --- ETA: the snapshot taken when the offer was made, and — while they
    //     are on the way (W9) — recomputed from their latest position by the
    //     same maps provider dispatch uses. Never substituted with a guess.
    const acceptedOffer = job.offers[0];
    let etaSeconds: number | null = acceptedOffer?.etaSecondsSnapshot ?? null;
    let etaAt: Date = acceptedOffer?.offeredAt ?? job.updatedAt;
    let routeBased = false;
    if ((job.status === "PRO_ASSIGNED" || job.status === "PRO_EN_ROUTE") && job.address) {
      const latest = await app.prisma.professionalLocation.findFirst({
        where: { professionalId: pro.id },
        orderBy: { receivedAt: "desc" },
      });
      if (latest && latest.receivedAt > etaAt) {
        const [live] = await app.providers.maps.getEtaBatch(
          { lat: job.address.lat, lng: job.address.lng },
          [{ id: pro.id, location: { lat: latest.lat, lng: latest.lng } }]
        );
        if (live) {
          etaSeconds = live.etaSeconds;
          etaAt = latest.receivedAt;
          routeBased = live.isRouteBased;
        }
      }
    }

    const result: JobMatchView = {
      jobId: job.id,
      status: job.status,
      serviceNameHe: job.service.nameHe,
      professional,
      eta:
        etaSeconds === null
          ? null
          : {
              etaSeconds,
              distanceMeters: null,
              // The snapshot does not record whether it came from a real
              // route, so it is reported as not route-based: the card then
              // marks it approximate. Under-claiming is the safe direction.
              isRouteBased: routeBased,
              computedAt: etaAt.toISOString(),
            },
      // The snapshot the trip started from, so a client can draw how far
      // along it is (the home capsule) without inventing the denominator.
      etaSecondsAtAssignment: acceptedOffer?.etaSecondsSnapshot ?? null,
      price,
    };

    return reply.send(result);
  });
}
