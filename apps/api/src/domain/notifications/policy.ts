/**
 * WHO HEARS WHAT, AND HOW (docs/21 W9). One table, one place: each job
 * event type names its recipients and their channels.
 *
 * - socket: the person's live channel (the screen updates now).
 * - push:   Web Push, for a phone in a pocket or a closed tab.
 * - inapp:  the inbox, which is where a missed push is still found.
 * - email:  only for what matters after the screen is closed (the work
 *           is done and waits for you; nobody could be found).
 *
 * Push is a wake-up, never the truth (docs/06): every message points at a
 * screen that re-reads the server.
 */
export type Channel = "socket" | "push" | "inapp" | "email";

export interface PolicyContext {
  jobId: string;
  serviceNameHe: string;
  customer: { userId: string; email: string | null };
  professional: { userId: string; displayName: string; addressAs: string | null } | null;
  /** For OFFER_SENT: the professional the offer went to. */
  offeredTo: { userId: string } | null;
}

export interface Delivery {
  userId: string;
  email: string | null;
  channels: Channel[];
  titleHe: string;
  bodyHe: string;
  url: string;
  offer?: boolean;
}

const f = (ctx: PolicyContext, masc: string, fem: string) => (ctx.professional?.addressAs === "F" ? fem : masc);

export function deliveriesFor(event: { type: string; actor?: string; metadata?: unknown }, ctx: PolicyContext): Delivery[] {
  const job = `/jobs/${ctx.jobId}`;
  const pro = ctx.professional?.displayName ?? "המקצוען";
  const toCustomer = (channels: Channel[], titleHe: string, bodyHe: string): Delivery => ({
    userId: ctx.customer.userId,
    email: ctx.customer.email,
    channels,
    titleHe,
    bodyHe,
    url: job,
  });
  const meta = (event.metadata ?? {}) as { reason?: string };

  switch (event.type) {
    case "OFFER_SENT":
      return ctx.offeredTo
        ? [{ userId: ctx.offeredTo.userId, email: null, channels: ["socket", "push"], titleHe: "קריאה חדשה בשבילך", bodyHe: `${ctx.serviceNameHe} · יש לך כמה שניות להחליט`, url: "/pro", offer: true }]
        : [];
    case "OFFER_ACCEPTED":
      return [toCustomer(["inapp", "push"], "נמצא מקצוען", `${pro} ${f(ctx, "יצא", "יצאה")} אליכם בקרוב · ${ctx.serviceNameHe}`)];
    case "PRO_EN_ROUTE_REQUESTED":
      return [toCustomer(["inapp", "push"], `${pro} בדרך אליכם`, ctx.serviceNameHe)];
    case "PRO_ARRIVED_REQUESTED":
      return [toCustomer(["inapp", "push"], `${pro} ${f(ctx, "הגיע", "הגיעה")}`, ctx.serviceNameHe)];
    case "QUOTE_SENT":
      return [toCustomer(["inapp", "push"], "התקבלה הצעת מחיר", `${ctx.serviceNameHe} · לצפייה בפרטים`)];
    case "SERVICE_COMPLETION_REQUESTED":
      return [toCustomer(["inapp", "push", "email"], "העבודה הסתיימה", `${pro} ${f(ctx, "סיים", "סיימה")} · נשאר רק לאשר`)];
    case "JOB_CANCELLED":
      if (event.actor === "SYSTEM" && meta.reason === "NO_PROFESSIONAL_AVAILABLE") {
        return [toCustomer(["inapp", "push", "email"], "לא מצאנו מקצוען פנוי", `${ctx.serviceNameHe} · לא נגבה דבר. אפשר לנסות שוב בעוד כמה דקות.`)];
      }
      if (event.actor === "CUSTOMER" && ctx.professional) {
        return [{ userId: ctx.professional.userId, email: null, channels: ["inapp", "push"], titleHe: "הלקוח ביטל את הקריאה", bodyHe: ctx.serviceNameHe, url: "/pro" }];
      }
      return [];
    default:
      return [];
  }
}
