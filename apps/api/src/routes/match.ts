import type { FastifyInstance } from "fastify";
import { SUMMARY_INCLUDE, professionalSummary } from "../domain/professional-summary.js";
import { customerJob, notFound, requireRole } from "../auth/access.js";
import {
  type JobMatchView,
  type PriceQuoteView,
} from "@pro-now/types";
import { jobServiceNameHe } from "../domain/job/service-name.js";

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
        assignedProfessional: { include: SUMMARY_INCLUDE },
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

    // Badges, rating, jobs and face: the same summary the professional sees as their own profile.
    const professional = await professionalSummary(app, pro, [job.serviceId]);

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
      serviceNameHe: jobServiceNameHe(job),
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
