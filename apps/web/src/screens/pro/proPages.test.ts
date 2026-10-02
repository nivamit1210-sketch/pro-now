import { describe, expect, it } from "vitest";
import type { ProApplicationView, ProEarningsView, ProPublicProfileView, ProServiceEligibilityView } from "@pro-now/types";

import { agoHe, blockedReasonHe, earningsPropsFor, eligibilityFor, pricingRowsFor, proPageFromPath, publicProfilePropsFor, verificationStepsFor } from "./proPages";

function application(over: Partial<ProApplicationView> = {}): ProApplicationView {
  return {
    profile: { id: "p", displayName: "דנה", legalName: "דנה לוי", addressAs: "F", verificationStatus: "APPROVED", business: null, shop: null, portrait: null },
    services: [
      {
        id: "ps1", serviceId: "s1", code: "HOME_ELECT_FAULT", nameHe: "תקלה חשמלית", priceModel: "VISIT_QUOTE", status: "APPROVED", priced: true,
        requirements: [
          { requirement: "LICENSE:ELECTRICIAN", mandatory: true, credential: { id: "c1", status: "VERIFIED", number: "123" } },
          { requirement: "INSURANCE:LIABILITY", mandatory: false, credential: null },
        ],
      },
      {
        id: "ps2", serviceId: "s2", code: "HOME_ELECT_INSTALL", nameHe: "התקנת גוף תאורה", priceModel: "VISIT_QUOTE", status: "APPROVED", priced: true,
        requirements: [{ requirement: "LICENSE:ELECTRICIAN", mandatory: true, credential: null }],
      },
    ],
    area: null,
    documents: [
      { kind: "GOVERNMENT_ID", status: "VERIFIED" },
      { kind: "SELFIE", status: "PENDING" },
    ],
    missing: [],
    submitted: true,
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
    expect(steps.find((s) => s.id === "doc:GOVERNMENT_ID")?.state).toBe("VERIFIED");
    expect(steps.find((s) => s.id === "doc:SELFIE")?.state).toBe("IN_REVIEW");
    const tax = steps.find((s) => s.id === "doc:TAX_FILE")!;
    expect(tax.state).toBe("NOT_STARTED");
    expect(tax.actionHe).toBe("עוד לא הועלה.");
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
      id: "p", displayName: "דנה", profilePhotoUrl: portraitKind === "PHOTO" ? "https://example.test/face.jpg" : null, portraitKind,
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
