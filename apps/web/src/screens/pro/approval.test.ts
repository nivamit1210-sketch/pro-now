import { describe, expect, it } from "vitest";
import type { ProApplicationView } from "@pro-now/types";

import { APPROVAL_STEPS_HE, IDENTITY_STEP_HE, applicationPage, approvalProgress, fixLabelHe, fixLinkFor, formatDateOfBirthHe, parseDateOfBirthHe, parseStaffDateHe, resendErrorHe, saveInOrder } from "./approval";

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
  fixRequests?: ProApplicationView["fixRequests"];
  changesRequested?: boolean;
}): ProApplicationView {
  const requirements: Req[] = (opts.credentials ?? []).map((status, i) => ({
    requirement: `LICENSE:${i}`,
    mandatory: true,
    credential: status ? { id: `c${i}`, status, number: null, expiresAt: null, noExpiry: false } : null,
    renewalPending: false,
  }));
  return {
    profile: { id: "p", displayName: "דנה", legalName: "דנה לוי", addressAs: "F", dateOfBirth: opts.dateOfBirth === undefined ? "1990-05-14" : opts.dateOfBirth, vehicle: { vehicleHe: null, plateTail: null }, verificationStatus: opts.account ?? "SERVICE_REVIEW", business: null, shop: null, portrait: null },
    services: (opts.services ?? ["PENDING"]).map((status, i) => ({
      id: `ps${i}`, serviceId: `s${i}`, code: `S${i}`, nameHe: `שירות ${i}`, priceModel: "VISIT_QUOTE", status, priced: true,
      requirements: i === 0 ? requirements : [],
    })),
    area: null,
    identity: opts.identity === undefined ? { id: "iv", status: "MANUAL_REVIEW", submittedAt: "2026-10-02T10:00:00Z", reasonHe: null } : opts.identity,
    documents: (opts.documents ?? ["PENDING", "PENDING", "PENDING"]).map((status, i) => ({ kind: `K${i}`, status })),
    missing: opts.missing ?? [],
    submitted: opts.submitted ?? true,
    fixRequests: opts.fixRequests ?? [],
    changesRequested: opts.changesRequested ?? false,
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

describe("applicationPage: which page the professional lands on", () => {
  it("nobody joined yet, or a draft never sent: the joining steps", () => {
    expect(applicationPage(null)).toBe("join");
    expect(applicationPage(view({ submitted: false, account: "DRAFT" }))).toBe("join");
  });

  it("sent back for fixes (not submitted, changes requested): their page with the fixes, not the joining steps", () => {
    expect(applicationPage(view({ submitted: false, account: "CHANGES_REQUESTED", changesRequested: true }))).toBe("status");
  });

  it("in review: the status page", () => {
    expect(applicationPage(view({}))).toBe("status");
  });

  it("an approved account with an approved service: the work screen", () => {
    expect(applicationPage(view({ account: "APPROVED", services: ["APPROVED"] }))).toBe("working");
  });

  it("an approved account whose services still wait: still the status page", () => {
    expect(applicationPage(view({ account: "APPROVED", services: ["PENDING"] }))).toBe("status");
  });
});

describe("fixLabelHe: each requested fix, named in the professional's words", () => {
  const v = view({});
  it("names the account's own items", () => {
    expect(fixLabelHe("IDENTITY", v)).toBe("בדיקת הזהות");
    expect(fixLabelHe("DETAILS", v)).toBe("הפרטים");
    expect(fixLabelHe("AREA", v)).toBe("אזור העבודה");
    expect(fixLabelHe("PORTRAIT", v)).toBe("התמונה");
    expect(fixLabelHe("SHOP", v)).toBe("החנות");
    expect(fixLabelHe("DOCUMENT:TAX_FILE", v)).toBe("תיק עוסק");
  });

  it("a service names the service and its price", () => {
    expect(fixLabelHe("SERVICE:s0", v)).toBe("שירות 0 והמחיר");
  });

  it("a credential names the document and the service it is for", () => {
    expect(fixLabelHe("CREDENTIAL:s0:LICENSE:ELECTRICIAN", v)).toBe("רישיון חשמלאי · שירות 0");
    expect(fixLabelHe("CREDENTIAL:s0:LICENSE:UNKNOWN", v)).toBe("מסמך · שירות 0");
  });

  it("an unknown key, or a service no longer in the application, is still shown", () => {
    expect(fixLabelHe("SOMETHING", v)).toBe("פריט בבקשה");
    expect(fixLabelHe("SERVICE:gone", v)).toBe("פריט בבקשה");
    expect(fixLabelHe("CREDENTIAL:gone:LICENSE:ELECTRICIAN", v)).toBe("פריט בבקשה");
    expect(fixLabelHe("DOCUMENT:OTHER", v)).toBe("פריט בבקשה");
  });
});

describe("fixLinkFor: the step where each fix is made", () => {
  it("identity, documents and credentials: the documents step", () => {
    expect(fixLinkFor("IDENTITY")).toBe("/pro/join?at=documents");
    expect(fixLinkFor("DOCUMENT:TAX_FILE")).toBe("/pro/join?at=documents");
    expect(fixLinkFor("CREDENTIAL:s0:LICENSE:ELECTRICIAN")).toBe("/pro/join?at=documents");
  });

  it("the other items: their own step", () => {
    expect(fixLinkFor("DETAILS")).toBe("/pro/join?at=details");
    expect(fixLinkFor("AREA")).toBe("/pro/join?at=area");
    expect(fixLinkFor("PORTRAIT")).toBe("/pro/join?at=portrait");
    expect(fixLinkFor("SHOP")).toBe("/pro/join?at=shop");
    expect(fixLinkFor("SERVICE:s0")).toBe("/pro/join?at=prices");
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

describe("resendErrorHe (docs/10 §Review loop)", () => {
  it("says the resend's refusals in the professional's words, and nothing for other codes", () => {
    expect(resendErrorHe("FIXES_OPEN")).toBe("עדיין יש דברים לתקן");
    expect(resendErrorHe("APPLICATION_INCOMPLETE")).toBe("חסרים עוד פרטים בבקשה");
    expect(resendErrorHe("SOMETHING_ELSE")).toBeNull();
    expect(resendErrorHe(undefined)).toBeNull();
  });
});

describe("saveInOrder", () => {
  it("runs every save and reports success when all succeed", async () => {
    const ran: number[] = [];
    expect(await saveInOrder([1, 2, 3].map((n) => async () => { ran.push(n); return true; }))).toBe(true);
    expect(ran).toEqual([1, 2, 3]);
  });

  it("stops at the first failed save and reports failure, so the step does not move on", async () => {
    const ran: number[] = [];
    const ok = await saveInOrder([
      async () => { ran.push(1); return true; },
      async () => { ran.push(2); return false; },
      async () => { ran.push(3); return true; },
    ]);
    expect(ok).toBe(false);
    expect(ran).toEqual([1, 2]);
  });
});

describe("the date staff type", () => {
  it("takes DD/MM/YYYY and YYYY-MM-DD, nothing else", () => {
    expect(parseStaffDateHe("14/05/1990")).toBe("1990-05-14");
    expect(parseStaffDateHe("1990-05-14")).toBe("1990-05-14");
    expect(parseStaffDateHe(" 1990-05-14 ")).toBe("1990-05-14");
    expect(parseStaffDateHe("1990-02-31")).toBeNull();
    expect(parseStaffDateHe("31/02/1990")).toBeNull();
    expect(parseStaffDateHe("14 May 1990")).toBeNull();
    expect(parseStaffDateHe("")).toBeNull();
  });
});
