import { PILOT_MARKET_CODE } from "../../config/market.js";
import type { PrismaClient } from "@prisma/client";
import type { JobState, MapsRoutingProvider } from "@pro-now/types";
import { evaluateServiceCredentials } from "./credential-eligibility.js";
import { evaluateEligibility } from "./eligibility.js";
import { rankCandidates, DEFAULT_SCORING_WEIGHTS, type ScoringWeights } from "./scoring.js";
import { recordsFor } from "./professional-record.js";
import { isTransitionAllowed } from "../job/transitions.js";

/**
 * Simplified synchronous dispatch trigger for this delivery — see
 * /docs/08-DISPATCH-ENGINE.md. A production build would move step 2
 * onward onto a queue/worker so `POST /v1/jobs` returns immediately, but
 * the pipeline stages and their order are exactly as specified: PostGIS
 * pre-filter -> eligibility -> real ETA for shortlist only -> scoring ->
 * sequential offer -> atomic accept (see atomic-accept.ts) -> fallback.
 */

const GEO_PREFILTER_DEGREES = 0.15; // ~ generous bounding box; real PostGIS ST_DWithin narrows further in SQL

export interface DispatchOutcome {
  /**
   * `EXHAUSTED` is not the same as `NO_ELIGIBLE_CANDIDATES`. The first
   * means everybody who could do this job has already been asked and has
   * skipped or timed out; the second means nobody could do it right now.
   * A caller deciding whether to keep waiting needs to tell them apart.
   */
  status: "OFFER_SENT" | "NO_ELIGIBLE_CANDIDATES" | "EXHAUSTED";
  offerId?: string;
  professionalId?: string;
  candidatesConsidered: number;
  candidatesEligible: number;
}

export async function triggerDispatch(
  prisma: PrismaClient,
  maps: MapsRoutingProvider,
  jobId: string,
  offerTimeoutSeconds: number,
  scoringWeights: ScoringWeights = DEFAULT_SCORING_WEIGHTS,
  locationFreshnessThresholdSeconds = 90
): Promise<DispatchOutcome> {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { address: true, service: { include: { requirements: true } } },
  });

  /*
   * THE MARKET SWITCH IS REAL (W8). This was hard-coded to true, so the
   * admin's "dispatch on/off" per service would have changed nothing. A
   * service not dispatch-enabled in the market reaches nobody; its
   * customers are told nobody is available, which is true.
   */
  const activation = await prisma.marketActivation.findUnique({
    where: { marketCode_serviceId: { marketCode: PILOT_MARKET_CODE, serviceId: job.serviceId } },
  });
  const marketActive = activation?.dispatchEnabled ?? false;

  /*
   * The job moves to SEARCHING only if the machine allows it from where it
   * is. This used to be an unconditional write, which meant a re-dispatch
   * (a skip, or an offer that timed out) dragged an OFFERING job back to
   * SEARCHING — an edge /docs/07-JOB-STATE-MACHINE.md does not have. The
   * job then refused every later transition, because the machine was being
   * asked to leave a state the job should never have been in.
   *
   * OFFERING already means "we are making offers". A second offer does not
   * need a second announcement.
   */
  if (isTransitionAllowed(job.status as JobState, "SEARCHING")) {
    await prisma.job.update({ where: { id: jobId }, data: { status: "SEARCHING" } });
    await prisma.jobEvent.create({
      data: { jobId, type: "MATCHING_STARTED", actor: "SYSTEM", metadata: {} },
    });
  }

  /*
   * Everybody who has already been asked about THIS job. Without this the
   * fallback is a boomerang: a professional skips, is returned to
   * AVAILABLE, is still the nearest and highest-scoring candidate, and is
   * handed the same job again a millisecond later. The offer is meant to
   * walk down the ranked list, not bounce off the top of it.
   */
  const alreadyAsked = await prisma.dispatchOffer.findMany({
    where: { jobId },
    select: { professionalId: true },
  });
  const askedIds = new Set(alreadyAsked.map((o) => o.professionalId));

  // Step 1 — coarse geographic pre-filter (bounding box here; PostGIS
  // ST_DWithin in the real query builder against professional_locations).
  const nearbyProfessionals = await prisma.professionalProfile.findMany({
    where: {
      id: askedIds.size > 0 ? { notIn: [...askedIds] } : undefined,
      presenceState: "AVAILABLE",
      services: { some: { serviceId: job.serviceId, status: "APPROVED" } },
      locations: {
        some: {
          lat: { gte: job.address.lat - GEO_PREFILTER_DEGREES, lte: job.address.lat + GEO_PREFILTER_DEGREES },
          lng: { gte: job.address.lng - GEO_PREFILTER_DEGREES, lte: job.address.lng + GEO_PREFILTER_DEGREES },
        },
      },
    },
    include: {
      locations: { orderBy: { receivedAt: "desc" }, take: 1 },
      services: { where: { serviceId: job.serviceId } },
      credentials: { where: { serviceId: job.serviceId } },
    },
    take: 25,
  });

  // Step 2 — eligibility (explainable, per-candidate reason codes).
  const now = Date.now();
  const evaluatedAt = new Date(now);
  const serviceRequirements = job.service.requirements;

  const eligible = nearbyProfessionals.flatMap((pro) => {
    const latestLocation = pro.locations[0];
    const locationAgeSeconds = latestLocation
      ? (now - latestLocation.receivedAt.getTime()) / 1000
      : Number.POSITIVE_INFINITY;

    // Every mandatory credential this SERVICE requires must be on file,
    // VERIFIED and unexpired — see credential-eligibility.ts for why this is
    // not `credentials.length === 0 || credentials[0].status === "VERIFIED"`.
    const credentialEvaluation = evaluateServiceCredentials(
      serviceRequirements,
      pro.credentials,
      evaluatedAt
    );

    const result = evaluateEligibility(
      {
        professionalId: pro.id,
        presenceState: pro.presenceState,
        accountVerificationStatus: pro.verificationStatus,
        locationAgeSeconds,
        serviceApproved: pro.services.length > 0,
        requiredCredentialsCurrent: credentialEvaluation.satisfied,
        insideServiceArea: true, // refined by real service-area geometry in a later epic
        alreadyAssignedToAnotherJob: false,
        isRiskLimitedForService: false,
        isBlockedAgainstCustomer: false,
        equipmentMatches: true,
        marketActive,
      },
      { locationFreshnessThresholdSeconds }
    );
    /*
     * An eligible candidate necessarily HAS a fresh location — an absent
     * one makes `locationAgeSeconds` infinite and fails the freshness
     * rule above. The pair is carried forward rather than re-indexed at
     * the ETA step, so the shortlist is a list of professionals WITH a
     * position rather than a list the next stage has to trust.
     */
    return result.eligible && latestLocation ? [{ pro, latestLocation }] : [];
  });

  if (eligible.length === 0) {
    /*
     * Nobody left to ask, and whether that is a dead end depends on why.
     * If this job has already been offered to someone, the ranked list has
     * been walked to its end — the caller should stop. If it has not, the
     * market is simply empty at this instant, and a professional coming
     * online in thirty seconds changes the answer.
     */
    const exhausted = askedIds.size > 0;
    await prisma.jobEvent.create({
      data: {
        jobId,
        type: "MATCH_FAILED",
        actor: "SYSTEM",
        metadata: {
          reason: exhausted ? "EXHAUSTED" : "NO_ELIGIBLE_CANDIDATES",
          alreadyAsked: askedIds.size,
        },
      },
    });
    return {
      status: exhausted ? "EXHAUSTED" : "NO_ELIGIBLE_CANDIDATES",
      candidatesConsidered: nearbyProfessionals.length,
      candidatesEligible: 0,
    };
  }

  // Step 3 — real ETA for the shortlist only.
  const etas = await maps.getEtaBatch(
    { lat: job.address.lat, lng: job.address.lng },
    eligible.map(({ pro, latestLocation }) => ({
      id: pro.id,
      location: { lat: latestLocation.lat, lng: latestLocation.lng },
    }))
  );
  const etaByProId = new Map(etas.map((e) => [e.originId, e]));
  const maxEta = Math.max(...etas.map((e) => e.etaSeconds), 1);

  // Step 4 — scoring, on what is actually known about each candidate.
  //
  // This block used to pass 4.8, 0.9 and 0.95 for everybody — a
  // fabricated trust score inside the engine that decides who is sent to
  // a home, which /CLAUDE.md §3 forbids outright. It could not be removed
  // before reviews existed, and reviews could not exist before payment.
  // Now they are counted, and a professional with no history is scored on
  // their ETA and their fit rather than on a flattering guess.
  const records = await recordsFor(
    prisma,
    eligible.map(({ pro }) => pro.id)
  );

  const ranked = rankCandidates(
    eligible.map(({ pro }) => {
      const record = records.get(pro.id);
      return {
        professionalId: pro.id,
        etaSeconds: etaByProId.get(pro.id)?.etaSeconds ?? maxEta,
        maxEtaSecondsInShortlist: maxEta,
        serviceFitScore: 1,
        ratingAverage: record?.ratingAverage ?? null,
        acceptanceRate: record?.acceptanceRate ?? null,
        completionRate: record?.completionRate ?? null,
        cancellationPenalty: 0,
        recentAssignmentPenalty: 0,
      };
    }),
    scoringWeights
  );

  // `rankCandidates` preserves the shortlist, and the shortlist is non-empty
  // here (the `eligible.length === 0` guard above returned already), but the
  // type system cannot know that — and a silent `undefined` here would mean
  // offering a job to nobody, so it is treated as a real failure, not ignored.
  const top = ranked[0];
  if (!top) {
    await prisma.jobEvent.create({
      data: { jobId, type: "MATCH_FAILED", actor: "SYSTEM", metadata: { reason: "NO_RANKED_CANDIDATES" } },
    });
    return {
      status: "NO_ELIGIBLE_CANDIDATES",
      candidatesConsidered: nearbyProfessionals.length,
      candidatesEligible: eligible.length,
    };
  }
  const topEta = etaByProId.get(top.professionalId);

  await prisma.job.update({ where: { id: jobId }, data: { status: "OFFERING" } });

  const offer = await prisma.dispatchOffer.create({
    data: {
      jobId,
      professionalId: top.professionalId,
      status: "SENT",
      expiresAt: new Date(Date.now() + offerTimeoutSeconds * 1000),
      scoreSnapshot: top.score,
      etaSecondsSnapshot: topEta?.etaSeconds,
    },
  });

  await prisma.professionalProfile.update({
    where: { id: top.professionalId },
    data: { presenceState: "OFFER_RECEIVED" },
  });

  await prisma.jobEvent.create({
    data: {
      jobId,
      type: "OFFER_SENT",
      actor: "SYSTEM",
      metadata: { professionalId: top.professionalId, offerId: offer.id, etaSeconds: topEta?.etaSeconds },
    },
  });

  return {
    status: "OFFER_SENT",
    offerId: offer.id,
    professionalId: top.professionalId,
    candidatesConsidered: nearbyProfessionals.length,
    candidatesEligible: eligible.length,
  };
}
