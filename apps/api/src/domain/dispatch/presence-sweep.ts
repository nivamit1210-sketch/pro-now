import type { PrismaClient } from "@prisma/client";

/**
 * THE HEARTBEAT (docs/21 W7). A web page on iOS cannot track location or
 * wake up in the background, so a professional online in the browser must
 * keep the app open, and the server — which owns presence — takes them
 * offline when their pings stop. Otherwise a professional who closed the
 * tab would stay "available" and hold every nearby job for the offer's
 * whole timeout.
 *
 * Only AVAILABLE professionals are swept. Someone on a job keeps their
 * state: the job's own steps move them, and a silent phone mid-visit is
 * not a reason to strand a customer.
 */
export async function sweepSilentProfessionals(
  prisma: PrismaClient,
  silenceSeconds: number,
  now = new Date()
): Promise<string[]> {
  const cutoff = new Date(now.getTime() - silenceSeconds * 1000);
  const available = await prisma.professionalProfile.findMany({
    where: { presenceState: "AVAILABLE" },
    select: { id: true, locations: { orderBy: { receivedAt: "desc" }, take: 1, select: { receivedAt: true } } },
  });
  const silent = available.filter((p) => !p.locations[0] || p.locations[0].receivedAt < cutoff).map((p) => p.id);
  if (silent.length === 0) return [];

  await prisma.professionalProfile.updateMany({
    where: { id: { in: silent }, presenceState: "AVAILABLE" },
    data: { presenceState: "OFFLINE" },
  });
  await prisma.availabilitySession.updateMany({
    where: { professionalId: { in: silent }, status: "ACTIVE" },
    data: { status: "ENDED", endedAt: now },
  });
  return silent;
}
