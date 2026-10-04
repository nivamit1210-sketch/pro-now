import type { PrismaClient } from "@prisma/client";
import { credentialTypeFor, documentInfoFor, type NotificationProvider } from "@pro-now/types";
import type { UserEventBus } from "../../realtime/user-event-bus.js";
import { CREDENTIAL_TYPE_HE, NOTICE_TEXT_HE, daysUntil, dueNotice, isCoveredByRenewal, type NoticeKind } from "./expiry.js";

/**
 * THE EXPIRY CHECK, run hourly (docs/10 §Life after approval).
 * Every VERIFIED credential with a date becomes EXPIRED from the day
 * itself, whatever else holds. The notice due (30 days, 7 days, on expiry)
 * is stored and pushed once, and only when the professional service is
 * APPROVED or PENDING, the account is APPROVED or LIMITED, and no verified
 * renewal covers the date.
 *
 * "Once" holds across overlapping runs: the notice row is unique per
 * (credential, kind) and is written in the same transaction as the
 * professional's notification, so the run that loses the race gets a
 * unique violation, rolls back, and pushes nothing.
 */
export const DOCUMENTS_URL = "/pro/documents";
const TITLE_HE = "תוקף מסמך";

export interface ExpiryDeps {
  prisma: PrismaClient;
  push: NotificationProvider;
  users: UserEventBus;
  log: { warn(o: object, m: string): void };
}

const GOOD_STANDING: ReadonlySet<string> = new Set(["APPROVED", "LIMITED"]);
const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "P2002";

export async function runExpiryCheck(deps: ExpiryDeps, now: Date = new Date()): Promise<{ notices: number; expired: number }> {
  const { prisma, push, users, log } = deps;
  const candidates = await prisma.professionalCredential.findMany({
    where: { status: "VERIFIED", expiresAt: { not: null } },
    include: {
      service: { select: { nameHe: true, requirements: { select: { requirement: true } } } },
      professional: { select: { userId: true, verificationStatus: true } },
    },
  });
  if (candidates.length === 0) return { notices: 0, expired: 0 };

  const professionalIds = [...new Set(candidates.map((c) => c.professionalId))];
  // Notices go only where the service is offered (APPROVED, or PENDING its review: docs/10),
  // and only to accounts in good standing (APPROVED or LIMITED: none to suspended, refused or erased ones).
  const offered = await prisma.professionalService.findMany({
    where: { professionalId: { in: professionalIds }, status: { in: ["APPROVED", "PENDING"] } },
    select: { professionalId: true, serviceId: true },
  });
  const live = new Set(offered.map((s) => `${s.professionalId}:${s.serviceId}`));

  // Every credential of the same professionals, for renewal coverage.
  const all = await prisma.professionalCredential.findMany({
    where: { professionalId: { in: professionalIds } },
    select: { id: true, professionalId: true, serviceId: true, type: true, status: true, expiresAt: true, noExpiry: true },
  });
  const sentRows = await prisma.credentialNotice.findMany({ where: { credentialId: { in: candidates.map((c) => c.id) } }, select: { credentialId: true, kind: true } });
  const sentBy = new Map<string, Set<NoticeKind>>();
  for (const r of sentRows) {
    const s = sentBy.get(r.credentialId) ?? new Set<NoticeKind>();
    s.add(r.kind as NoticeKind);
    sentBy.set(r.credentialId, s);
  }

  let notices = 0;
  let expired = 0;
  for (const c of candidates) {
    const expiresAt = c.expiresAt!;
    const days = daysUntil(expiresAt, now);
    const others = all.filter((o) => o.id !== c.id && o.professionalId === c.professionalId && o.serviceId === c.serviceId && o.type === c.type);
    // Coverage and the service's status gate the notice only, never the EXPIRED status below.
    const notify = GOOD_STANDING.has(c.professional.verificationStatus) && live.has(`${c.professionalId}:${c.serviceId}`) && !isCoveredByRenewal({ expiresAt }, others);

    const kind = notify ? dueNotice(days, sentBy.get(c.id) ?? new Set()) : null;
    let noticeFailed = false;
    if (kind) {
      try {
        const requirement = c.service.requirements.find((r) => credentialTypeFor(r.requirement) === c.type)?.requirement;
        const credentialHe = (requirement && documentInfoFor(requirement)?.nameHe) || CREDENTIAL_TYPE_HE[c.type] || "מסמך";
        const body = NOTICE_TEXT_HE[kind](credentialHe, c.service.nameHe, days);
        const userId = c.professional.userId;
        let stored = true;
        try {
          await prisma.$transaction(async (tx) => {
            await tx.credentialNotice.create({ data: { credentialId: c.id, kind } });
            await tx.notification.create({ data: { userId, type: "CREDENTIAL_EXPIRY", title: TITLE_HE, body, data: { url: DOCUMENTS_URL } } });
          });
        } catch (e) {
          // A unique violation aborts the transaction; caught out here it means another run stored it first.
          if (!isUniqueViolation(e)) throw e;
          stored = false;
        }
        if (stored) {
          notices++;
          users.publish(userId, { type: "NOTIFICATION", title: TITLE_HE, body, url: DOCUMENTS_URL });
          void push
            .sendPush({ userId, title: TITLE_HE, body, data: { url: DOCUMENTS_URL } })
            .catch((err: unknown) => log.warn({ err: (err as Error)?.message, credentialId: c.id }, "credential expiry push failed"));
        }
      } catch (err) {
        noticeFailed = true;
        log.warn({ err: (err as Error)?.message, credentialId: c.id, kind }, "credential expiry notice failed");
      }
    }

    /*
     * After the notice, and only when it did not fail: a credential marked
     * EXPIRED leaves the check, so a failed EXPIRED notice keeps it VERIFIED
     * for the next run's retry. Dispatch does not wait for this status: it
     * reads expiresAt itself (dispatch/credential-eligibility.ts).
     */
    if (days <= 0 && !noticeFailed) {
      try {
        const r = await prisma.professionalCredential.updateMany({ where: { id: c.id, status: "VERIFIED" }, data: { status: "EXPIRED" } });
        expired += r.count;
      } catch (err) {
        log.warn({ err: (err as Error)?.message, credentialId: c.id }, "credential expiry status failed");
      }
    }
  }
  return { notices, expired };
}
