import type { PrismaClient } from "@prisma/client";
import { settlementForJob } from "./capture-payment.js";

/**
 * CLOSING THE JOB WITHOUT MONEY (docs/21 §5 D1).
 *
 * In the MVP no money moves through the app: the customer pays the
 * professional directly. The job still records what the work came to —
 * from the professional's own price, the approved quote and the measured
 * work, exactly as the ledger path would — so the receipt the customer
 * sees is the server's number, not the client's.
 *
 * When that cannot be said (no configured price, no measured duration),
 * the receipt says so and carries no amount. Nothing is charged either
 * way, so there is nothing to hold the job back for: it goes to review.
 */
export interface OutsideAppReceipt {
  paidInApp: false;
  amountMinorUnits: number | null;
  currency: string;
  /** How the amount was arrived at, or why there is none. */
  basis: string | null;
  reason: string | null;
}

export async function closeWithoutPayment(prisma: PrismaClient, jobId: string): Promise<OutsideAppReceipt> {
  const settlement = await settlementForJob(prisma, jobId);
  const receipt: OutsideAppReceipt = settlement.ok
    ? {
        paidInApp: false,
        amountMinorUnits: settlement.amount.minorUnits,
        currency: settlement.amount.currency,
        basis: settlement.basis,
        reason: null,
      }
    : { paidInApp: false, amountMinorUnits: null, currency: "ILS", basis: null, reason: settlement.reason };

  await prisma.job.update({ where: { id: jobId }, data: { status: "REVIEW_PENDING" } });
  await prisma.jobEvent.create({
    data: { jobId, type: "SETTLED_OUTSIDE_APP", actor: "SYSTEM", metadata: { ...receipt } },
  });
  return receipt;
}

/** The receipt recorded when the job closed, from its events. */
export function receiptFromEvents(events: Array<{ type: string; metadata: unknown }>): OutsideAppReceipt | null {
  const settled = [...events].reverse().find((e) => e.type === "SETTLED_OUTSIDE_APP");
  return settled ? (settled.metadata as OutsideAppReceipt) : null;
}
