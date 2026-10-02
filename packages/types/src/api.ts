/**
 * Wire contract types — the JSON shapes `apps/api` actually sends, as
 * consumed by `apps/customer-mobile`, `apps/pro-mobile`, `apps/admin` and
 * `packages/api-client`. Source of truth: /docs/06-API-SPEC.md, with field
 * names and nullability taken from `apps/api/prisma/schema.prisma`.
 *
 * These exist so that no client has to reach for `any` to read a response.
 * A client renders what the server says (/CLAUDE.md §3 — the server is
 * authoritative); these types describe that payload, they do not define it.
 *
 * Dates cross the wire as ISO-8601 strings, never as `Date`.
 */

import type { JobActor, JobEvent, JobState, PriceModel, ProPresenceState } from "./job";
import type { IntakeBriefLine } from "./intake";

// ---------------------------------------------------------------------
// Catalog — GET /v1/catalog
// ---------------------------------------------------------------------

/** Trust tier A–E, see /docs/10-TRUST-VERIFICATION.md. */
export type TrustTier = "A" | "B" | "C" | "D" | "E";

export interface CatalogServiceView {
  id: string;
  code: string;
  nameHe: string;
  nameEn: string;
  priceModel: PriceModel;
  trustTier: TrustTier | string;
}

export interface CatalogCategoryView {
  code: string;
  nameHe: string;
  nameEn: string;
  services: CatalogServiceView[];
}

export interface CatalogDepartmentView {
  code: string;
  nameHe: string;
  nameEn: string;
  categories: CatalogCategoryView[];
}

export interface CatalogResponse {
  marketCode: string;
  departments: CatalogDepartmentView[];
}

// ---------------------------------------------------------------------
// Quotes — /v1/jobs/:id/quotes, /v1/quotes/:id/approve
// ---------------------------------------------------------------------

export type QuoteStatus = "SENT" | "APPROVED" | "DECLINED" | "SUPERSEDED";
export type QuoteItemKind = "LABOR" | "MATERIALS" | "OTHER";

export interface QuoteItemView {
  id: string;
  quoteId: string;
  description: string;
  quantity: number;
  unitPriceMinorUnits: number;
  kind: QuoteItemKind | string;
}

export interface QuoteView {
  id: string;
  jobId: string;
  version: number;
  /** Integrity hash the customer must echo back on approval. */
  versionHash: string;
  status: QuoteStatus | string;
  totalMinorUnits: number;
  notes: string | null;
  createdAt: string;
  lineItems: QuoteItemView[];
}

// ---------------------------------------------------------------------
// Dispatch offers
// ---------------------------------------------------------------------

export type DispatchOfferStatusView =
  | "CREATED"
  | "SENT"
  | "VIEWED"
  | "ACCEPTED"
  | "SKIPPED"
  | "EXPIRED"
  | "WITHDRAWN";

export interface DispatchOfferView {
  id: string;
  jobId: string;
  professionalId: string;
  status: DispatchOfferStatusView | string;
  offeredAt: string;
  expiresAt: string;
  respondedAt: string | null;
  scoreSnapshot: number | null;
  etaSecondsSnapshot: number | null;
  payoutMinorUnitsSnapshot: number | null;
}

// ---------------------------------------------------------------------
// Jobs — GET /v1/jobs/:id, POST /v1/jobs
// ---------------------------------------------------------------------

export interface JobView {
  id: string;
  customerId: string;
  serviceId: string;
  addressId: string;
  assignedProfessionalId: string | null;
  status: JobState;
  description: string | null;
  /** The catalogue service the customer picked ("svc-clean"); null on older jobs (audit v2 #1). */
  catalogServiceId?: string | null;
  structuredAnswers: Record<string, unknown> | null;
  approvedQuoteId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Included by GET /v1/jobs/:id; absent on endpoints that do not expand it. */
  events?: JobEvent[];
  offers?: DispatchOfferView[];
  quotes?: QuoteView[];
}

/**
 * A place the customer can be sent to.
 *
 * `formatted` is what a professional reads before knocking, which is why
 * it is a plain required string rather than a set of components: the thing
 * that has to be right is the sentence somebody acts on.
 */
export interface AddressView {
  id: string;
  label: string | null;
  formatted: string;
  lat: number;
  lng: number;
  placeId: string | null;
  /** HOUSE, STREET, LOCALITY or DEVICE; null on addresses saved before 2026-10-01. */
  geoPrecision: string | null;
  createdAt: string;
}

/** A street from the official list, offered as the customer types (GET /v1/geo/streets). */
export interface StreetSuggestion {
  localityCode: number;
  streetCode: number;
  streetName: string;
  localityName: string;
  /** The house number from the query, carried through. */
  houseNumber: string | null;
  /** The locality itself: a village without named streets. */
  wholeLocality: boolean;
}

/** Result of the dispatch attempt that POST /v1/jobs kicks off. */
export interface DispatchResultView {
  status: "OFFER_SENT" | "NO_ELIGIBLE_CANDIDATES" | string;
  offerId?: string;
  professionalId?: string;
  candidatesConsidered: number;
  candidatesEligible: number;
}

// ---------------------------------------------------------------------
// Reviews — POST /v1/jobs/:id/reviews
// ---------------------------------------------------------------------

export interface ReviewView {
  id: string;
  jobId: string;
  reviewerId: string;
  professionalId: string;
  overallRating: number;
  text: string | null;
  moderationStatus: string;
  createdAt: string;
}

// ---------------------------------------------------------------------
// Professional — GET /v1/pro/verification
// ---------------------------------------------------------------------

export type VerificationStatusView =
  | "DRAFT"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "SUSPENDED"
  | "EXPIRED";

/** One credential row, as the verification centre reads it. */
export interface ProCredentialView {
  id: string;
  serviceId: string;
  /** LICENSE | CERTIFICATE | INSURANCE */
  type: string;
  /** PENDING | VERIFIED | EXPIRED | REJECTED */
  status: string;
  issuer: string | null;
  expiresAt: string | null;
}

export interface ProfessionalVerificationView {
  id: string;
  userId: string;
  legalName: string;
  displayName: string;
  profilePhotoRef: string | null;
  verificationStatus: VerificationStatusView | string;
  presenceState: ProPresenceState;
  createdAt: string;
  updatedAt: string;

  /*
   * THE EXPANSIONS THE ROUTE ALREADY SENT AND THE TYPE DID NOT ADMIT TO.
   *
   * `/v1/pro/verification` has always included these; the type stopped at
   * the profile's own columns, so the verification centre could not read
   * them and showed four hard-coded rows instead — telling every
   * professional in the marketplace that their identity and business were
   * verified and their electrician's licence had expired.
   *
   * Every one is optional because an older server, or a professional
   * partway through onboarding, genuinely has nothing to send. Absent
   * means "not submitted", which the screen draws as NOT_STARTED — never
   * as verified.
   */
  identityVerification?: {
    status: string;
    /** True for a result from the stub adapter. A sandbox pass is not a pass. */
    isSandbox: boolean;
    verifiedAt?: string | null;
    /** The current check only, and only what the page shows (no photos, reviewer or vendor reference). */
    id?: string;
    vendorName?: string;
    method?: string | null;
    createdAt?: string;
    /** The reviewer's words, sent only for RETAKE_REQUESTED and REJECTED. */
    decisionReason?: string | null;
  } | null;
  businessProfile?: {
    verificationStatus: string;
    legalName?: string | null;
  } | null;
  credentials?: ProCredentialView[];
  externalProfiles?: { linkStatus: string; profileUrl: string | null }[];
}

/**
 * The assigned job, as the PROFESSIONAL sees it.
 *
 * ---------------------------------------------------------------------
 * WHY IT IS A SEPARATE VIEW FROM THE CUSTOMER'S
 * ---------------------------------------------------------------------
 * The full address is here, and it is here only because the job is
 * assigned. Before assignment the professional gets a coarse area label
 * and nothing more (/docs/12-PRIVACY.md), which is why this cannot be the
 * same payload as the offer card with a few extra fields bolted on: the
 * two differ precisely in what they are allowed to contain, and a shared
 * type would make that difference a runtime decision instead of a
 * structural one.
 *
 * Every field that might not be knowable is nullable and stays null. The
 * screen this feeds used to show "מלצ׳ט 19, תל אביב" and "ETA: 8 דקות" to
 * every professional on every job.
 */
export interface ProJobDetailView {
  jobId: string;
  status: JobState;
  serviceId: string;
  serviceNameHe: string;
  /** The catalogue code: the screens' mark and words come from it. */
  serviceCode: string;
  priceModel: PriceModel;
  /** Released because the job is assigned. Never before. */
  addressHe: string;
  /** The address's coordinates, for navigation links; released with it. */
  lat: number | null;
  lng: number | null;
  /** Floor, entrance, door code — the difference between arriving and finding. */
  accessNoteHe: string | null;
  customerNameHe: string;
  descriptionHe: string | null;
  /**
   * The intake answers, keyed by question id.
   *
   * The questions themselves are in the catalogue, which both apps have,
   * so pairing them is the client's job — the server holding a second
   * copy of the wording is how the two come to disagree about what was
   * asked.
   */
  structuredAnswers: Record<string, unknown> | null;
  /** From the route provider when there is one; null rather than a guess. */
  routeEtaMinutes: number | null;
  /**
   * Expected payout. Null when it genuinely depends on the outcome — a
   * VISIT_QUOTE job before the quote exists, for instance. A plausible
   * placeholder here would be a number the professional plans around.
   */
  payoutMinorUnits: number | null;
  payoutIsEstimate: boolean;
  /** The quote currently awaiting the customer, when there is one. */
  pendingQuote: QuoteView | null;
  /** The quote that was approved, when there is one. */
  approvedQuote: QuoteView | null;
  /** Ordered for someone else: the person at the door, and the code to say to them. */
  onSiteNameHe: string | null;
  doorCodeHe: string | null;
  /** Signed URLs are minted only after this route has verified assignment. */
  media: JobMediaView[];
}

export interface JobMediaView {
  id: string;
  kind: string;
  mime: string;
  bytes: number;
  url: string;
}

/**
 * One service a professional has applied for, and whether they may take
 * calls on it right now.
 *
 * The server decides — /CLAUDE.md §3, "Server is authoritative for
 * eligibility" — and it reports the NAMED requirement rather than a bare
 * boolean, because "you are not eligible" is not actionable and "your
 * insurance expired" is. A greyed-out row with no reason is how somebody
 * loses a day of work without knowing they could have fixed it in ten
 * minutes.
 */
export interface ProServiceEligibilityView {
  serviceId: string;
  /** The catalogue code, so a client can find this service's own art. */
  serviceCode: string;
  nameHe: string;

  /*
   * THE PRICE, AND WHAT KIND OF PRICE IT IS.
   *
   * A service can be dispatch-ELIGIBLE and still unchargeable, and those
   * are different sentences to a professional: one is about documents,
   * the other is about a number nobody has typed. Until the pricing
   * screen existed only the first was ever said.
   */
  priceModel: PriceModel;
  /** What they charge. Null means not configured — never "free". */
  basePriceMinorUnits: number | null;
  minimumBillableMinutes: number | null;
  perKmMinorUnits: number | null;
  minimumFareMinorUnits: number | null;
  /** Whether a job on this service could be settled at all. */
  chargeable: boolean;

  /** Dispatch-eligible for THIS service, right now. All three gates passed. */
  eligible: boolean;
  /** The account-level gate: verificationStatus is APPROVED. */
  accountApproved: boolean;
  /** This professional's application for this service was approved. */
  serviceApproved: boolean;
  /** Mandatory requirements with nothing on file at all. */
  missing: string[];
  /** Requirements whose credential has passed its expiry. */
  expired: string[];
  /** Requirements whose credential is on file but not yet VERIFIED. */
  unverified: string[];
}

// ---------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------

/** Every non-2xx response from apps/api uses this envelope. */
export interface ApiErrorResponse {
  code: string;
  message: string;
  requestId?: string;
}

export type { JobActor };

// ---------------------------------------------------------------------
// Match & offer payloads — the two cards the marketplace turns on
// ---------------------------------------------------------------------

/**
 * Factual, enumerated trust facts only. There is deliberately no numeric
 * "trust score" field anywhere in this file — /CLAUDE.md §3 forbids
 * fabricating one, and an enumerated list cannot be quietly turned into one.
 */
export type VerificationBadgeKind =
  | "IDENTITY_VERIFIED"
  | "IDENTITY_CHECKED"
  | "BUSINESS_VERIFIED"
  | "LICENSE_VERIFIED"
  | "CREDENTIALS_CHECKED"
  | "EXTERNAL_REPUTATION_LINKED";

/**
 * Reputation imported from an external platform. Always carried separately
 * from PRO NOW's own rating and never merged into a single score
 * (/docs/10-TRUST-VERIFICATION.md §Reputation import).
 */
export interface ExternalReputationView {
  source: string;
  ratingAverage: number | null;
  ratingCount: number | null;
  profileUrl: string | null;
}

/** How a professional asked to be addressed: masculine or feminine Hebrew. */
export type ProAddressAs = "M" | "F";

export interface ProfessionalSummaryView {
  id: string;
  displayName: string;
  /** Their photo, through a short-lived link; null for a character or no choice. */
  profilePhotoUrl: string | null;
  /** What they chose while joining: "CHARACTER" means draw the job's trade character. */
  portraitKind: "PHOTO" | "CHARACTER" | null;
  /**
   * How they asked to be addressed while joining ("M" / "F"), so the customer's
   * screens say הגיע / הגיעה about them. null: not chosen — screens use the masculine.
   */
  addressAs: ProAddressAs | null;
  verifications: VerificationBadgeKind[];
  /** Jobs completed through PRO NOW. Never an imported or invented count. */
  proNowCompletedJobs: number;
  /** null until there are enough PRO NOW reviews to show an average. */
  proNowRatingAverage: number | null;
  proNowRatingCount: number;
  externalReputation: ExternalReputationView | null;
}

/**
 * A real ETA. `isRouteBased: false` means it came from the coarse fallback
 * (haversine + average speed), not a routing provider — the UI MUST then
 * present it as approximate rather than as a route ETA
 * (see providers/maps-routing-provider.ts).
 */
export interface EtaView {
  etaSeconds: number;
  distanceMeters: number | null;
  isRouteBased: boolean;
  computedAt: string;
}

/**
 * What the customer is committing to at the moment of match. Structured
 * numbers only — the Hebrew explanation of each pricing model is client
 * copy, not an API field, so wording can change without an API release.
 *
 * Exactly the fields relevant to `priceModel` are populated.
 */
export interface PriceQuoteView {
  priceModel: PriceModel;
  currency: string;
  /** FIXED */
  fixedTotalMinorUnits?: number | null;
  /** VISIT_QUOTE — the visit fee is knowable; the job total is not, yet. */
  visitFeeMinorUnits?: number | null;
  /** HOURLY — rate per hour plus the minimum charged duration. */
  hourlyRateMinorUnits?: number | null;
  minimumBillableMinutes?: number | null;
  /** DISTANCE_TIME — fixed base, per-kilometre rate, and a fare floor. */
  baseMinorUnits?: number | null;
  perKmMinorUnits?: number | null;
  minimumFareMinorUnits?: number | null;
}

/** GET /v1/jobs/:id/match — everything the customer's match card renders. */
export interface JobMatchView {
  jobId: string;
  status: JobState;
  serviceNameHe: string;
  professional: ProfessionalSummaryView;
  /** null when no ETA has been computed yet — never substitute a guess. */
  eta: EtaView | null;
  /**
   * The ETA the accepted offer was made with, in seconds: the start of the
   * trip that `eta` counts down. With both, `routeProgress` can say how far
   * through it the professional is; null when the offer recorded none.
   */
  etaSecondsAtAssignment?: number | null;
  price: PriceQuoteView;
}

/** GET /v1/pro/offers/current — everything the professional's offer card renders. */
export interface OfferCardView {
  offerId: string;
  jobId: string;
  serviceNameHe: string;
  serviceCode: string;
  priceModel: PriceModel;
  currency: string;
  /** Server-authoritative deadline; the client only counts down to it. */
  expiresAt: string;
  offeredAt: string;
  /** Travel from the professional's current position to the customer. */
  eta: EtaView | null;
  /**
   * Expected payout, shown BEFORE accepting whenever the amount is knowable
   * (/CLAUDE.md §3 — transparent provider payout). null means genuinely not
   * knowable yet (e.g. VISIT_QUOTE before the quote exists); the UI must say
   * so rather than display a plausible number.
   */
  expectedPayoutMinorUnits: number | null;
  /** True when the payout depends on outcome (hours worked, final quote). */
  payoutIsEstimate: boolean;
  /**
   * Approximate area only. The exact address is released after acceptance —
   * pre-assignment location precision is a privacy rule
   * (/docs/12-PRIVACY.md), not a UI nicety.
   */
  customerAreaLabel: string;
  jobDescription: string | null;

  /**
   * ------------------------------------------------------------------
   * WHAT THE PROFESSIONAL IS WALKING INTO
   * ------------------------------------------------------------------
   *
   * A card that says only "₪180 · קבל" asks someone to gamble. These
   * fields exist so the decision is informed: what the customer answered,
   * what they sent, and what the building will be like on arrival.
   *
   * Every one is optional and every one renders as absent when missing.
   * That is deliberate — an offer must be answerable in seconds with only
   * the essentials, and padding the card with "לא ידוע" rows would make a
   * thin offer look like a broken one.
   */

  /** The service's own questions and the customer's own answers. */
  intakeBrief?: IntakeBriefLine[];
  /** Counts only. The media itself is released on acceptance. */
  mediaSummary?: {
    photos: number;
    voiceSeconds: number | null;
  };
  /**
   * Arrival conditions, as the CUSTOMER stated them. Never inferred from a
   * map: a wrong guess about a lift is a professional carrying a machine up
   * four floors. Each field is absent when the customer did not say.
   */
  arrival?: {
    floor?: number | null;
    hasLift?: boolean | null;
    parkingHe?: string | null;
  };
  /**
   * A typical duration for THIS SERVICE from the catalogue — never a
   * prediction about this job.
   *
   * ChatGPT's correction, and it was right: "משך משוער 30–60 דקות" reads as
   * an estimate of the work waiting at that address, and we have no basis
   * for one. Presented as a catalogue fact ("עבודות כאלה נמשכות בדרך כלל"),
   * it informs without pretending. The UI must carry that framing; if it
   * cannot, this field should not be sent.
   */
  typicalServiceMinutes?: [number, number] | null;
}

// ---------------------------------------------------------------------
// Live availability — GET /v1/areas/:areaCode/availability
// ---------------------------------------------------------------------

/**
 * What the server is able to say about supply for one service, right now.
 *
 * This is a **read model for the UI**, not a projection of a database table.
 * The client must know what is correct to show; it must not have to
 * reconstruct that from raw rows or infer it from a count, because every
 * such inference is a place where "we don't know" quietly becomes
 * "there is nobody".
 *
 * - `AVAILABLE`   supply exists and dispatch will find it
 * - `LIMITED`     supply exists but is thin; the server decides the threshold
 * - `UNAVAILABLE` the server checked and there is genuinely none
 * - `UNKNOWN`     the server cannot currently say — NOT the same as none
 */
export type SupplyState = "AVAILABLE" | "LIMITED" | "UNAVAILABLE" | "UNKNOWN";

/**
 * Why supply is not AVAILABLE.
 *
 * It exists so that distinct failures cannot all decay into the same
 * "אין בעלי מקצוע". A service switched off, a region we do not cover, and a
 * genuinely empty market need different words and different next actions;
 * without a code they are indistinguishable by the time they reach the UI.
 * The code is UX-safe but need not be shown verbatim.
 */
export type SupplyReasonCode =
  | "NO_ELIGIBLE_SUPPLY"
  | "SERVICE_INACTIVE"
  | "LOCATION_UNAVAILABLE"
  | "DATA_STALE"
  | "NOT_COMPUTED";

export interface ServiceAvailabilityView {
  serviceId: string;
  state: SupplyState;
  /**
   * Professionals who are ONLINE **and** dispatch-eligible for this specific
   * service (/CLAUDE.md §3 — eligibility is per service, not per account).
   * An online professional whose licence for this service has lapsed is not
   * counted, because the count would promise what dispatch then refuses.
   *
   * Omitted when the state is UNKNOWN. `0` is a real answer, not an absence.
   */
  availableProviderCount?: number;
  /**
   * Travel time of the nearest eligible professional, in minutes, **from a
   * real route computation**.
   *
   * The field is named for its provenance on purpose. A haversine radius
   * presented as an ETA is the most plausible-looking lie this endpoint
   * could tell, and a field called `nearestEtaMinutes` would accept one
   * without anybody noticing. To put a straight-line estimate here, a server
   * author has to write the word "Route" while doing it.
   */
  nearestRouteEtaMinutes?: number;
  reasonCode?: SupplyReasonCode;
}

/**
 * A snapshot of live supply for a coarse area.
 *
 * `computedAt` and `staleAfterSeconds` exist because of the failure this
 * feature invites: a count fetched once, cached in a screen, and still
 * displayed three minutes later when every one of those professionals has
 * gone offline. The server states how long its own answer may be trusted;
 * the client does not get to decide the number is probably still fine.
 *
 * No professional locations or distances appear here. Pre-assignment
 * location precision is a privacy rule (/docs/12-PRIVACY.md), so the nearest
 * ETA is the only spatial fact exposed, and only as a duration.
 */
export interface AreaAvailabilityView {
  /** Coarse area these counts describe. Never a precise address. */
  areaLabel: string;
  /** ISO-8601 instant the server computed this. */
  computedAt: string;
  /** After this many seconds, these counts must be treated as unknown. */
  staleAfterSeconds: number;
  services: ServiceAvailabilityView[];
}

/** `GET /api/v1/jobs`: the customer's own jobs, newest first. */
export interface MyJobSummary {
  id: string;
  status: JobState;
  createdAt: string;
  serviceNameHe: string;
  /** The catalogue code (`Service.code`), for the service's mark. */
  serviceCode: string;
  /** The assigned professional; null until someone accepts. */
  professional: { id: string; displayName: string; addressAs: ProAddressAs | null } | null;
  /** The customer's own stars for this job, once given. */
  ratingGiven: number | null;
  /** What the work came to, once it closed outside the app (D1); else null. */
  amountMinorUnits: number | null;
}

/** What the job closed with while no money moves through the app (D1). */
export interface OutsideAppReceiptView {
  paidInApp: false;
  amountMinorUnits: number | null;
  currency: string;
  basis: string | null;
  reason: string | null;
}

/** `GET /api/v1/jobs/:id`, for the customer. */
export interface CustomerJobResponse {
  job: JobView & { service: { nameHe: string; code: string; priceModel: PriceModel } };
  /**
   * The service's name on every screen: the one the customer picked in the
   * catalogue ("ניקיון דחוף"), or the service's own on older jobs (audit v2 #1).
   */
  serviceNameHe: string;
  priceContext: unknown;
  receipt: OutsideAppReceiptView | null;
  paymentsInApp: boolean;
  cancellationReason: string | null;
  /** The customer's own rating of this job, once given. */
  ratingGiven: number | null;
  /** Ordered for someone else: who is at home, and the door code once assigned. */
  onSite: { name: string; doorCode: string | null } | null;
  /**
   * The four digits the assigned professional says at the door, issued by
   * the server at assignment for every job. Null before anyone is assigned.
   * The client renders it and never derives it.
   */
  doorCode: string | null;
}

/**
 * `GET /api/v1/on-site/:token`: the page the person at home opens
 * (docs/21 W6). No address, no price, nothing to approve or pay.
 */
export interface OnSiteView {
  ordererNameHe: string;
  onSiteNameHe: string;
  serviceNameHe: string;
  /** For drawing the trade's character when that is the professional's chosen face. */
  serviceCode: string;
  stage: "searching" | "coming" | "at_door" | "inside" | "done" | "cancelled";
  professional: {
    displayName: string;
    /** Their photo, through a short-lived link (D1). */
    photoUrl: string | null;
    portraitKind: "PHOTO" | "CHARACTER" | null;
    /** See ProfessionalSummaryView.addressAs. */
    addressAs: ProAddressAs | null;
    verifications: VerificationBadgeKind[];
  } | null;
  etaSeconds: number | null;
  /** Only once a professional is assigned. */
  doorCode: string | null;
}

/** `GET /api/v1/pro/status`: where the professional stands right now (docs/21 W7). */
/**
 * The professional's earnings for the last seven days (GET /v1/pro/earnings).
 * `paidDirectly`: no money moved through the app (D1) — the amounts are what
 * the jobs came to, and there is no net.
 */
export interface ProEarningsView {
  netMinorUnits: number;
  grossMinorUnits: number | null;
  currency: string;
  jobCount: number;
  breakdown: {
    currency: string;
    periodFromISO: string;
    periodToISO: string;
    periodGrossMinorUnits: number;
    periodNetMinorUnits: number | null;
    periodJobCount: number;
    days: Array<{ dateISO: string; netMinorUnits: number | null; grossMinorUnits: number; jobs: number }>;
    jobs: Array<{
      jobId: string;
      serviceCode: string;
      serviceNameHe: string;
      completedAt: string;
      grossMinorUnits: number;
      deductions: Array<{ code: string; labelHe: string; minorUnits: number }>;
      netMinorUnits: number | null;
    }>;
    awaitingCommissionDecision: boolean;
    paidDirectly: boolean;
    unpricedJobCount: number;
  };
}

/**
 * The professional's profile as customers see it (GET /v1/pro/public-profile,
 * the demo's "ככה הלקוחות רואים אותך"): the same summary a customer's match
 * card gets, the services a customer can be sent them for, and their
 * published reviews — the reviewer named by an initial only.
 */
export interface ProPublicProfileView {
  professional: ProfessionalSummaryView;
  services: Array<{ serviceId: string; serviceCode: string; nameHe: string; basePriceMinorUnits: number | null }>;
  /** The reviewer as "דנה ל׳" — first name and an initial, never the full name (built on the server). */
  reviews: Array<{ id: string; rating: number; text: string | null; createdAt: string; serviceNameHe: string; reviewerLabelHe: string | null }>;
}

export interface ProStatusView {
  displayName: string;
  addressAs: string | null;
  verificationStatus: string;
  presenceState: ProPresenceState;
  shiftId: string | null;
  /** When the open shift started (server time), or null when off shift. */
  shiftStartedAt: string | null;
  /** Jobs closed since the shift started. */
  shiftJobs: number;
  activeJobId: string | null;
  approvedServices: Array<{ id: string; code: string; nameHe: string }>;
  jobsToday: number;
}

/** `GET /api/v1/pro/application`: a professional's application and what it still lacks (docs/21 W7). */
export interface ProApplicationView {
  profile: {
    id: string;
    displayName: string;
    legalName: string;
    addressAs: string | null;
    /** YYYY-MM-DD; null for applications from before 2026-10-02. */
    dateOfBirth: string | null;
    verificationStatus: string;
    /** Trading name (optional) and tax status; null until answered. Entered, not verified. */
    business: { tradingName: string | null; taxStatus: "EXEMPT" | "LICENSED" | "COMPANY" } | null;
    /** Their shop's sign, colour and logo. Null: not designed yet (skippable). */
    shop: { name: string; brandColor: string; logoUploadId: string | null } | null;
    /** Their own photo, or their trade's character. Null: not chosen yet. */
    portrait: { kind: "PHOTO" | "CHARACTER"; uploadId: string | null } | null;
  };
  services: Array<{
    /** The application for this service (what an admin decides on). */
    id: string;
    serviceId: string;
    code: string;
    nameHe: string;
    priceModel: string;
    status: string;
    priced: boolean;
    requirements: Array<{
      requirement: string;
      mandatory: boolean;
      credential: { id: string; status: string; number: string | null } | null;
    }>;
  }>;
  area: { lat: number; lng: number; radiusKm: number } | null;
  documents: Array<{ kind: string; status: string }>;
  /** The current identity check (docs/10). reasonHe: the reviewer's words when a retake was asked for or it was refused. */
  identity: { id: string; status: string; submittedAt: string; reasonHe: string | null } | null;
  /** What stands between this application and review, as codes. Empty: ready. */
  missing: string[];
  submitted: boolean;
}
