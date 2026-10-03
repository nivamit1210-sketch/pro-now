import type { Prisma } from "@prisma/client";
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
