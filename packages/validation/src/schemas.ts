import { z } from "zod";

/**
 * Shared request/response validation — enforced at every API boundary
 * server-side (never trust the client), and reused by packages/api-client
 * so mobile/admin get the same shape at compile time.
 * See /docs/06-API-SPEC.md.
 */

export const otpRequestSchema = z.object({
  phone: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/, "phone must be E.164, e.g. +972501234567"),
});

export const otpVerifySchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  code: z.string().length(6),
});

export const createJobSchema = z.object({
  serviceId: z.string().min(1),
  addressId: z.string().min(1),
  description: z.string().max(2000).optional(),
  mediaRefs: z.array(z.string()).max(10).default([]),
  structuredAnswers: z.record(z.string(), z.unknown()).default({}),
});
export type CreateJobInput = z.infer<typeof createJobSchema>;

/**
 * Saving a place to be sent to.
 *
 * `formatted` is what the customer will read back on the job card, so it
 * is required and bounded rather than optional — an address with no text
 * is a pin nobody can check before a professional is dispatched to it.
 *
 * `label` ("בית", "המשרד") is optional because most people have one
 * address and naming it is ceremony.
 */
export const createAddressSchema = z.object({
  formatted: z.string().min(3).max(300),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  label: z.string().max(40).optional(),
  placeId: z.string().max(200).optional(),
});
export type CreateAddressInput = z.infer<typeof createAddressSchema>;

export const uploadKindSchema = z.enum(["PHOTO", "VOICE_NOTE", "DOCUMENT"]);
export const createUploadSchema = z.object({
  kind: uploadKindSchema,
  mime: z.string().trim().min(1).max(120),
  bytes: z.number().int().positive(),
});
export type CreateUploadInput = z.infer<typeof createUploadSchema>;

export const reverseGeocodeQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
export type ReverseGeocodeQuery = z.infer<typeof reverseGeocodeQuerySchema>;

export const searchGeocodeQuerySchema = z.object({
  q: z.string().trim().min(3).max(200),
});
export type SearchGeocodeQuery = z.infer<typeof searchGeocodeQuerySchema>;

export const locationPingSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyMeters: z.number().nonnegative().optional(),
  headingDegrees: z.number().min(0).max(360).optional(),
  speedMetersPerSecond: z.number().nonnegative().optional(),
  capturedAt: z.string().datetime(),
});
export type LocationPingInput = z.infer<typeof locationPingSchema>;

export const startShiftSchema = z.object({
  enabledServiceIds: z.array(z.string()).min(1, "at least one service required to go online"),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type StartShiftInput = z.infer<typeof startShiftSchema>;

export const offerResponseSchema = z.object({
  offerId: z.string().min(1),
});

export const quoteLineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPriceMinorUnits: z.number().int().nonnegative(),
  kind: z.enum(["LABOR", "MATERIALS", "OTHER"]).default("OTHER"),
});

export const createQuoteSchema = z.object({
  lineItems: z.array(quoteLineItemSchema).min(1),
  notes: z.string().max(1000).optional(),
});
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;

export const approveQuoteSchema = z.object({
  quoteId: z.string().min(1),
  quoteVersionHash: z.string().min(1),
});

export const reviewSchema = z.object({
  overallRating: z.number().int().min(1).max(5),
  professionalism: z.number().int().min(1).max(5).optional(),
  punctuality: z.number().int().min(1).max(5).optional(),
  quality: z.number().int().min(1).max(5).optional(),
  text: z.string().max(2000).optional(),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

export const idempotencyKeyHeaderSchema = z.string().min(8).max(200);

// ---------------------------------------------------------------------
// Live availability
// ---------------------------------------------------------------------

/**
 * Response shape for GET /v1/areas/:areaCode/availability.
 *
 * Validated on the CLIENT as well as the server, which is unusual here and
 * deliberate. Everywhere else the rule is "never trust the client"; for
 * availability the matching rule is "never trust a payload just because it
 * came from the server". A malformed count — a float, a negative, a string
 * that happens to parse — would sail through and come out the other side as
 * a confident number on a customer's screen.
 *
 * `.strict()` matters as much as the field types: an unexpected field means
 * the two ends disagree about what this endpoint is, and guessing at that
 * point is how a rename silently becomes a wrong number.
 */
export const supplyStateSchema = z.enum(["AVAILABLE", "LIMITED", "UNAVAILABLE", "UNKNOWN"]);

export const supplyReasonCodeSchema = z.enum([
  "NO_ELIGIBLE_SUPPLY",
  "SERVICE_INACTIVE",
  "LOCATION_UNAVAILABLE",
  "DATA_STALE",
  "NOT_COMPUTED",
]);

export const serviceAvailabilitySchema = z
  .object({
    serviceId: z.string().min(1),
    state: supplyStateSchema,
    // Integer and non-negative: there is no such thing as 1.5 or -2 people.
    // Optional, because UNKNOWN carries no count at all — which is different
    // from carrying a count of zero.
    availableProviderCount: z.number().int().nonnegative().optional(),
    // Positive: a "0 minute" ETA is not a fast professional, it is a bug.
    nearestRouteEtaMinutes: z.number().positive().optional(),
    reasonCode: supplyReasonCodeSchema.optional(),
  })
  .strict()
  .refine((s) => s.state !== "UNKNOWN" || s.availableProviderCount === undefined, {
    message: "UNKNOWN must not carry a count — unknown is not zero",
    path: ["availableProviderCount"],
  })
  .refine((s) => s.state !== "UNAVAILABLE" || (s.availableProviderCount ?? 0) === 0, {
    message: "UNAVAILABLE cannot report available providers",
    path: ["availableProviderCount"],
  })
  .refine((s) => s.state === "AVAILABLE" || s.state === "LIMITED" || s.nearestRouteEtaMinutes === undefined, {
    message: "an ETA without available supply is an ETA to nobody",
    path: ["nearestRouteEtaMinutes"],
  });

export const areaAvailabilitySchema = z
  .object({
    areaLabel: z.string().min(1),
    computedAt: z.string().datetime(),
    // Zero or negative would mean "trust this forever", which is the
    // opposite of what the field is for.
    staleAfterSeconds: z.number().int().positive(),
    services: z.array(serviceAvailabilitySchema),
  })
  .strict();

export type AreaAvailabilityPayload = z.infer<typeof areaAvailabilitySchema>;

/**
 * Parse a payload into something safe to read, or `null`.
 *
 * Returning null rather than throwing is the point: a failed availability
 * fetch must degrade to "we don't know right now", which every screen
 * already renders. Throwing would tempt a caller into a catch block that
 * falls back to the last good value — exactly the stale-number bug this
 * path exists to prevent.
 */
export function parseAreaAvailability(input: unknown): AreaAvailabilityPayload | null {
  const result = areaAvailabilitySchema.safeParse(input);
  return result.success ? result.data : null;
}

/**
 * The customer's first-run answers (docs/21 W2): the intro was seen, and
 * which character they chose, or null for "skipped" (skipping is an answer).
 * The server also checks the id against AVATARS.
 */
export const customerOnboardingSchema = z
  .object({
    introSeen: z.literal(true).optional(),
    avatarId: z.string().min(1).max(40).nullable().optional(),
  })
  .strict();

export type CustomerOnboardingInput = z.infer<typeof customerOnboardingSchema>;

/** What `GET /api/v1/me` answers. */
export interface MeResponse {
  user: { id: string; email: string; name: string };
  roles: string[];
  customer: { introSeen: boolean; avatarId: string | null; avatarAnswered: boolean } | null;
}

/**
 * A crash the web app reports about itself (`POST /api/v1/client-errors`,
 * docs/23-OBSERVABILITY.md). Everything is optional except what an alert
 * cannot do without, and every string is bounded: the endpoint accepts
 * reports from people who are not signed in, so it is an open door and is
 * sized like one.
 */
export const clientErrorReportSchema = z
  .object({
    kind: z.enum(["render", "error", "unhandledrejection"]),
    name: z.string().max(120).default("Error"),
    message: z.string().min(1).max(1000),
    stack: z.string().max(8000).optional(),
    /** The path the person was on, never the query string. */
    path: z.string().max(300).optional(),
    /** Sentry's id for the same event, when the browser reached Sentry. */
    eventId: z.string().regex(/^[0-9a-f]{32}$/).optional(),
    /** The server's requestId of the failed call that led here, if any. */
    requestId: z.string().max(100).optional(),
    release: z.string().max(80).optional(),
  })
  .strict();

export type ClientErrorReport = z.infer<typeof clientErrorReportSchema>;

/** `POST /api/v1/match` (docs/21 W5). */
export const matchRequestSchema = z.object({ text: z.string().trim().min(1).max(500) }).strict();
export type MatchRequestInput = z.infer<typeof matchRequestSchema>;

/**
 * `POST /api/v1/match/feedback`: what was suggested for a sentence, and
 * what the customer chose (null: they chose nothing from the suggestions).
 */
export const matchFeedbackSchema = z
  .object({
    text: z.string().trim().min(1).max(500),
    suggestedServiceIds: z.array(z.string().min(1).max(60)).max(10),
    chosenServiceId: z.string().min(1).max(60).nullable(),
    confidence: z.enum(["high", "medium", "low", "none"]),
  })
  .strict();
export type MatchFeedbackInput = z.infer<typeof matchFeedbackSchema>;
