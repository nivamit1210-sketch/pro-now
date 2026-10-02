import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { MIN_REVIEWS_FOR_RATING, type ProfessionalSummaryView, type VerificationBadgeKind } from "@pro-now/types";

import { externalReputationDisplay } from "./reputation/external-display.js";
import { portraitForViewer } from "./portrait.js";
import { currentCheck, identityBadge } from "./identity-check.js";

/** What `professionalSummary` reads from a professional's row. */
export const SUMMARY_INCLUDE = {
  identityChecks: { orderBy: { createdAt: "desc" as const }, take: 5 },
  businessProfile: true,
  portraitUpload: true,
  credentials: true,
  services: true,
  externalProfiles: { include: { source: true, snapshots: { orderBy: { createdAt: "desc" as const }, take: 1 } } },
} satisfies Prisma.ProfessionalProfileInclude;

export type SummaryProfessional = Prisma.ProfessionalProfileGetPayload<{ include: typeof SUMMARY_INCLUDE }>;

/**
 * A professional as a customer is shown them: PRO NOW's own numbers, the
 * badges each backed by a row that exists, and the face they chose (D1).
 * One function for the customer's match card and the professional's own
 * "ככה הלקוחות רואים אותך", so the two can never disagree.
 *
 * `serviceIds`: the services whose credentials earn the licence badges —
 * the job's one service on a match, every approved service on the profile.
 */
export async function professionalSummary(
  app: FastifyInstance,
  pro: SummaryProfessional,
  serviceIds: readonly string[]
): Promise<ProfessionalSummaryView> {
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
   * A PRO NOW reviewer's approval is IDENTITY_CHECKED (docs/10).
   */
  const identity = identityBadge(currentCheck(pro.identityChecks));
  if (identity) verifications.push(identity);

  /*
   * The badge follows the explicit `verificationStatus`, never the mere
   * existence of a BusinessProfile row — that row only means the
   * professional entered details, not that anyone checked them
   * (/docs/10-TRUST-VERIFICATION.md §Onboarding step 3).
   */
  if (pro.businessProfile?.verificationStatus === "VERIFIED") {
    verifications.push("BUSINESS_VERIFIED");
  }

  const verifiedCredentials = pro.credentials.filter((c) => serviceIds.includes(c.serviceId) && c.status === "VERIFIED");
  if (verifiedCredentials.some((c) => c.type.toUpperCase() === "LICENSE")) {
    verifications.push("LICENSE_VERIFIED");
  }
  if (verifiedCredentials.length > 0) verifications.push("CREDENTIALS_CHECKED");

  const linkedExternal = pro.externalProfiles.find((p) => p.linkStatus === "LINKED");
  if (linkedExternal) verifications.push("EXTERNAL_REPUTATION_LINKED");

  /*
   * `external-display.ts` decides what of an external profile may be shown
   * (/docs/10: provenance, the source's terms, freshness); this renders
   * what it returns.
   */
  const externalSnapshot = linkedExternal?.snapshots?.[0];
  const externalDisplay = linkedExternal
    ? externalReputationDisplay({
        linkStatus: linkedExternal.linkStatus,
        dataProvenance: linkedExternal.dataProvenance,
        allowedDisplayFields: linkedExternal.allowedDisplayFields,
        sourceIntegrationEnabled: linkedExternal.source?.integrationEnabled ?? false,
        sourceDisplayNameHe: linkedExternal.source?.displayNameHe || linkedExternal.source?.code || "",
        profileUrl: linkedExternal.profileUrl ?? null,
        rating: externalSnapshot?.rating ?? null,
        reviewCount: externalSnapshot?.reviewCount ?? null,
        lastVerifiedAt: externalSnapshot?.lastVerifiedAt ?? null,
      })
    : null;

  const face = await portraitForViewer(app.providers.storage, pro);
  return {
    id: pro.id,
    displayName: pro.displayName,
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
}
