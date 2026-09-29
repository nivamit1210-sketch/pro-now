import type { RequestMatch } from "../request-match";

/**
 * Reads what a customer typed and names the services it could be
 * (docs/21 W5), vendor-neutral (CLAUDE.md §6).
 *
 * Two kinds are planned:
 * - the keyword matcher (real, free, the same code the web app runs);
 * - a model-backed classifier, off until the model and vendor are decided
 *   (docs/21 §5 D2). There is no adapter for it: an interface is not a
 *   vendor, and a stand-in would be a mock presented as understanding.
 *
 * A classifier names SERVICES from the catalogue and nothing else. It
 * never names a professional (CLAUDE.md §3: dispatch decides who comes),
 * and the customer confirms before anything is dispatched.
 */
export interface RequestClassifier {
  readonly name: string;
  readonly isSandbox: boolean;
  classify(text: string): Promise<RequestMatch>;
}
