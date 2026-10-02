import { randomInt } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { JobLock } from "./job-lock.js";

/**
 * Atomic offer acceptance — see /docs/05-DATABASE.md §Atomic accept and
 * /docs/08-DISPATCH-ENGINE.md §Atomic assignment. This is the single most
 * important correctness guarantee in the system: two professionals must
 * never both win the same job, even if they tap ACCEPT at the same
 * instant. Definition of Done per /CLAUDE.md §7: "not done
 * until two simultaneous accepts cannot create two assignments" — verified
 * in test/dispatch.atomic-accept.test.ts via a concurrency test, not by
 * inspection.
 *
 * Strategy: an optional job lock (`job-lock.ts`; Redis when configured,
 * none in the MVP) guards the check-then-act race as a fast path, and the
 * DB transaction's row lock (`SELECT ... FOR UPDATE` via `$queryRaw`
 * inside `$transaction`) is the actual source of correctness.
 */

export class OfferNoLongerAvailableError extends Error {
  constructor(offerId: string) {
    super(`OFFER_NO_LONGER_AVAILABLE: ${offerId}`);
  }
}

export interface AcceptOfferDeps {
  prisma: PrismaClient;
  lock: JobLock;
}

export async function acceptOffer(deps: AcceptOfferDeps, offerId: string, professionalId: string, requestId: string) {
  const { prisma, lock } = deps;

  const offer = await prisma.dispatchOffer.findUnique({ where: { id: offerId } });
  if (!offer) throw new OfferNoLongerAvailableError(offerId);
  if (offer.professionalId !== professionalId) throw new OfferNoLongerAvailableError(offerId);

  return lock.run(offer.jobId, async () => {
    return prisma.$transaction(async (tx) => {
      // Row-lock the job so a concurrent transaction cannot double-assign,
      // whether or not a job lock ran in front of this one.
      const [job] = await tx.$queryRawUnsafe<Array<{ id: string; status: string }>>(
        `SELECT id, status FROM jobs WHERE id = $1 FOR UPDATE`,
        offer.jobId
      );
      if (!job) throw new OfferNoLongerAvailableError(offerId);

      const freshOffer = await tx.dispatchOffer.findUnique({ where: { id: offerId } });
      if (!freshOffer || freshOffer.status !== "SENT" && freshOffer.status !== "CREATED" && freshOffer.status !== "VIEWED") {
        throw new OfferNoLongerAvailableError(offerId);
      }
      if (freshOffer.expiresAt.getTime() < Date.now()) {
        await tx.dispatchOffer.update({ where: { id: offerId }, data: { status: "EXPIRED" } });
        throw new OfferNoLongerAvailableError(offerId);
      }
      if (job.status !== "OFFERING" && job.status !== "SEARCHING") {
        throw new OfferNoLongerAvailableError(offerId);
      }

      await tx.dispatchOffer.update({
        where: { id: offerId },
        data: { status: "ACCEPTED", respondedAt: new Date() },
      });

      // Revoke every other live offer for this job.
      await tx.dispatchOffer.updateMany({
        where: {
          jobId: offer.jobId,
          id: { not: offerId },
          status: { in: ["CREATED", "SENT", "VIEWED"] },
        },
        data: { status: "REVOKED" },
      });

      await tx.job.update({
        where: { id: offer.jobId },
        data: {
          status: "PRO_ASSIGNED",
          assignedProfessionalId: professionalId,
          // The code the professional says at the door (the customer's arrival
          // screen, docs/21 W6). Every job gets one: a stranger is at the door
          // whether the job was ordered for yourself or for someone else.
          doorCode: issueDoorCode(),
        },
      });

      await tx.professionalProfile.update({
        where: { id: professionalId },
        data: { presenceState: "ASSIGNED" },
      });

      await tx.jobEvent.create({
        data: {
          jobId: offer.jobId,
          type: "OFFER_ACCEPTED",
          actor: "PROFESSIONAL",
          actorId: professionalId,
          metadata: { offerId },
          requestId,
        },
      });

      return { jobId: offer.jobId, professionalId };
    });
  }, () => {
    throw new OfferNoLongerAvailableError(offerId);
  });
}

/** Four digits from a CSPRNG. Short on purpose: it is said aloud at a door. */
export function issueDoorCode(): string {
  return String(randomInt(0, 10_000)).padStart(4, "0");
}
