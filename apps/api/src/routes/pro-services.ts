import type { FastifyInstance } from "fastify";
import { requireRole } from "../auth/access.js";
import {
  evaluateServiceCredentials,
  isAccountDispatchable,
} from "../domain/dispatch/credential-eligibility.js";

/**
 * WHICH SERVICES THIS PROFESSIONAL MAY GO ONLINE FOR.
 *
 * ---------------------------------------------------------------------
 * WHY THE SERVER ANSWERS THIS AND NOT THE APP
 * ---------------------------------------------------------------------
 * /CLAUDE.md §3: "Server is authoritative for eligibility." The
 * professional's app had no way to ask, so it did the next worst thing —
 * it listed two services written into the screen, `HOME_PLUMB_BLOCK` and
 * `HOME_ELECT_FAULT`, with switches beside them, for every professional in
 * the marketplace. A cleaner with an electrical switch. A tow driver
 * offered plumbing.
 *
 * Computing it in the client instead would be worse than not showing it:
 * the app would have to hold the credential rules, and the moment those
 * two copies disagree, the one the professional can see is the wrong one.
 *
 * ---------------------------------------------------------------------
 * WHY IT SAYS WHY
 * ---------------------------------------------------------------------
 * A greyed-out row with no reason is how a professional loses a day of
 * work without knowing they could have fixed it in ten minutes. Each
 * service comes back with the exact requirement that is missing, expired
 * or still unverified — the same evaluation dispatch itself runs, so what
 * the professional reads is what the dispatcher will decide.
 */
import {
  validatePricing,
  isChargeable,
  type PricingInput,
} from "../domain/pricing/professional-pricing.js";
import type { PriceModel } from "../domain/payments/settlement.js";
import { serviceItem, valuesChanged } from "../domain/review-loop.js";
import { recordChange } from "../domain/review-loop-store.js";

export default async function proServicesRoutes(app: FastifyInstance) {
  app.get("/v1/pro/services", { onRequest: requireRole("PROFESSIONAL") }, async (req, reply) => {
    const professional = await app.prisma.professionalProfile.findUnique({
      where: { userId: req.user!.userId },
      include: { services: true, credentials: true },
    });
    if (!professional) {
      return reply.status(404).send({ code: "PROFESSIONAL_NOT_FOUND", message: "No professional profile" });
    }

    /*
     * Only services this professional has actually applied for. The
     * catalogue is the market's list; this is theirs, and offering a
     * plumber a switch for pet grooming is not a feature.
     */
    const serviceIds = professional.services.map((s) => s.serviceId);
    if (serviceIds.length === 0) return reply.send({ services: [] });

    const services = await app.prisma.service.findMany({
      where: { id: { in: serviceIds } },
      include: { requirements: true },
    });

    /*
     * The account gate first. A professional who is not APPROVED receives
     * no dispatch at all, whatever their per-service credentials say, and
     * showing them eligible rows would be a promise the dispatcher breaks.
     */
    const accountOk = isAccountDispatchable(professional.verificationStatus);
    const now = new Date();

    return reply.send({
      services: services.map((service) => {
        const evaluation = evaluateServiceCredentials(
          service.requirements,
          professional.credentials.filter((c) => c.serviceId === service.id),
          now
        );
        const approval = professional.services.find((s) => s.serviceId === service.id);
        const serviceApproved = approval?.status?.trim().toUpperCase() === "APPROVED";

        return {
          serviceId: service.id,
          serviceCode: service.code,
          nameHe: service.nameHe,
          /*
           * The price, and what kind of price it is.
           *
           * Added with the pricing route: the screen that lets a
           * professional set a number cannot render without knowing which
           * boxes to show, and `priceModel` is what decides that. Without
           * it the list could only ever be read-only.
           */
          priceModel: service.priceModel,
          basePriceMinorUnits: approval?.basePriceMinorUnits ?? null,
          minimumBillableMinutes: approval?.minimumBillableMinutes ?? null,
          perKmMinorUnits: approval?.perKmMinorUnits ?? null,
          minimumFareMinorUnits: approval?.minimumFareMinorUnits ?? null,
          /*
           * Whether a job on this service could be charged at all. A
           * service can be dispatch-ELIGIBLE and still unchargeable, and
           * those are different sentences: one is about documents, the
           * other is about a number nobody has typed.
           */
          chargeable: isChargeable(service.priceModel as PriceModel, {
            basePriceMinorUnits: approval?.basePriceMinorUnits ?? null,
            perKmMinorUnits: approval?.perKmMinorUnits ?? null,
          }),
          /** Dispatch-eligible for THIS service, right now. */
          eligible: accountOk && serviceApproved && evaluation.satisfied,
          accountApproved: accountOk,
          serviceApproved,
          /*
           * Named requirements rather than a boolean, because "you are not
           * eligible" is not actionable and "your insurance expired" is.
           */
          missing: evaluation.missing,
          expired: evaluation.expired,
          unverified: evaluation.unverified,
        };
      }),
    });
  });
  /**
   * The professional sets their own price for a service they offer.
   *
   * Until this existed, nothing in the product could write
   * `basePriceMinorUnits` except the development seed — so a real
   * professional finished a job and the settlement answered
   * NO_CONFIGURED_PRICE. The payment chain worked for six demonstration
   * people and dead-ended for everybody else.
   *
   * The server has almost no opinion here on purpose. No default, no
   * suggested range, no floor, no "that looks low": prices are the
   * professional's own commercial decision (/CLAUDE.md §4 and
   * `ProfessionalService`). What is checked is structure — which fields
   * this service's price model gives meaning to, and that money is a
   * whole, non-negative number of agorot.
   */
  app.patch("/v1/pro/services/:serviceId/pricing", { onRequest: requireRole("PROFESSIONAL") }, async (req, reply) => {
    const { serviceId } = req.params as { serviceId: string };
    const body = (req.body ?? {}) as PricingInput;

    const professional = await app.prisma.professionalProfile.findUnique({
      where: { userId: req.user!.userId },
    });
    if (!professional) {
      return reply.status(404).send({ code: "PROFESSIONAL_NOT_FOUND", message: "No professional profile" });
    }

    const professionalService = await app.prisma.professionalService.findUnique({
      where: { professionalId_serviceId: { professionalId: professional.id, serviceId } },
      include: { service: true },
    });
    if (!professionalService) {
      // They do not offer this service. 404 rather than 403 for the same
      // reason as elsewhere: the endpoint does not confirm what exists.
      return reply.status(404).send({
        code: "SERVICE_NOT_OFFERED",
        message: "This service is not on your list",
      });
    }

    const validation = validatePricing(
      professionalService.service.priceModel as PriceModel,
      body
    );
    if (!validation.ok) {
      return reply.status(400).send({
        code: "VALIDATION_FAILED",
        message: "Request body failed validation",
        fields: validation.errors.map((e) => ({ path: e.field, message: e.messageHe })),
      });
    }

    const updated = await app.prisma.professionalService.update({
      where: { professionalId_serviceId: { professionalId: professional.id, serviceId } },
      data: validation.value,
    });
    // The review loop (docs/10 §Review loop): only a real change to a stored price fixes a request about this service.
    const pick = (ps: typeof updated) =>
      Object.fromEntries(Object.keys(validation.value).map((k) => [k, ps[k as keyof typeof ps]]));
    await recordChange(app.prisma, {
      professionalId: professional.id,
      itemKey: serviceItem(serviceId),
      actorId: req.user!.userId,
      requestId: req.id,
      changed: valuesChanged(pick(professionalService), pick(updated)),
    });

    return reply.send({
      ok: true,
      serviceId,
      priceModel: professionalService.service.priceModel,
      basePriceMinorUnits: updated.basePriceMinorUnits,
      minimumBillableMinutes: updated.minimumBillableMinutes,
      perKmMinorUnits: updated.perKmMinorUnits,
      minimumFareMinorUnits: updated.minimumFareMinorUnits,
      /*
       * Whether a job on this service can be charged at all, answered
       * here rather than discovered at settlement. A professional whose
       * price is half-set should be told on the screen where they set it.
       */
      chargeable: isChargeable(professionalService.service.priceModel as PriceModel, validation.value),
    });
  });

}
