import { describe, expect, it, vi } from "vitest";
import { matchRequest, type RequestClassifier, type RequestMatch } from "@pro-now/types";
import { classifyRequest } from "../src/domain/matching/classify.js";
import { createKeywordClassifier } from "../src/infra/matching/keyword-classifier.js";
import { MATCH_FEEDBACK_RETENTION_MS, purgeMatchFeedback } from "../src/domain/matching/retention.js";

const known = new Set(["svc-a", "svc-b", "svc-c"]);
const fixed = (name: string, m: RequestMatch): RequestClassifier & { classify: ReturnType<typeof vi.fn> } => ({
  name,
  isSandbox: true,
  classify: vi.fn().mockResolvedValue(m),
});
const high: RequestMatch = { candidates: [{ serviceId: "svc-a", score: 3 }], confidence: "high", urgentCare: null };
const none: RequestMatch = { candidates: [], confidence: "none", urgentCare: null };

describe("classifyRequest", () => {
  it("stops at the first classifier that is sure enough", async () => {
    const first = fixed("first", high);
    const second = fixed("second", high);
    const out = await classifyRequest([first, second], "x", known);
    expect(out).toMatchObject({ classifier: "first", confidence: "high" });
    expect(second.classify).not.toHaveBeenCalled();
  });

  it("asks the next classifier only when the one before could not do better than low", async () => {
    const out = await classifyRequest([fixed("first", none), fixed("second", high)], "x", known);
    expect(out).toMatchObject({ classifier: "second", candidates: [{ serviceId: "svc-a" }] });
  });

  it("keeps the earlier answer when the later one is not surer", async () => {
    const low: RequestMatch = { candidates: [], confidence: "low", clarify: { questionHe: "?", options: ["svc-a", "svc-b"] }, urgentCare: null };
    const out = await classifyRequest([fixed("first", low), fixed("second", none)], "x", known);
    expect(out.classifier).toBe("first");
  });

  it("cuts every answer down to services that exist", async () => {
    const invented: RequestMatch = {
      candidates: [{ serviceId: "pro-dana-cohen", score: 9 }, { serviceId: "svc-b", score: 2 }],
      confidence: "high",
      clarify: { questionHe: "?", options: ["svc-c", "made-up"] },
      urgentCare: null,
    };
    const out = await classifyRequest([fixed("x", invented)], "x", known);
    expect(out.candidates.map((c) => c.serviceId)).toEqual(["svc-b"]);
    // A question with one real option left is not a question.
    expect(out.clarify).toBeUndefined();
  });

  it("answers none when nothing real is left", async () => {
    const out = await classifyRequest([fixed("x", { ...high, candidates: [{ serviceId: "nope", score: 3 }] })], "x", known);
    expect(out).toMatchObject({ candidates: [], confidence: "none" });
  });
});

describe("keyword classifier", () => {
  it("answers exactly what the web app's matcher answers", async () => {
    for (const text of ["המזגן לא מקרר", "יש לי עכבר", "לא צריך חשמלאי, צריך אינסטלטור", "מה השעה"]) {
      expect(await createKeywordClassifier().classify(text)).toEqual(matchRequest(text));
    }
  });
});

describe("match feedback retention", () => {
  it("deletes rows older than 4 days (decision D3)", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 3 });
    const now = new Date("2026-10-05T12:00:00Z");
    expect(await purgeMatchFeedback({ matchFeedback: { deleteMany } }, now)).toBe(3);
    expect(deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: new Date(now.getTime() - MATCH_FEEDBACK_RETENTION_MS) } } });
    expect(MATCH_FEEDBACK_RETENTION_MS).toBe(4 * 24 * 60 * 60 * 1000);
  });
});
