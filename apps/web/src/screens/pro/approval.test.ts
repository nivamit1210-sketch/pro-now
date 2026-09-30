import { describe, expect, it } from "vitest";
import type { ProApplicationView } from "@pro-now/types";

import { APPROVAL_STEPS_HE, approvalProgress } from "./approval";

type Req = ProApplicationView["services"][number]["requirements"][number];
function view(opts: {
  submitted?: boolean;
  account?: string;
  documents?: string[];
  credentials?: Array<string | null>;
  services?: string[];
}): ProApplicationView {
  const requirements: Req[] = (opts.credentials ?? []).map((status, i) => ({
    requirement: `LICENSE:${i}`,
    mandatory: true,
    credential: status ? { id: `c${i}`, status, number: null } : null,
  }));
  return {
    profile: { id: "p", displayName: "דנה", legalName: "דנה לוי", addressAs: "F", verificationStatus: opts.account ?? "SERVICE_REVIEW", business: null, shop: null, portrait: null },
    services: (opts.services ?? ["PENDING"]).map((status, i) => ({
      id: `ps${i}`, serviceId: `s${i}`, code: `S${i}`, nameHe: `שירות ${i}`, priceModel: "VISIT_QUOTE", status, priced: true,
      requirements: i === 0 ? requirements : [],
    })),
    area: null,
    documents: (opts.documents ?? ["PENDING", "PENDING", "PENDING"]).map((status, i) => ({ kind: `K${i}`, status })),
    missing: [],
    submitted: opts.submitted ?? true,
  };
}
const states = (v: ProApplicationView) => approvalProgress(v).map((s) => s.state);

describe("approvalProgress: the true state, nothing ticking by itself", () => {
  it("has one row per step Amit listed", () => {
    expect(approvalProgress(view({}))).toHaveLength(APPROVAL_STEPS_HE.length);
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
