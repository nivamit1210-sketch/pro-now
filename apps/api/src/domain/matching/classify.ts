import type { RequestClassifier, RequestMatch } from "@pro-now/types";

/**
 * The classifier chain (docs/21 W5): the first classifier that is sure
 * enough answers. Keyword first, because it is free, instant and exactly
 * what the web app already showed; a later classifier is asked only when
 * the one before it could not do better than "low".
 *
 * Whatever any classifier says, the answer is cut down to services that
 * exist: a classifier cannot add a service, a professional, or anything
 * else outside the catalogue.
 */
export interface Classified extends RequestMatch {
  classifier: string;
}

const SURE_ENOUGH = new Set(["high", "medium"]);

export async function classifyRequest(
  chain: RequestClassifier[],
  text: string,
  knownServiceIds: ReadonlySet<string>
): Promise<Classified> {
  let answer: Classified | null = null;
  for (const classifier of chain) {
    const raw = await classifier.classify(text);
    const result = { ...constrain(raw, knownServiceIds), classifier: classifier.name };
    // The first answer is kept as the fallback; a later one replaces it only by being surer.
    if (!answer || rank(result) > rank(answer)) answer = result;
    if (SURE_ENOUGH.has(result.confidence)) break;
  }
  return answer ?? { candidates: [], confidence: "none", urgentCare: null, classifier: "none" };
}

const RANK = { none: 0, low: 1, medium: 2, high: 3 } as const;
const rank = (m: RequestMatch) => RANK[m.confidence];

function constrain(m: RequestMatch, known: ReadonlySet<string>): RequestMatch {
  const candidates = m.candidates.filter((c) => known.has(c.serviceId));
  const options = m.clarify?.options.filter((id) => known.has(id)) ?? [];
  const clarify = m.clarify && options.length >= 2 ? { ...m.clarify, options } : undefined;
  if (candidates.length === 0 && !clarify) return { candidates: [], confidence: "none", urgentCare: m.urgentCare };
  return { ...m, candidates, clarify };
}
