/**
 * The matcher moved to `@pro-now/types` (docs/21 W5), so the server and the
 * web app run one implementation. Re-exported here for the shared screens.
 */
export {
  matchServicesByText,
  matchRequest,
  urgentCareFor,
  catalogMatchRules,
  type ServiceMatchRule,
  type ServiceMatch,
  type RequestMatch,
  type MatchConfidence,
  type MatchClarify,
  type UrgentCare,
} from "@pro-now/types";
