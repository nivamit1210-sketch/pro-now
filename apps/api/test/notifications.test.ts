import { describe, expect, it, vi } from "vitest";
import { deliveriesFor, type PolicyContext } from "../src/domain/notifications/policy.js";
import { createWebPushProvider } from "../src/infra/notifications/web-push.js";
import { drainEmailOutbox } from "../src/domain/notifications/email-outbox.js";

const ctx: PolicyContext = {
  jobId: "j1",
  serviceNameHe: "נזילה",
  customer: { userId: "cust", email: "c@x.test" },
  professional: { userId: "pro", displayName: "דנה", addressAs: "F" },
  offeredTo: { userId: "pro" },
};

describe("who hears what (policy)", () => {
  it("an offer goes to the professional it was sent to, live and by push, never by email", () => {
    const [d] = deliveriesFor({ type: "OFFER_SENT" }, ctx);
    expect(d).toMatchObject({ userId: "pro", channels: ["socket", "push"], offer: true, url: "/pro" });
  });

  it("arrival reaches the customer in-app and by push, in the professional's own gender", () => {
    const [d] = deliveriesFor({ type: "PRO_ARRIVED_REQUESTED" }, ctx);
    expect(d).toMatchObject({ userId: "cust", channels: ["inapp", "push"], titleHe: "דנה הגיעה", url: "/jobs/j1" });
    expect(deliveriesFor({ type: "PRO_ARRIVED_REQUESTED" }, { ...ctx, professional: { ...ctx.professional!, addressAs: "M" } })[0]!.titleHe).toBe("דנה הגיע");
  });

  it("email only where it matters after the screen is closed", () => {
    const withEmail = ["SERVICE_COMPLETION_REQUESTED", "JOB_CANCELLED"].map((type) =>
      deliveriesFor({ type, actor: "SYSTEM", metadata: { reason: "NO_PROFESSIONAL_AVAILABLE" } }, ctx)[0]!.channels.includes("email")
    );
    expect(withEmail).toEqual([true, true]);
    for (const type of ["OFFER_ACCEPTED", "PRO_EN_ROUTE_REQUESTED", "QUOTE_SENT"]) {
      expect(deliveriesFor({ type }, ctx)[0]!.channels).not.toContain("email");
    }
  });

  it("a customer's cancellation tells the professional; a job event nobody needs tells nobody", () => {
    expect(deliveriesFor({ type: "JOB_CANCELLED", actor: "CUSTOMER" }, ctx)[0]).toMatchObject({ userId: "pro", titleHe: "הלקוח ביטל את הקריאה" });
    expect(deliveriesFor({ type: "SERVICE_STARTED" }, ctx)).toEqual([]);
    expect(deliveriesFor({ type: "PRO_LOCATION" }, ctx)).toEqual([]);
  });
});

describe("Web Push", () => {
  const keys = { publicKey: "pub", privateKey: "priv", subject: "mailto:ops@pronow.test" };
  const subs = [
    { id: "a", endpoint: "https://push.example/a", p256dh: "p1", auth: "a1" },
    { id: "b", endpoint: "https://push.example/b", p256dh: "p2", auth: "a2" },
  ];
  const db = () => ({
    pushSubscription: {
      findMany: vi.fn().mockResolvedValue(subs),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
  });

  it("sends to every browser the person subscribed, signed with our keys", async () => {
    const d = db();
    const send = vi.fn().mockResolvedValue({ statusCode: 201 });
    const out = await createWebPushProvider(d as never, keys, send as never).sendPush({ userId: "u", title: "t", body: "b", data: { url: "/x" } });
    expect(out.delivered).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]![2]).toMatchObject({ vapidDetails: keys });
    expect(JSON.parse(send.mock.calls[0]![1] as string)).toEqual({ title: "t", body: "b", data: { url: "/x" } });
  });

  it("forgets a subscription the push service says is gone, and keeps one that failed for a moment", async () => {
    const d = db();
    const send = vi.fn().mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 })).mockRejectedValueOnce(Object.assign(new Error("busy"), { statusCode: 503 }));
    const out = await createWebPushProvider(d as never, keys, send as never).sendPush({ userId: "u", title: "t", body: "b" });
    expect(out.delivered).toBe(false);
    expect(d.pushSubscription.delete).toHaveBeenCalledTimes(1);
    expect(d.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: "a" } });
  });
});

describe("the email outbox", () => {
  it("sends, and on failure backs off and finally gives up", async () => {
    const now = new Date("2026-10-01T10:00:00Z");
    const rows = [
      { id: "ok", toEmail: "a@x", subject: "s", text: "t", html: "h", attempts: 0 },
      { id: "bad", toEmail: "b@x", subject: "s", text: "t", html: "h", attempts: 5 },
    ];
    const update = vi.fn().mockResolvedValue({});
    const db = { emailOutbox: { findMany: vi.fn().mockResolvedValue(rows), update } };
    const email = { send: vi.fn().mockImplementation(async (e: { to: string }) => { if (e.to === "b@x") throw new Error("smtp down"); }) };
    expect(await drainEmailOutbox(db as never, email, now)).toEqual({ sent: 1, failed: 1 });
    expect(update.mock.calls[0]![0]).toMatchObject({ where: { id: "ok" }, data: { status: "SENT" } });
    expect(update.mock.calls[1]![0]).toMatchObject({ where: { id: "bad" }, data: { status: "FAILED", attempts: 6, lastError: "smtp down" } });
  });
});
