import { catalogMatchRules, matchRequest, type RequestClassifier, type ServiceMatchRule } from "@pro-now/types";

/** The keyword matcher, the same code the web app runs (docs/21 W5). */
export function createKeywordClassifier(rules: ServiceMatchRule[] = catalogMatchRules): RequestClassifier {
  return {
    name: "keyword",
    isSandbox: false,
    classify: async (text) => matchRequest(text, rules),
  };
}
