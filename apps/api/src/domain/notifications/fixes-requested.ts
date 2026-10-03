import type { PrismaClient, Prisma } from "@prisma/client";

/** One notice per round (docs/10 §Review loop: one batch, one notice). */
export const FIXES_TITLE_HE = "יש כמה דברים לתקן בבקשה";
export function fixesBodyHe(count: number): string {
  return count === 1 ? "דבר אחד לתקן — הסיבה מחכה בעמוד הבקשה" : `${count} דברים לתקן — הסיבות מחכות בעמוד הבקשה`;
}
export async function storeFixesNotice(tx: Prisma.TransactionClient | PrismaClient, userId: string, count: number) {
  return tx.notification.create({ data: { userId, type: "PRO_FIXES_REQUESTED", title: FIXES_TITLE_HE, body: fixesBodyHe(count), data: { url: "/pro" } } });
}
