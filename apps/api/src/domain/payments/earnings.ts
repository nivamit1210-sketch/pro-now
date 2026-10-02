/**
 * WHAT THE PROFESSIONAL EARNED, ITEMISED.
 *
 * ---------------------------------------------------------------------
 * WHY FOUR NUMBERS WERE NOT ENOUGH
 * ---------------------------------------------------------------------
 * `/v1/pro/earnings` returned a lifetime net, a lifetime gross, a
 * currency and a count. `ProEarningsBody` — the screen that was designed
 * for this, audited by `verify:a11y`, and which the shipped app does not
 * currently render — needs a week of days and a list of jobs, each job
 * with **every deduction named**.
 *
 * Its own header says why, and it is the best argument in this codebase
 * for doing the work properly:
 *
 *   "A professional's relationship with a marketplace is mostly this
 *    screen: if the arithmetic is hard to follow, they assume they are
 *    being shaved, and they are often right somewhere else. So every
 *    deduction is named and shown, and the gross is shown beside the net.
 *    A platform that only displays take-home is hiding its own commission
 *    behind a friendly number."
 *
 * The ledger has held exactly that shape since §21. Nothing was reading
 * it.
 *
 * ---------------------------------------------------------------------
 * NET CAN BE UNKNOWN, AND UNKNOWN IS NOT ZERO
 * ---------------------------------------------------------------------
 * With no commission percentage configured, a captured payment writes
 * CUSTOMER_CHARGE and nothing else: the platform's cut and therefore the
 * professional's share are not computable, and §4 forbids guessing them.
 *
 * So `netMinorUnits` is nullable here and all the way to the screen.
 * Rendering ₪0.00 would tell somebody who worked all week that they
 * earned nothing, which is a worse falsehood than the one the nullable
 * type costs to carry.
 */
import type { PrismaClient } from "@prisma/client";

export interface EarningDeduction {
  code: string;
  labelHe: string;
  /** Positive magnitude. The screen renders the minus sign. */
  minorUnits: number;
}

export interface EarningJobLine {
  jobId: string;
  serviceCode: string;
  serviceNameHe: string;
  completedAt: string;
  grossMinorUnits: number;
  deductions: EarningDeduction[];
  /** Null when no commission is configured — see above. */
  netMinorUnits: number | null;
}

export interface EarningDayLine {
  /** Midnight of the day, ISO. The screen decides how to label it. */
  dateISO: string;
  netMinorUnits: number | null;
  jobs: number;
}

export interface EarningsSummary {
  currency: string;
  periodFromISO: string;
  periodToISO: string;
  periodGrossMinorUnits: number;
  periodNetMinorUnits: number | null;
  periodJobCount: number;
  days: EarningDayLine[];
  jobs: EarningJobLine[];
  /**
   * True when at least one captured payment has no payable row, which is
   * what an unset commission looks like from here. The screen says so
   * rather than leaving a professional to wonder about a dash.
   */
  awaitingCommissionDecision: boolean;
  /**
   * The customers paid the professional directly (docs/21 §5 D1): the
   * amounts are what the jobs came to, nothing was taken, and there is no
   * net because none of it passed through PRO NOW.
   */
  paidDirectly: boolean;
  /** Jobs that closed with no amount (no price configured or measured). Counted, never shown as ₪0. */
  unpricedJobCount: number;
}

/** Hebrew for each ledger entry type a professional can be charged. */
const DEDUCTION_LABELS_HE: Readonly<Record<string, string>> = {
  PLATFORM_FEE: "עמלת פלטפורמה",
  REFUND: "החזר ללקוח",
};

const DAY_MS = 86_400_000;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function earningsFor(
  prisma: PrismaClient,
  professionalId: string,
  now: Date = new Date(),
  days = 7
): Promise<EarningsSummary> {
  const periodFrom = new Date(startOfDay(now).getTime() - (days - 1) * DAY_MS);

  const payments = await prisma.payment.findMany({
    where: {
      job: { assignedProfessionalId: professionalId },
      status: "CAPTURED",
      createdAt: { gte: periodFrom },
    },
    include: {
      ledgerEntries: true,
      job: { include: { service: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const jobs: EarningJobLine[] = payments.map((payment) => {
    const charge = payment.ledgerEntries
      .filter((e) => e.entryType === "CUSTOMER_CHARGE")
      .reduce((sum, e) => sum + e.amountMinorUnits, 0);

    const payableRows = payment.ledgerEntries.filter(
      (e) => e.entryType === "PROFESSIONAL_PAYABLE"
    );

    const deductions = payment.ledgerEntries
      .filter((e) => e.entryType !== "CUSTOMER_CHARGE" && e.entryType !== "PROFESSIONAL_PAYABLE")
      .map((e) => ({
        code: e.entryType,
        // An unlabelled deduction is exactly the "single fees lump" the
        // screen refuses, so an unknown type keeps its own name rather
        // than being folded into something vague.
        labelHe: DEDUCTION_LABELS_HE[e.entryType] ?? e.entryType,
        minorUnits: Math.abs(e.amountMinorUnits),
      }));

    return {
      jobId: payment.jobId,
      serviceCode: payment.job.service.code,
      serviceNameHe: payment.job.service.nameHe,
      completedAt: payment.createdAt.toISOString(),
      grossMinorUnits: charge,
      deductions,
      netMinorUnits:
        payableRows.length === 0
          ? null
          : payableRows.reduce((sum, e) => sum + e.amountMinorUnits, 0),
    };
  });

  return summarise(jobs, periodFrom, now, days, { paidDirectly: false, unpricedJobCount: 0 });
}

function summarise(
  jobs: EarningJobLine[],
  periodFrom: Date,
  now: Date,
  days: number,
  extra: { paidDirectly: boolean; unpricedJobCount: number }
): EarningsSummary {
  const byDay = new Map<string, { net: number | null; gross: number; jobs: number }>();
  for (let i = 0; i < days; i += 1) {
    const day = new Date(periodFrom.getTime() + i * DAY_MS);
    byDay.set(day.toISOString(), { net: null, gross: 0, jobs: 0 });
  }
  for (const job of jobs) {
    const key = startOfDay(new Date(job.completedAt)).toISOString();
    const bucket = byDay.get(key);
    if (!bucket) continue;
    bucket.jobs += 1;
    bucket.gross += job.grossMinorUnits;
    if (job.netMinorUnits !== null) bucket.net = (bucket.net ?? 0) + job.netMinorUnits;
  }

  const anyNet = jobs.some((j) => j.netMinorUnits !== null);

  return {
    currency: "ILS",
    periodFromISO: periodFrom.toISOString(),
    periodToISO: now.toISOString(),
    periodGrossMinorUnits: jobs.reduce((sum, j) => sum + j.grossMinorUnits, 0),
    periodNetMinorUnits: anyNet
      ? jobs.reduce((sum, j) => sum + (j.netMinorUnits ?? 0), 0)
      : null,
    periodJobCount: jobs.length + extra.unpricedJobCount,
    days: [...byDay.entries()].map(([dateISO, v]) => ({
      dateISO,
      netMinorUnits: v.net,
      grossMinorUnits: v.gross,
      jobs: v.jobs,
    })),
    jobs,
    awaitingCommissionDecision: !extra.paidDirectly && jobs.some((j) => j.netMinorUnits === null),
    ...extra,
  };
}

/**
 * EARNINGS WHEN NO MONEY MOVES THROUGH THE APP (docs/21 §5 D1).
 *
 * There are no captured payments, so the ledger is empty and the screen
 * would say "nothing yet" to somebody who worked all week. What the server
 * does have is the receipt each job closed with (`SETTLED_OUTSIDE_APP`,
 * written by `closeWithoutPayment`): the server's own number for what the
 * work came to. That is the gross; there is no net, because nothing was
 * taken and nothing passed through us.
 */
export async function outsideAppEarningsFor(
  prisma: PrismaClient,
  professionalId: string,
  now: Date = new Date(),
  days = 7
): Promise<EarningsSummary> {
  const periodFrom = new Date(startOfDay(now).getTime() - (days - 1) * DAY_MS);
  const events = await prisma.jobEvent.findMany({
    where: {
      type: "SETTLED_OUTSIDE_APP",
      createdAt: { gte: periodFrom },
      job: { assignedProfessionalId: professionalId },
    },
    include: { job: { include: { service: true } } },
    orderBy: { createdAt: "desc" },
  });

  let unpriced = 0;
  const jobs: EarningJobLine[] = [];
  for (const e of events) {
    const amount = (e.metadata as { amountMinorUnits?: unknown } | null)?.amountMinorUnits;
    if (typeof amount !== "number") {
      unpriced += 1;
      continue;
    }
    jobs.push({
      jobId: e.jobId,
      serviceCode: e.job.service.code,
      serviceNameHe: e.job.service.nameHe,
      completedAt: e.createdAt.toISOString(),
      grossMinorUnits: amount,
      deductions: [],
      netMinorUnits: null,
    });
  }
  return summarise(jobs, periodFrom, now, days, { paidDirectly: true, unpricedJobCount: unpriced });
}
