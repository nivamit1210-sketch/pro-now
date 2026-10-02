import { describe, expect, it } from "vitest";
import type { ProApplicationView } from "@pro-now/types";

import { APPROVAL_STEPS_HE, IDENTITY_STEP_HE, approvalProgress, formatDateOfBirthHe, parseDateOfBirthHe } from "./approval";

type Req = ProApplicationView["services"][number]["requirements"][number];
function view(opts: {
  submitted?: boolean;
  account?: string;
  documents?: string[];
  credentials?: Array<string | null>;
  services?: string[];
  identity?: ProApplicationView["identity"];
  missing?: string[];
  dateOfBirth?: string | null;
}): ProApplicationView {
  const requirements: Req[] = (opts.credentials ?? []).map((status, i) => ({
    requirement: `LICENSE:${i}`,
    mandatory: true,
    credential: status ? { id: `c${i}`, status, number: null } : null,
  }));
  return {
    profile: { id: "p", displayName: "דנה", legalName: "דנה לוי", addressAs: "F", dateOfBirth: opts.dateOfBirth === undefined ? "1990-05-14" : opts.dateOfBirth, verificationStatus: opts.account ?? "SERVICE_REVIEW", business: null, shop: null, portrait: null },
    services: (opts.services ?? ["PENDING"]).map((status, i) => ({
      id: `ps${i}`, serviceId: `s${i}`, code: `S${i}`, nameHe: `שירות ${i}`, priceModel: "VISIT_QUOTE", status, priced: true,
      requirements: i === 0 ? requirements : [],
    })),
    area: null,
    identity: opts.identity === undefined ? { id: "iv", status: "MANUAL_REVIEW", submittedAt: "2026-10-02T10:00:00Z", reasonHe: null } : opts.identity,
    documents: (opts.documents ?? ["PENDING", "PENDING", "PENDING"]).map((status, i) => ({ kind: `K${i}`, status })),
    missing: opts.missing ?? [],
    submitted: opts.submitted ?? true,
  };
}
// The four review steps after the identity row.
const states = (v: ProApplicationView) => approvalProgress(v).slice(1).map((s) => s.state);
const identityRow = (v: ProApplicationView) => approvalProgress(v)[0]!;
const check = (status: string, reasonHe: string | null = null) => ({ id: "iv", status, submittedAt: "2026-10-02T10:00:00Z", reasonHe });

describe("approvalProgress: the true state, nothing ticking by itself", () => {
  it("has the identity row, then one row per step Amit listed", () => {
    expect(approvalProgress(view({})).map((r) => r.labelHe)).toEqual([IDENTITY_STEP_HE, ...APPROVAL_STEPS_HE]);
  });

  it("just sent: received, then in the queue, then waiting", () => {
    expect(states(view({ credentials: ["PENDING"] }))).toEqual(["received", "queued", "waiting", "waiting"]);
  });

  it("a trade with no licence to check says so rather than pretending to check one", () => {
    expect(states(view({ credentials: [] }))[1]).toBe("none");
  });

  it("documents and licences an admin verified are done; the review of the whole account follows the account", () => {
    expect(states(view({ documents: ["VERIFIED", "VERIFIED", "VERIFIED"], credentials: ["VERIFIED"] }))).toEqual(["done", "done", "queued", "waiting"]);
  });

  it("approved, with at least one service approved: everything is done", () => {
    expect(states(view({ account: "APPROVED", documents: ["VERIFIED", "VERIFIED", "VERIFIED"], credentials: ["VERIFIED"], services: ["APPROVED", "PENDING"] }))).toEqual(["done", "done", "done", "done"]);
  });

  it("an approved account whose services still wait is not yet receiving work", () => {
    expect(states(view({ account: "APPROVED", documents: ["VERIFIED", "VERIFIED", "VERIFIED"], credentials: ["VERIFIED"], services: ["PENDING"] }))[3]).toBe("queued");
  });

  it("a rejected document or licence is shown as needing attention, not as waiting", () => {
    expect(states(view({ documents: ["REJECTED", "VERIFIED", "VERIFIED"] }))[0]).toBe("attention");
    expect(states(view({ credentials: ["REJECTED"] }))[1]).toBe("attention");
  });
});

describe("approvalProgress: the identity row says what the applicant must do", () => {
  it("no check yet (an applicant from before the check): asked for, with the way to the documents step", () => {
    const row = identityRow(view({ identity: null, missing: ["IDENTITY"] }));
    expect(row.state).toBe("attention");
    expect(row.action).toEqual({ labelHe: expect.any(String), to: "/pro/join?at=documents" });
  });

  it("sent, a person is looking: in the queue, nothing to do", () => {
    const row = identityRow(view({ identity: check("MANUAL_REVIEW") }));
    expect(row.state).toBe("queued");
    expect(row.action).toBeUndefined();
  });

  it("a retake asked for: attention, the reviewer's own words, and the way back to the photos", () => {
    const row = identityRow(view({ identity: check("RETAKE_REQUESTED", "התעודה מטושטשת"), missing: ["IDENTITY"] }));
    expect(row.state).toBe("attention");
    expect(row.noteHe).toBe("התעודה מטושטשת");
    expect(row.action?.to).toBe("/pro/join?at=documents");
  });

  it("verified: done", () => {
    expect(identityRow(view({ identity: check("VERIFIED") })).state).toBe("done");
  });

  it("refused: final, said with the reason, and nothing offered to redo", () => {
    const row = identityRow(view({ identity: check("REJECTED", "התעודה לא בתוקף") }));
    expect(row.state).toBe("refused");
    expect(row.noteHe).toBe("התעודה לא בתוקף");
    expect(row.action).toBeUndefined();
  });

  it("no date of birth (an applicant from before the 18 rule): attention, the way to the details step first", () => {
    const row = identityRow(view({ identity: null, dateOfBirth: null, missing: ["DATE_OF_BIRTH", "IDENTITY"] }));
    expect(row.state).toBe("attention");
    expect(row.action?.to).toBe("/pro/join?at=details");
  });

  it("an account approved before the check existed is not asked for one", () => {
    const row = identityRow(view({ account: "APPROVED", identity: null, missing: ["IDENTITY"] }));
    expect(row.state).toBe("none");
    expect(row.action).toBeUndefined();
  });
});

describe("date of birth, as typed in Israel (DD/MM/YYYY)", () => {
  it("reads a real date into the server's YYYY-MM-DD", () => {
    expect(parseDateOfBirthHe("14/05/1990")).toBe("1990-05-14");
    expect(parseDateOfBirthHe("1/5/1990")).toBe("1990-05-01");
  });
  it("refuses a day the calendar does not have, and anything that is not a date", () => {
    expect(parseDateOfBirthHe("31/02/1990")).toBeNull();
    expect(parseDateOfBirthHe("abc")).toBeNull();
  });
  it("shows the server's date back the way it is typed", () => {
    expect(formatDateOfBirthHe("1990-05-14")).toBe("14/05/1990");
    expect(formatDateOfBirthHe(null)).toBe("");
  });
});
