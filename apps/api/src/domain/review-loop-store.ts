import type { Prisma, PrismaClient } from "@prisma/client";
import { currentCheck } from "./identity-check.js";
import { credentialTypeFor } from "@pro-now/types";
import type { ApplicationItems } from "./review-loop.js";

/**
 * THE REVIEW LOOP'S WRITES (docs/10 §Review loop). Every function runs
 * inside the caller's transaction, after `lockProfessional`, so a mark, a
 * send, a fix and a resend never interleave for one professional.
 */
type Tx = Prisma.TransactionClient;

export async function lockProfessional(tx: Tx, professionalId: string): Promise<void> {
  await tx.$queryRawUnsafe(`SELECT id FROM professional_profiles WHERE id = $1 FOR UPDATE`, professionalId);
}

export async function applicationItems(tx: Tx, professionalId: string): Promise<ApplicationItems> {
  const pro = await tx.professionalProfile.findUniqueOrThrow({
    where: { id: professionalId },
    include: { identityChecks: true, documents: true, services: { include: { service: { include: { requirements: true } } } } },
  });
  const area = await tx.serviceArea.findFirst({ where: { professionalId } });
  return {
    hasIdentity: currentCheck(pro.identityChecks) !== null,
    hasArea: area !== null,
    hasPortrait: pro.portraitKind !== null,
    hasShop: pro.shopName !== null,
    documentKinds: [...new Set(pro.documents.map((d) => d.kind))],
    services: pro.services.map((ps) => ({
      serviceId: ps.serviceId,
      requirements: ps.service.requirements.filter((r) => credentialTypeFor(r.requirement) !== null).map((r) => r.requirement),
    })),
  };
}

export async function draftRound(tx: Tx, professionalId: string, createdById: string): Promise<{ id: string }> {
  const existing = await tx.reviewRound.findFirst({ where: { professionalId, status: "DRAFT" } });
  return existing ?? tx.reviewRound.create({ data: { professionalId, createdById } });
}

export async function markItem(tx: Tx, p: { professionalId: string; itemKey: string; reasonHe: string; actorId: string }): Promise<{ id: string }> {
  const round = await draftRound(tx, p.professionalId, p.actorId);
  return tx.fixRequest.upsert({
    where: { roundId_itemKey: { roundId: round.id, itemKey: p.itemKey } },
    update: { reasonHe: p.reasonHe, status: "OPEN" },
    create: { roundId: round.id, professionalId: p.professionalId, itemKey: p.itemKey, reasonHe: p.reasonHe },
  });
}

export async function cancelMark(tx: Tx, requestId: string): Promise<"CANCELLED" | "NOT_DRAFT" | "NOT_FOUND"> {
  const req = await tx.fixRequest.findUnique({ where: { id: requestId }, include: { round: true } });
  if (!req) return "NOT_FOUND";
  if (req.round.status !== "DRAFT") return "NOT_DRAFT";
  await tx.fixRequest.update({ where: { id: requestId }, data: { status: "CANCELLED" } });
  return "CANCELLED";
}

export async function cancelMarksFor(tx: Tx, professionalId: string, predicate: (itemKey: string) => boolean): Promise<number> {
  const open = await tx.fixRequest.findMany({ where: { professionalId, status: "OPEN", round: { status: { in: ["DRAFT", "SENT"] } } } });
  const ids = open.filter((r) => predicate(r.itemKey)).map((r) => r.id);
  if (ids.length === 0) return 0;
  await tx.fixRequest.updateMany({ where: { id: { in: ids } }, data: { status: "CANCELLED" } });
  return ids.length;
}

export async function closeForRefusal(tx: Tx, professionalId: string): Promise<void> {
  await tx.fixRequest.updateMany({ where: { professionalId, status: "OPEN" }, data: { status: "CANCELLED" } });
  await tx.reviewRound.updateMany({ where: { professionalId, status: "SENT" }, data: { status: "ANSWERED", answeredAt: new Date() } });
}

export async function hasPendingReview(tx: Tx, professionalId: string): Promise<boolean> {
  const n = await tx.fixRequest.count({ where: { professionalId, status: "OPEN", round: { status: { in: ["DRAFT", "SENT"] } } } });
  return n > 0;
}

export async function sendRound(tx: Tx, p: { professionalId: string; actorId: string }) {
  const pro = await tx.professionalProfile.findUniqueOrThrow({ where: { id: p.professionalId } });
  if (pro.verificationStatus !== "SERVICE_REVIEW") return { code: "NOT_IN_REVIEW" as const };
  const round = await tx.reviewRound.findFirst({ where: { professionalId: p.professionalId, status: "DRAFT" }, include: { requests: { where: { status: "OPEN" } } } });
  if (!round || round.requests.length === 0) return { code: "NOTHING_MARKED" as const };
  const now = new Date();
  await tx.reviewRound.update({ where: { id: round.id }, data: { status: "SENT", sentAt: now } });
  await tx.professionalProfile.update({ where: { id: p.professionalId }, data: { verificationStatus: "CHANGES_REQUESTED" } });
  let identityUploadIds: string[] = [];
  const identityReq = round.requests.find((r) => r.itemKey === "IDENTITY");
  if (identityReq) {
    const check = currentCheck(await tx.identityVerification.findMany({ where: { professionalId: p.professionalId } }));
    if (check && ["MANUAL_REVIEW", "PENDING"].includes(check.status)) {
      identityUploadIds = check.uploadIds;
      await tx.identityVerification.update({
        where: { id: check.id },
        data: { status: "RETAKE_REQUESTED", decidedById: p.actorId, decidedAt: now, decisionReason: identityReq.reasonHe, uploadIds: [], photosDeletedAt: now },
      });
    }
  }
  return { code: "SENT" as const, roundId: round.id, count: round.requests.length, identityUploadIds, userId: pro.userId };
}

/**
 * A save by the professional (docs/10 §Review loop). Only a real change
 * counts: `changed` false does nothing. A change is audited, and fixes the
 * item's open request only if that request was sent — a change made while
 * the mark is still a reviewer's draft fixes nothing (Review Focus 1).
 */
export async function recordChange(
  db: PrismaClient,
  p: { professionalId: string; itemKey: string; actorId: string; requestId: string; changed: boolean },
): Promise<void> {
  if (!p.changed) return;
  await db.$transaction(async (tx) => {
    await lockProfessional(tx, p.professionalId);
    await tx.auditLog.create({
      data: { actorId: p.actorId, action: "PRO_APPLICATION_ITEM_CHANGED", targetType: "professional", targetId: p.professionalId, afterJson: { itemKey: p.itemKey }, requestId: p.requestId },
    });
    await tx.fixRequest.updateMany({
      where: { professionalId: p.professionalId, itemKey: p.itemKey, status: "OPEN", round: { status: "SENT" } },
      data: { status: "FIXED", fixedAt: new Date() },
    });
  });
}

/** The requests the professional was sent and has not yet answered: the latest SENT round's, cancelled ones left out. */
export async function currentRoundRequests(
  db: PrismaClient | Tx,
  professionalId: string,
): Promise<Array<{ itemKey: string; reasonHe: string; status: "OPEN" | "FIXED" }>> {
  const round = await db.reviewRound.findFirst({
    where: { professionalId, status: "SENT" },
    orderBy: { sentAt: "desc" },
    include: { requests: { where: { status: { in: ["OPEN", "FIXED"] } }, orderBy: { createdAt: "asc" } } },
  });
  return (round?.requests ?? []).map((r) => ({ itemKey: r.itemKey, reasonHe: r.reasonHe, status: r.status as "OPEN" | "FIXED" }));
}

/** The resend: refused while a sent request is open; otherwise the round is answered. Inside the caller's locked transaction. */
export async function answerRound(
  tx: Tx,
  professionalId: string,
): Promise<{ code: "ANSWERED" | "NONE" } | { code: "FIXES_OPEN"; open: string[] }> {
  const round = await tx.reviewRound.findFirst({ where: { professionalId, status: "SENT" }, include: { requests: { where: { status: "OPEN" } } } });
  if (!round) return { code: "NONE" };
  if (round.requests.length > 0) return { code: "FIXES_OPEN", open: round.requests.map((r) => r.itemKey) };
  await tx.reviewRound.update({ where: { id: round.id }, data: { status: "ANSWERED", answeredAt: new Date() } });
  return { code: "ANSWERED" };
}
