import type { PrismaClient } from "@prisma/client";

/**
 * Sends waiting email with retries (docs/21 W9). Backoff doubles from a
 * minute; after six attempts the row is FAILED and stays for the record.
 */
const MAX_ATTEMPTS = 6;

export async function drainEmailOutbox(
  db: PrismaClient,
  email: { send(e: { to: string; subject: string; text: string; html: string }): Promise<void> },
  now = new Date()
): Promise<{ sent: number; failed: number }> {
  const due = await db.emailOutbox.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  let sent = 0;
  let failed = 0;
  for (const m of due) {
    try {
      await email.send({ to: m.toEmail, subject: m.subject, text: m.text, html: m.html });
      await db.emailOutbox.update({ where: { id: m.id }, data: { status: "SENT", sentAt: new Date(), attempts: m.attempts + 1 } });
      sent += 1;
    } catch (err) {
      const attempts = m.attempts + 1;
      await db.emailOutbox.update({
        where: { id: m.id },
        data: {
          attempts,
          status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
          nextAttemptAt: new Date(now.getTime() + 60_000 * 2 ** (attempts - 1)),
          lastError: (err as Error).message.slice(0, 500),
        },
      });
      failed += 1;
    }
  }
  return { sent, failed };
}
