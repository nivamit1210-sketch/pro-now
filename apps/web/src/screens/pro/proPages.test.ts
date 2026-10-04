import { describe, expect, it } from "vitest";
import type { ProApplicationView, ProEarningsView, ProPublicProfileView, ProServiceEligibilityView } from "@pro-now/types";

import { agoHe, blockedReasonHe, earningsPropsFor, eligibilityFor, expiryNoteHe, pricingRowsFor, proPageFromPath, publicProfilePropsFor, renewableStepIds, renewalPendingStepIds, verificationStepsFor } from "./proPages";

function application(over: Partial<ProApplicationView> = {}): ProApplicationView {
  return {
    profile: { id: "p", displayName: "דנה", legalName: "דנה לוי", addressAs: "F", dateOfBirth: "1990-05-14", vehicle: { vehicleHe: null, plateTail: null }, verificationStatus: "APPROVED", business: null, shop: null, portrait: null },
    services: [
      {
        id: "ps1", serviceId: "s1", code: "HOME_ELECT_FAULT", nameHe: "תקלה חשמלית", priceModel: "VISIT_QUOTE", status: "APPROVED", priced: true,
        requirements: [
          { requirement: "LICENSE:ELECTRICIAN", mandatory: true, credential: { id: "c1", status: "VERIFIED", number: "123", expiresAt: null, noExpiry: false }, renewalPending: false },
          { requirement: "INSURANCE:LIABILITY", mandatory: false, credential: null, renewalPending: false },
        ],
      },
      {
        id: "ps2", serviceId: "s2", code: "HOME_ELECT_INSTALL", nameHe: "התקנת גוף תאורה", priceModel: "VISIT_QUOTE", status: "APPROVED", priced: true,
        requirements: [{ requirement: "LICENSE:ELECTRICIAN", mandatory: true, credential: null, renewalPending: false }],
      },
    ],
    area: null,
    identity: null,
    documents: [],
    missing: [],
    submitted: true,
    fixRequests: [],
    changesRequested: false,
    ...over,
  };
}

function service(over: Partial<ProServiceEligibilityView> = {}): ProServiceEligibilityView {
  return {
    serviceId: "s1", serviceCode: "HOME_ELECT_FAULT", nameHe: "תקלה חשמלית", priceModel: "VISIT_QUOTE",
    basePriceMinorUnits: 15000, minimumBillableMinutes: null, perKmMinorUnits: null, minimumFareMinorUnits: null,
    chargeable: true, eligible: true, accountApproved: true, serviceApproved: true, missing: [], expired: [], unverified: [],
    ...over,
  };
}

describe("the professional's pages are addresses", () => {
  it("reads the page from the path, and anything unknown is the shift", () => {
    expect(proPageFromPath("/pro")).toBe("shift");
    expect(proPageFromPath("/pro/earnings")).toBe("earnings");
    expect(proPageFromPath("/pro/documents/")).toBe("documents");
    expect(proPageFromPath("/pro/profile")).toBe("profile");
    expect(proPageFromPath("/pro/pricing")).toBe("pricing");
    expect(proPageFromPath("/pro/elsewhere")).toBe("shift");
  });
});

describe("המסמכים שלי — the server's states, never assumed", () => {
  const steps = verificationStepsFor(application());

  it("lists the account documents, and one the server has not seen is not started", () => {
    const tax = steps.find((s) => s.id === "doc:TAX_FILE")!;
    expect(tax.state).toBe("NOT_STARTED");
    expect(tax.actionHe).toBe("עוד לא הועלה.");
    expect(verificationStepsFor(application({ documents: [{ kind: "TAX_FILE", status: "PENDING" }] })).find((s) => s.id === "doc:TAX_FILE")?.state).toBe("IN_REVIEW");
    // The ID and the face are the identity check now, not two documents.
    expect(steps.some((s) => s.id === "doc:GOVERNMENT_ID" || s.id === "doc:SELFIE")).toBe(false);
  });

  describe("the identity check is one step, read from the current check", () => {
    // An applicant still in review: the check is theirs to do.
    const inReview = (over: Partial<ProApplicationView> = {}) => {
      const base = application();
      return application({ profile: { ...base.profile, verificationStatus: "SERVICE_REVIEW" }, ...over });
    };
    const identity = (status: string | null, reasonHe: string | null = null) => {
      const view = inReview({ identity: status ? { id: "iv1", status, submittedAt: "2026-10-02T10:00:00Z", reasonHe } : null });
      return verificationStepsFor(view).find((s) => s.id === "identity")!;
    };
    it("is first, and titled זהות", () => {
      expect(verificationStepsFor(inReview())[0]).toMatchObject({ id: "identity", titleHe: "זהות" });
    });
    it("an account approved before the check existed is not asked for one (no reviewer queue for it yet)", () => {
      expect(steps.some((s) => s.id === "identity")).toBe(false);
    });
    it("an approved account with a check on file still shows it", () => {
      const view = application({ identity: { id: "iv1", status: "VERIFIED", submittedAt: "2026-10-02T10:00:00Z", reasonHe: null } });
      expect(verificationStepsFor(view).find((s) => s.id === "identity")?.state).toBe("VERIFIED");
    });
    it("none yet: to do", () => {
      expect(identity(null).state).toBe("NOT_STARTED");
    });
    it("sent, a person is looking: in review", () => {
      expect(identity("MANUAL_REVIEW").state).toBe("IN_REVIEW");
    });
    it("approved: done", () => {
      expect(identity("VERIFIED").state).toBe("VERIFIED");
    });
    it("a retake asked for: to do, with the reviewer's reason", () => {
      const s = identity("RETAKE_REQUESTED", "התעודה מטושטשת");
      expect(s.state).toBe("NOT_STARTED");
      expect(s.actionHe).toContain("התעודה מטושטשת");
    });
    it("refused: to do, with the reason", () => {
      const s = identity("REJECTED", "התעודה לא בתוקף");
      expect(s.state).toBe("NOT_STARTED");
      expect(s.actionHe).toContain("התעודה לא בתוקף");
    });
  });

  it("names each requirement once, by its document name, with the services it holds back", () => {
    const licence = steps.filter((s) => s.id === "req:LICENSE:ELECTRICIAN");
    expect(licence).toHaveLength(1);
    expect(licence[0]!.titleHe).toBe("רישיון חשמלאי");
    expect(licence[0]!.state).toBe("VERIFIED");
    expect(licence[0]!.gatesServicesHe).toEqual(["תקלה חשמלית", "התקנת גוף תאורה"]);
    // Recommended, not the law: it holds nothing back.
    expect(steps.find((s) => s.id === "req:INSURANCE:LIABILITY")?.gatesServicesHe).toEqual([]);
  });
});

describe("a document's expiry, in the Israel calendar", () => {
  const now = new Date("2026-10-03T09:00:00Z");
  const inDays = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString();

  it("one without expiry says so", () => {
    expect(expiryNoteHe(null, true, now)).toEqual({ validUntilHe: "ללא תוקף", soon: false, expired: false });
  });
  it("no date on file: nothing to say", () => {
    expect(expiryNoteHe(null, false, now)).toEqual({ validUntilHe: null, soon: false, expired: false });
  });
  it("10 days ahead is soon", () => {
    expect(expiryNoteHe(inDays(10), false, now)).toEqual({ validUntilHe: "בתוקף עד 13/10/2026", soon: true, expired: false });
  });
  it("40 days ahead is not soon", () => {
    expect(expiryNoteHe(inDays(40), false, now)).toEqual({ validUntilHe: "בתוקף עד 12/11/2026", soon: false, expired: false });
  });
  it("yesterday is expired", () => {
    expect(expiryNoteHe(inDays(-1), false, now)).toMatchObject({ soon: false, expired: true });
  });
  it("just after midnight in Israel is the Israel day", () => {
    expect(expiryNoteHe("2026-10-02T21:30:00Z", false, new Date("2026-09-01T09:00:00Z")).validUntilHe).toBe("בתוקף עד 03/10/2026");
  });
});

describe("המסמכים שלי — expiring, renewed and expired documents", () => {
  const now = new Date("2026-10-03T09:00:00Z");
  const inDays = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString();
  const withLicence = (credential: { status: string; expiresAt: string | null }, renewalPending = false) =>
    application({
      services: [
        {
          id: "ps1", serviceId: "s1", code: "HOME_ELECT_FAULT", nameHe: "תקלה חשמלית", priceModel: "VISIT_QUOTE", status: "APPROVED", priced: true,
          requirements: [{ requirement: "LICENSE:ELECTRICIAN", mandatory: true, credential: { id: "c1", number: "123", noExpiry: false, ...credential }, renewalPending }],
        },
      ],
    });
  const licence = (view: ProApplicationView) => verificationStepsFor(view, now).find((s) => s.id === "req:LICENSE:ELECTRICIAN")!;

  it("expiring in 10 days: verified, dated, and offers the renewal", () => {
    const view = withLicence({ status: "VERIFIED", expiresAt: inDays(10) });
    expect(licence(view)).toMatchObject({ state: "VERIFIED", validUntilHe: "בתוקף עד 13/10/2026", actionHe: "יפוג בעוד 10 ימים — אפשר להעלות חידוש" });
    expect(renewableStepIds(view, now).has("req:LICENSE:ELECTRICIAN")).toBe(true);
  });
  it("expiring tomorrow says מחר", () => {
    expect(licence(withLicence({ status: "VERIFIED", expiresAt: inDays(1) })).actionHe).toBe("יפוג מחר — אפשר להעלות חידוש");
  });
  it("a renewal already sent: says it is being checked, and offers no second one", () => {
    const view = withLicence({ status: "VERIFIED", expiresAt: inDays(10) }, true);
    expect(licence(view).actionHe).toBe("החידוש התקבל ונמצא בבדיקה");
    expect(renewableStepIds(view, now).size).toBe(0);
  });
  it("expired with a renewal waiting: the checking words, no second upload, and the step is marked as waiting", () => {
    const view = withLicence({ status: "EXPIRED", expiresAt: inDays(-1) }, true);
    expect(licence(view)).toMatchObject({ state: "EXPIRED", actionHe: "החידוש התקבל ונמצא בבדיקה" });
    expect(renewableStepIds(view, now).size).toBe(0);
    expect(renewalPendingStepIds(view).has("req:LICENSE:ELECTRICIAN")).toBe(true);
    expect(renewalPendingStepIds(withLicence({ status: "EXPIRED", expiresAt: inDays(-1) })).size).toBe(0);
  });
  it("expired: the expired state, its own words, and renewable", () => {
    const view = withLicence({ status: "EXPIRED", expiresAt: inDays(-1) });
    expect(licence(view)).toMatchObject({ state: "EXPIRED", actionHe: "פג תוקף — צריך להעלות מסמך בתוקף." });
    expect(renewableStepIds(view, now).has("req:LICENSE:ELECTRICIAN")).toBe(true);
  });
  it("far from expiry: dated, nothing to do, not renewable", () => {
    const view = withLicence({ status: "VERIFIED", expiresAt: inDays(200) });
    expect(licence(view)).toMatchObject({ state: "VERIFIED", actionHe: null });
    expect(renewableStepIds(view, now).size).toBe(0);
  });
});

describe("why a service is not taking calls", () => {
  it("says the first gate that stops it, in dispatch's order", () => {
    expect(blockedReasonHe(service())).toBeNull();
    expect(blockedReasonHe(service({ eligible: false, accountApproved: false, missing: ["LICENSE:ELECTRICIAN"] }))).toBe("החשבון עוד בבדיקה");
    expect(blockedReasonHe(service({ eligible: false, missing: ["LICENSE:ELECTRICIAN"] }))).toBe("חסר: רישיון חשמלאי");
    expect(blockedReasonHe(service({ eligible: false, expired: ["INSURANCE:LIABILITY"] }))).toBe("פג תוקף: ביטוח צד ג׳");
    // Dispatch does not ask for a price, so neither does this.
    expect(blockedReasonHe(service({ chargeable: false }))).toBeNull();
  });

  it("is live only when the server says eligible and nothing stops it", () => {
    const [ok, waiting] = eligibilityFor([service(), service({ serviceId: "s2", eligible: false, serviceApproved: false })]);
    expect(ok).toMatchObject({ id: "s1", live: true, blockedByHe: null });
    expect(waiting).toMatchObject({ id: "s2", live: false, blockedByHe: "השירות עוד בבדיקה" });
  });
});

describe("pricing rows", () => {
  it("carry the professional's own price, and an unset one stays unset", () => {
    const rows = pricingRowsFor([service(), service({ serviceId: "s2", basePriceMinorUnits: null })]);
    expect(rows.map((r) => r.amountMinorUnits)).toEqual([15000, null]);
  });
});

describe("earnings when customers pay the professional directly (D1)", () => {
  const NOW = new Date("2026-10-02T12:00:00");
  const day = (offset: number) => {
    const d = new Date(NOW);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - offset);
    return d.toISOString();
  };
  const view = (jobs: number): ProEarningsView => ({
    netMinorUnits: 0,
    grossMinorUnits: null,
    currency: "ILS",
    jobCount: 0,
    breakdown: {
      currency: "ILS",
      periodFromISO: day(6),
      periodToISO: NOW.toISOString(),
      periodGrossMinorUnits: jobs ? 25000 : 0,
      periodNetMinorUnits: null,
      periodJobCount: jobs,
      days: [6, 5, 4, 3, 2, 1, 0].map((o) => ({ dateISO: day(o), netMinorUnits: null, grossMinorUnits: o === 0 && jobs ? 25000 : 0, jobs: o === 0 ? jobs : 0 })),
      jobs: jobs
        ? [{ jobId: "j1", serviceCode: "HOME_ELECT_FAULT", serviceNameHe: "תקלה חשמלית", completedAt: NOW.toISOString(), grossMinorUnits: 25000, deductions: [], netMinorUnits: null }]
        : [],
      awaitingCommissionDecision: false,
      paidDirectly: true,
      unpricedJobCount: 0,
    },
  });

  it("draws the days from what the jobs came to and never claims a net", () => {
    const props = earningsPropsFor(view(1), NOW);
    expect(props.paidDirectly).toBe(true);
    expect(props.periodNetMinorUnits).toBeNull();
    expect(props.periodGrossMinorUnits).toBe(25000);
    const today = props.days.find((d) => d.isToday)!;
    expect(today.netMinorUnits).toBe(25000);
    expect(props.days.filter((d) => !d.isToday).every((d) => d.netMinorUnits === null)).toBe(true);
  });

  it("shows no chart for an empty week", () => {
    expect(earningsPropsFor(view(0), NOW).days).toEqual([]);
  });
});

describe("ככה הלקוחות רואים אותך", () => {
  const NOW = new Date("2026-10-02T12:00:00Z");
  const view = (portraitKind: "PHOTO" | "CHARACTER" | null): ProPublicProfileView => ({
    professional: {
      id: "p", displayName: "דנה", profilePhotoUrl: portraitKind === "PHOTO" ? "https://example.test/face.jpg" : null, portraitKind, addressAs: "F",
      verifications: [], proNowCompletedJobs: 3, proNowRatingAverage: null, proNowRatingCount: 1, externalReputation: null,
    },
    services: [
      { serviceId: "s1", serviceCode: "HOME_PLUMB_LEAK", nameHe: "נזילה", basePriceMinorUnits: 25000 },
      { serviceId: "s2", serviceCode: "HOME_ELECT_FAULT", nameHe: "תקלה חשמלית", basePriceMinorUnits: null },
    ],
    reviews: [{ id: "r1", rating: 5, text: "מעולה", createdAt: "2026-09-18T12:00:00Z", serviceNameHe: "נזילה", reviewerLabelHe: null }],
  });

  it("shows the price a customer sees, and the lowest as the 'from' price", () => {
    const p = publicProfilePropsFor(view("PHOTO"), NOW);
    expect(p.services.map((s) => s.priceHintHe)).toEqual([expect.stringContaining("250"), null]);
    expect(p.fromPriceMinorUnits).toBe(25000);
    expect(p.professional.profilePhotoUrl).toBe("https://example.test/face.jpg");
  });

  it("draws the trade's character for someone who chose one, as the match card does", () => {
    expect(publicProfilePropsFor(view("CHARACTER"), NOW).professional.profilePhotoUrl).toMatch(/\.(webp|png|jpe?g)/);
  });

  it("dates a review only roughly, and names an unnamed reviewer neutrally", () => {
    const [r] = publicProfilePropsFor(view(null), NOW).reviews;
    expect(r).toMatchObject({ whenHe: "לפני 2 שבועות", reviewerLabelHe: "לקוח/ה", serviceNameHe: "נזילה" });
    expect(agoHe("2026-10-02T08:00:00Z", NOW)).toBe("היום");
    expect(agoHe("2025-09-01T08:00:00Z", NOW)).toBe("לפני שנה");
  });
});
