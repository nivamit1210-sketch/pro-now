import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { matchRequest } from "../src/request-match";

/**
 * ACCURACY IS A NUMBER (docs/21 W5).
 *
 * Every sentence in the golden set goes through `matchRequest`, and four
 * rates come out. CI fails when any of them is worse than the recorded
 * baseline, so a change that fixes one sentence and quietly breaks three
 * others is caught.
 *
 * After an intentional improvement, record the new baseline:
 *   UPDATE_GOLDEN_BASELINE=1 npx vitest run test/match-golden.test.ts   (in packages/types)
 * and commit the baseline file with the change that earned it.
 */
interface Row {
  text: string;
  expect: string[];
  forbid?: string[];
  ask?: boolean;
  source: "real" | "plan" | "dev-seed";
}

interface Rates {
  /** Of the sentences that name a service: the first suggestion is right. */
  top1: number;
  /** …one of the first two suggestions (or question options) is right. */
  top2: number;
  /** Of every sentence: "high" confidence, and wrong. Lower is better. */
  confidentlyWrong: number;
  /** Of the sentences that should match nothing or ask: they did. */
  quiet: number;
}

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const GOLDEN = here("./fixtures/match-golden.he.json");
const BASELINE = here("./fixtures/match-golden.baseline.json");
const rows = (JSON.parse(readFileSync(GOLDEN, "utf8")) as { rows: Row[] }).rows;

function evaluate() {
  let top1 = 0;
  let top2 = 0;
  let named = 0;
  let quiet = 0;
  let unnamed = 0;
  let confidentlyWrong = 0;
  const misses: string[] = [];
  const forbidden: string[] = [];

  for (const row of rows) {
    const m = matchRequest(row.text);
    const offered = [...m.candidates.map((c) => c.serviceId), ...(m.clarify?.options ?? [])];
    const first = m.candidates[0]?.serviceId;
    for (const f of row.forbid ?? []) if (offered.includes(f)) forbidden.push(`${row.text} → ${f}`);

    if (row.expect.length === 0) {
      unnamed++;
      const ok = row.ask ? Boolean(m.clarify) : m.confidence === "none";
      if (ok) quiet++;
      else misses.push(`[quiet] ${row.text} → ${m.confidence} ${offered.join(",")}`);
      if (m.confidence === "high") confidentlyWrong++;
      continue;
    }

    named++;
    const hit1 = first !== undefined && row.expect.includes(first);
    const hit2 = offered.slice(0, 2).some((id) => row.expect.includes(id)) || hit1;
    if (hit1) top1++;
    if (hit2) top2++;
    if (!hit1) misses.push(`[${row.source}] ${row.text} → ${first ?? "—"} (${m.confidence}); want ${row.expect.join("|")}`);
    if (m.confidence === "high" && !hit1) confidentlyWrong++;
  }

  const r = (n: number, d: number) => Math.round((d === 0 ? 1 : n / d) * 1000) / 1000;
  const rates: Rates = {
    top1: r(top1, named),
    top2: r(top2, named),
    confidentlyWrong: r(confidentlyWrong, rows.length),
    quiet: r(quiet, unnamed),
  };
  return { rates, misses, forbidden };
}

describe("request matching golden set", () => {
  const { rates, misses, forbidden } = evaluate();

  it("reports its rates", () => {
    console.log(
      `golden set: ${rows.length} sentences · top-1 ${rates.top1} · top-2 ${rates.top2} · confidently wrong ${rates.confidentlyWrong} · quiet ${rates.quiet}` +
        (misses.length ? `\n  misses:\n    ${misses.join("\n    ")}` : "")
    );
    if (process.env.UPDATE_GOLDEN_BASELINE === "1") writeFileSync(BASELINE, JSON.stringify(rates, null, 2) + "\n");
  });

  it("never suggests a service the sentence rules out", () => {
    expect(forbidden).toEqual([]);
  });

  it("answers every sentence from the plan (docs/21 W5 acceptance)", () => {
    for (const row of rows.filter((x) => x.source === "plan")) {
      expect(row.expect, row.text).toContain(matchRequest(row.text).candidates[0]?.serviceId);
    }
  });

  it("is no worse than the recorded baseline", () => {
    const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as Rates;
    expect(rates.top1, "top-1").toBeGreaterThanOrEqual(baseline.top1);
    expect(rates.top2, "top-2").toBeGreaterThanOrEqual(baseline.top2);
    expect(rates.quiet, "quiet").toBeGreaterThanOrEqual(baseline.quiet);
    expect(rates.confidentlyWrong, "confidently wrong").toBeLessThanOrEqual(baseline.confidentlyWrong);
  });
});
