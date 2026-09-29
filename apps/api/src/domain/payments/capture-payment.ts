/**
 * CLOSING THE JOB, WITH MONEY.
 *
 * The journey ended at COMPLETION_PENDING and could not go further. Not
 * because anything was broken — because nothing had been built: no route
 * moved a job to COMPLETED, no payment was ever created, and
 * `ledger_entries` had never held a row. The professional's earnings
 * screen was already written to derive from that table and was therefore
 * correct and empty; `reviews.ts` was already right to refuse a review
 * before payment, so reviews were unreachable too.
 *
 * ---------------------------------------------------------------------
 * THE SEQUENCE
 * ---------------------------------------------------------------------
 *   COMPLETION_PENDING  the professional says the work is done
 *     → COMPLETED        the CUSTOMER confirms it — not the professional,
 *                        and not a timer
 *     → PAYMENT_PENDING  an amount has been settled and a Payment exists
 *     → PAYMENT_CAPTURED the provider took it
 *     → REVIEW_PENDING   which is where reviews.ts starts accepting
 *
 * Each step writes a `job_event`, so "why was I charged this" is
 * answerable from the record rather than from a guess.
 *
 * ---------------------------------------------------------------------
 * WHAT IT WILL NOT DO
 * ---------------------------------------------------------------------
 * It will not settle an amount it cannot justify. `settle()` returns a
 * reason instead of a number when the price was never configured, the
 * hourly work was never measured, or a courier's distance was never
 * recorded — and this stops there, leaves the job in COMPLETED, and
 * writes the reason into the job's events. A job stuck visibly is
 * recoverable; a job charged wrongly is not.
 *
 * It will not invent the commission. When no rate is configured the
 * CUSTOMER_CHARGE row is written alone, and the professional's payable
 * stays unwritten because it is unknown — see `splitCommission`.
 *
 * It will not trust a client that says a payment succeeded
 * (/docs/09-PAYMENTS.md §Ledger). The capture result comes from the
 * provider adapter, through the server, every time.
 */
import type { PrismaClient } from "@prisma/client";
import type { PaymentProvider } from "@pro-now/types";

import { settle, splitCommission, type PriceModel } from "./settlement.js";

/** `app_config` key. Absent by design — /CLAUDE.md §4. */
export const COMMISSION_CONFIG_KEY = "payments.commission.percent";

export type CaptureOutcome =
  | { status: "CAPTURED"; paymentId: string; amountMinorUnits: number; ledgerRows: number }
  | { status: "NOT_SETTLEABLE"; reason: string }
  | { status: "ALREADY_SETTLED"; paymentId: string };

/**
 * The configured commission, or null.
 *
 * Stored as a number in `app_config.value`. Anything unparseable is null
 * rather than zero: a malformed rate must not silently become "the
 * platform takes nothing", which would be a business decision made by a
 * typo.
 */
export async function commissionPercent(prisma: PrismaClient): Promise<number | null> {
  const row = await prisma.appConfig.findUnique({ where: { key: COMMISSION_CONFIG_KEY } });
  if (!row) return null;
  const raw = (row.value as { percent?: unknown } | null)?.percent;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Minutes between the work starting and the professional reporting it
 * done, from the job's own events.
 *
 * The timer is server-authoritative (/docs/09-PAYMENTS.md), which means
 * exactly this: the duration is read from what the server recorded, never
 * from a number a client sends. Null when either end is missing, which
 * `settle()` then refuses to price.
 */
export async function workedMinutesFor(
  prisma: PrismaClient,
  jobId: string
): Promise<number | null> {
  const events = await prisma.jobEvent.findMany({
    where: { jobId, type: { in: ["SERVICE_STARTED", "SERVICE_COMPLETION_REQUESTED"] } },
    orderBy: { createdAt: "asc" },
  });
  const started = events.find((e) => e.type === "SERVICE_STARTED");
  const finished = events.find((e) => e.type === "SERVICE_COMPLETION_REQUESTED");
  if (!started || !finished) return null;
  const minutes = (finished.createdAt.getTime() - started.createdAt.getTime()) / 60_000;
  return minutes >= 0 ? Math.round(minutes) : null;
}

/**
 * What the job's work comes to, from the professional's own configured
 * price, the approved quote and the measured work — or the reason it
 * cannot be said. Shared by the ledger path and the no-money path (D1).
 */
export async function settlementForJob(prisma: PrismaClient, jobId: string) {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { service: true, quotes: true },
  });

  const professionalService = job.assignedProfessionalId
    ? await prisma.professionalService.findUnique({
        where: {
          professionalId_serviceId: {
            professionalId: job.assignedProfessionalId,
            serviceId: job.serviceId,
          },
        },
      })
    : null;

  const approvedQuote = job.quotes.find((q) => q.id === job.approvedQuoteId) ?? null;

  return settle({
    priceModel: job.service.priceModel as PriceModel,
    basePriceMinorUnits: professionalService?.basePriceMinorUnits ?? null,
    minimumBillableMinutes: professionalService?.minimumBillableMinutes ?? null,
    perKmMinorUnits: professionalService?.perKmMinorUnits ?? null,
    minimumFareMinorUnits: professionalService?.minimumFareMinorUnits ?? null,
    approvedQuoteTotalMinorUnits: approvedQuote?.totalMinorUnits ?? null,
    workedMinutes: await workedMinutesFor(prisma, jobId),
    // No courier job records its distance yet. `settle()` refuses rather
    // than guessing, which is why this is null and not zero.
    distanceKm: null,
  });
}

export async function capturePaymentForJob(
  prisma: PrismaClient,
  payments: PaymentProvider,
  jobId: string,
  idempotencyKey: string
): Promise<CaptureOutcome> {
  const existing = await prisma.payment.findUnique({ where: { idempotencyKey } });
  if (existing) return { status: "ALREADY_SETTLED", paymentId: existing.id };

  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId }, select: { customerId: true } });
  const settlement = await settlementForJob(prisma, jobId);

  if (!settlement.ok) {
    await prisma.jobEvent.create({
      data: {
        jobId,
        type: "SETTLEMENT_FAILED",
        actor: "SYSTEM",
        metadata: { reason: settlement.reason },
      },
    });
    return { status: "NOT_SETTLEABLE", reason: settlement.reason };
  }

  const amountMinorUnits = settlement.amount.minorUnits;

  await prisma.job.update({ where: { id: jobId }, data: { status: "PAYMENT_PENDING" } });

  /*
   * `paymentMethodToken` is the customer's stored card at the provider,
   * and no customer has one: nothing in this product collects a payment
   * method yet. The sandbox adapter does not read it, so the token is
   * named for what it is rather than dressed up as a card — a real
   * provider would refuse it, which is the correct outcome for a
   * deployment that has skipped collecting one.
   */
  const authorized = await payments.authorize({
    jobId,
    customerId: job.customerId,
    amount: settlement.amount,
    paymentMethodToken: "sandbox-no-payment-method-collected",
    idempotencyKey,
  });

  const payment = await prisma.payment.create({
    data: {
      jobId,
      status: "AUTHORIZED",
      amountMinorUnits,
      currency: settlement.amount.currency,
      providerName: payments.vendorName,
      isSandbox: true,
      providerReference: authorized.providerReference,
      idempotencyKey,
    },
  });
  await prisma.paymentEvent.create({
    data: {
      paymentId: payment.id,
      // Unique per payment and per step, because `providerEventId` is the
      // idempotency key a real provider's webhooks will arrive under.
      providerEventId: `${payment.id}:AUTHORIZED`,
      type: "AUTHORIZED",
      rawPayload: {
        basis: settlement.basis,
        providerReference: authorized.providerReference ?? null,
      },
    },
  });

  const captured = await payments.capture(authorized.paymentId, settlement.amount);

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: captured.status === "CAPTURED" ? "CAPTURED" : "FAILED" },
  });
  await prisma.paymentEvent.create({
    data: {
      paymentId: payment.id,
      providerEventId: `${payment.id}:${captured.status}`,
      type: captured.status,
      rawPayload: { basis: settlement.basis },
    },
  });

  if (captured.status !== "CAPTURED") {
    await prisma.jobEvent.create({
      data: { jobId, type: "PAYMENT_FAILED", actor: "SYSTEM", metadata: { paymentId: payment.id } },
    });
    return { status: "NOT_SETTLEABLE", reason: "PAYMENT_NOT_CAPTURED" };
  }

  /*
   * The ledger. CUSTOMER_CHARGE is what was taken and is always known.
   * The split is only written when a commission has been set — the
   * amounts are otherwise unknowable, and an unwritten row is the honest
   * form of an unknown number. `/v1/pro/earnings` already reads it this
   * way: gross and net together, or neither.
   */
  const percent = await commissionPercent(prisma);
  const split = splitCommission(amountMinorUnits, percent);

  const ledger: Array<{ entryType: string; amountMinorUnits: number }> = [
    { entryType: "CUSTOMER_CHARGE", amountMinorUnits },
  ];
  if (split) {
    ledger.push({ entryType: "PLATFORM_FEE", amountMinorUnits: -split.platformFeeMinorUnits });
    ledger.push({
      entryType: "PROFESSIONAL_PAYABLE",
      amountMinorUnits: split.professionalPayableMinorUnits,
    });
  }

  await prisma.ledgerEntry.createMany({
    data: ledger.map((e) => ({
      paymentId: payment.id,
      entryType: e.entryType,
      amountMinorUnits: e.amountMinorUnits,
      currency: settlement.amount.currency,
    })),
  });

  await prisma.job.update({ where: { id: jobId }, data: { status: "PAYMENT_CAPTURED" } });
  await prisma.jobEvent.create({
    data: {
      jobId,
      type: "PAYMENT_CAPTURED",
      actor: "SYSTEM",
      metadata: {
        paymentId: payment.id,
        amountMinorUnits,
        basis: settlement.basis,
        commissionPercent: percent,
        // Said out loud in the record, because a ledger with no payable
        // row is otherwise indistinguishable from a bug.
        splitWritten: split !== null,
      },
    },
  });

  await prisma.job.update({ where: { id: jobId }, data: { status: "REVIEW_PENDING" } });
  await prisma.jobEvent.create({
    data: { jobId, type: "REVIEW_INVITED", actor: "SYSTEM", metadata: {} },
  });

  return {
    status: "CAPTURED",
    paymentId: payment.id,
    amountMinorUnits,
    ledgerRows: ledger.length,
  };
}
