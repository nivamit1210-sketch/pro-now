/**
 * The typed REST client for PRO NOW's own API (docs/06, docs/21 W2 decision B).
 *
 * Request bodies are typed by the same zod-inferred types the server parses
 * with (`@pro-now/validation`), and responses by the shared view types, so
 * client and server share one contract at compile time. No OpenAPI codegen
 * yet: that arrives if the native apps or a third party need a published
 * document.
 *
 * Authentication is the session cookie Better Auth sets (httpOnly, never
 * readable here): every call goes with `credentials: "include"` and no
 * token. Same origin in development and in production.
 */
import type {
  AddressView,
  CatalogResponse,
  CustomerJobResponse,
  DispatchResultView,
  GeocodingResult,
  JobMatchView,
  JobView,
  MyJobSummary,
  OnSiteView,
  ProApplicationView,
  ProEarningsView,
  ProPublicProfileView,
  ProServiceEligibilityView,
  ProJobDetailView,
  ProStatusView,
  OfferCardView,
  OutsideAppReceiptView,
  RequestMatch,
  StreetSuggestion,
} from "@pro-now/types";
import type { CreateAddressInput, CustomerOnboardingInput, MatchFeedbackInput, MeResponse, SafetyReportInput } from "@pro-now/validation";

export type UploadKind = "PHOTO" | "VOICE_NOTE" | "DOCUMENT" | "IDENTITY";
export interface UploadRecord {
  id: string;
  status: string;
  [key: string]: unknown;
}

export interface ProNowApiClientConfig {
  /** "" for same origin (the web app); the API's origin otherwise. */
  baseUrl?: string;
  fetch?: typeof fetch;
}

/** A refused call, with the server's machine-readable code. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** The server's id for this request: the key to its log line and error report. */
    readonly requestId?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function createApiClient(config: ProNowApiClientConfig = {}) {
  const base = `${config.baseUrl ?? ""}/api/v1`;
  const doFetch = config.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>
  ): Promise<T> {
    const res = await doFetch(`${base}${path}`, {
      method,
      credentials: "include",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const p = (payload ?? {}) as { code?: unknown; message?: unknown; requestId?: unknown };
      throw new ApiError(
        res.status,
        typeof p.code === "string" ? p.code : "HTTP_" + res.status,
        typeof p.message === "string" ? p.message : `${method} ${path} failed with ${res.status}`,
        typeof p.requestId === "string" ? p.requestId : undefined
      );
    }
    return payload as T;
  }

  return {
    me: () => request<MeResponse>("GET", "/me"),
    saveOnboarding: (input: CustomerOnboardingInput) => request<{ ok: true }>("PATCH", "/me/customer", input),
    getCatalog: () => request<CatalogResponse>("GET", "/catalog"),
    /** The customer's own jobs, newest first (docs/21 W6). */
    listMyJobs: () => request<{ jobs: MyJobSummary[] }>("GET", "/jobs"),
    getJob: (id: string) => request<CustomerJobResponse>("GET", `/jobs/${encodeURIComponent(id)}`),
    /** Who is coming, their ETA and their own price; 409 before anyone is assigned. */
    getJobMatch: (id: string) => request<JobMatchView>("GET", `/jobs/${encodeURIComponent(id)}/match`),
    cancelJob: (id: string) => request<{ ok: true }>("POST", `/jobs/${encodeURIComponent(id)}/cancel`, {}),
    /** The orderer approves the exact version they saw (ordered for someone else); once, whatever the taps. */
    approveQuote: (quoteId: string, quoteVersionHash: string, idempotencyKey: string) =>
      request<{ ok: true }>("POST", `/quotes/${encodeURIComponent(quoteId)}/approve`, { quoteVersionHash }, { "Idempotency-Key": idempotencyKey }),
    confirmCompletion: (id: string) =>
      request<{ ok: true; status: string; receipt?: OutsideAppReceiptView }>(
        "POST",
        `/jobs/${encodeURIComponent(id)}/confirm-completion`,
        {}
      ),
    submitReview: (id: string, input: { overallRating: number; text?: string }) =>
      request<{ review: { id: string } }>("POST", `/jobs/${encodeURIComponent(id)}/reviews`, input),
    /** A fresh link for the person at home; the previous one stops working. */
    mintOnSiteLink: (id: string) =>
      request<{ url: string; expiresAt: string }>("POST", `/jobs/${encodeURIComponent(id)}/on-site-link`, {}),
    /** The page the person at home opens: no account, no address, no price. */
    getOnSite: (token: string) => request<OnSiteView>("GET", `/on-site/${encodeURIComponent(token)}`),
    /** "משהו לא נראה לי תקין" (audit v2 #8b): to a person on the team; the same report again is the first one. */
    reportSafety: (jobId: string, input: SafetyReportInput) =>
      request<{ ticketId: string; receivedHe: string; replayed: boolean }>("POST", `/jobs/${encodeURIComponent(jobId)}/safety-report`, input),
    // --- The professional (docs/21 W7) ---
    proJoin: (input: { displayName: string; legalName: string; addressAs: "M" | "F"; dateOfBirth: string }) =>
      request<ProApplicationView>("POST", "/pro/join", input),
    proApplication: () => request<ProApplicationView>("GET", "/pro/application"),
    proOpenServices: () =>
      request<{ services: Array<{ id: string; code: string; nameHe: string; priceModel: string }> }>("GET", "/pro/services/open"),
    proSetServices: (serviceIds: string[]) => request<ProApplicationView>("PUT", "/pro/application/services", { serviceIds }),
    proSetArea: (input: { lat: number; lng: number; radiusKm: number }) =>
      request<ProApplicationView>("PUT", "/pro/application/area", input),
    proAddDocument: (input: { kind: "TAX_FILE"; uploadId: string }) =>
      request<ProApplicationView>("POST", "/pro/application/documents", input),
    proSubmitIdentity: (input: { documentUploadId: string; selfieUploadIds: [string, string, string] }) =>
      request<ProApplicationView>("POST", "/pro/application/identity", input),
    /** Their car, optional (audit v2 #8a): free text and only the plate's last 2-3 digits. */
    proSetVehicle: (input: { vehicleHe: string | null; plateTail: string | null }) =>
      request<ProApplicationView>("PUT", "/pro/application/vehicle", input),
    proSetBusiness: (input: { tradingName?: string | null; taxStatus: "EXEMPT" | "LICENSED" | "COMPANY" }) =>
      request<ProApplicationView>("PUT", "/pro/application/business", input),
    proSetShop: (input: { name: string; brandColor: string; logoUploadId?: string | null }) =>
      request<ProApplicationView>("PUT", "/pro/application/shop", input),
    proSetPortrait: (input: { kind: "PHOTO"; uploadId: string } | { kind: "CHARACTER" }) =>
      request<ProApplicationView>("PUT", "/pro/application/portrait", input),
    proAddCredential: (input: { serviceId: string; requirement: string; number?: string; uploadId: string }) =>
      request<ProApplicationView>("POST", "/pro/application/credentials", input),
    proSetPricing: (
      serviceId: string,
      input: { basePriceMinorUnits?: number | null; minimumBillableMinutes?: number | null; perKmMinorUnits?: number | null; minimumFareMinorUnits?: number | null }
    ) => request<unknown>("PATCH", `/pro/services/${encodeURIComponent(serviceId)}/pricing`, input),
    proSubmitApplication: () => request<ProApplicationView>("POST", "/pro/application/submit", {}),
    proStatus: () => request<ProStatusView>("GET", "/pro/status"),
    proEarnings: () => request<ProEarningsView>("GET", "/pro/earnings"),
    /** Their profile as customers see it (the profile tab). */
    proPublicProfile: () => request<ProPublicProfileView>("GET", "/pro/public-profile"),
    /** The services they applied for, each with the server's eligibility verdict and their price. */
    proServices: () => request<{ services: ProServiceEligibilityView[] }>("GET", "/pro/services"),
    proStartShift: (input: { lat: number; lng: number; enabledServiceIds: string[] }) =>
      request<{ sessionId: string; presenceState: string }>("POST", "/pro/shifts", input),
    proEndShift: (shiftId: string) => request<{ ok: true }>("POST", `/pro/shifts/${encodeURIComponent(shiftId)}/end`, {}),
    proPing: (input: { lat: number; lng: number; accuracyMeters?: number; capturedAt: string }) =>
      request<{ ok: true }>("POST", "/pro/location", input),
    /** The offer waiting for this professional, or null (an empty answer). */
    proCurrentOffer: async (): Promise<OfferCardView | null> => {
      const res = await doFetch(`${base}/pro/offers/current`, { credentials: "include" });
      if (!res.ok) throw new ApiError(res.status, `HTTP_${res.status}`, "Could not read the current offer");
      const text = await res.text();
      return text ? (JSON.parse(text) as OfferCardView) : null;
    },
    proAcceptOffer: (offerId: string, idempotencyKey: string) =>
      request<{ ok: true; jobId: string }>("POST", `/offers/${encodeURIComponent(offerId)}/accept`, {}, { "Idempotency-Key": idempotencyKey }),
    proSkipOffer: (offerId: string) => request<{ ok: true }>("POST", `/offers/${encodeURIComponent(offerId)}/skip`, {}),
    proJob: (jobId: string) => request<ProJobDetailView>("GET", `/pro/jobs/${encodeURIComponent(jobId)}`),
    proStep: (jobId: string, step: "en-route" | "arrive" | "start" | "complete") =>
      request<{ ok: true; status: string }>("POST", `/jobs/${encodeURIComponent(jobId)}/${step}`, {}),
    proSendQuote: (jobId: string, input: { lineItems: Array<{ description: string; quantity: number; unitPriceMinorUnits: number; kind: string }>; notes?: string; mediaRefs?: string[] }) =>
      request<{ quote: { id: string }; autoApproved?: boolean }>("POST", `/jobs/${encodeURIComponent(jobId)}/quotes`, input),
    // --- The admin (docs/21 W8). The server enforces ADMIN on every one. ---
    admin: {
      applications: () => request<{ applications: Array<ProApplicationView & { returned: boolean }> }>("GET", "/admin/pro-applications"),
      professional: (id: string) => request<AdminProfessionalView>("GET", `/admin/professionals/${encodeURIComponent(id)}`),
      /** Marks an item for fixing (a draft until the round is sent). */
      markFix: (professionalId: string, input: { itemKey: string; reasonHe: string }) =>
        request<{ id: string }>("POST", `/admin/professionals/${encodeURIComponent(professionalId)}/fix-requests`, input),
      /** The 204 has no body; `request` reads an empty one as null. */
      cancelFix: async (fixRequestId: string): Promise<void> => {
        await request<null>("DELETE", `/admin/fix-requests/${encodeURIComponent(fixRequestId)}`);
      },
      sendRound: (professionalId: string) =>
        request<{ roundId: string; count: number }>("POST", `/admin/professionals/${encodeURIComponent(professionalId)}/review-round/send`, {}),
      correctIdentityDetails: (id: string, input: { legalName?: string; dateOfBirth?: string; reason: string }) =>
        request<ProApplicationView>("PATCH", `/admin/professionals/${encodeURIComponent(id)}/identity-details`, input),
      decideAccount: (id: string, input: AdminDecision) => request<ProApplicationView>("POST", `/admin/professionals/${encodeURIComponent(id)}/decision`, input),
      decideIdentity: (id: string, input: { action: "APPROVE" | "REJECT"; reason?: string }) =>
        request<ProApplicationView>("POST", `/admin/identity/${encodeURIComponent(id)}/decision`, input),
      decideCredential: (id: string, input: AdminDecision) => request<ProApplicationView>("POST", `/admin/credentials/${encodeURIComponent(id)}/decision`, input),
      decideService: (id: string, input: AdminDecision) => request<ProApplicationView>("POST", `/admin/pro-services/${encodeURIComponent(id)}/decision`, input),
      jobs: (status?: string) => request<{ jobs: AdminJobRow[] }>("GET", `/admin/jobs${status ? `?status=${encodeURIComponent(status)}` : ""}`),
      job: (id: string) => request<AdminJobDetail>("GET", `/admin/jobs/${encodeURIComponent(id)}`),
      users: (q?: string) => request<{ users: AdminUserRow[] }>("GET", `/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`),
      changeRole: (id: string, input: { role: "CUSTOMER" | "PROFESSIONAL"; grant: boolean; reason: string }) =>
        request<{ roles: string[] }>("POST", `/admin/users/${encodeURIComponent(id)}/roles`, input),
      market: () => request<{ activations: AdminActivationRow[] }>("GET", "/admin/market"),
      changeMarket: (id: string, input: { customerVisible?: boolean; providerOnboardingEnabled?: boolean; dispatchEnabled?: boolean; reason: string }) =>
        request<AdminActivationRow>("PATCH", `/admin/market/${encodeURIComponent(id)}`, input),
      credentialExpiry: () =>
        request<{ expiring: AdminCredentialRow[]; expired: AdminCredentialRow[]; undated: AdminCredentialRow[] }>("GET", "/admin/credentials/expiry"),
      credentialRenewals: () => request<{ renewals: AdminCredentialRenewalRow[] }>("GET", "/admin/credentials/renewals"),
      matchFeedback: () => request<{ feedback: AdminFeedbackRow[] }>("GET", "/admin/match-feedback"),
      usage: () => request<AdminUsageView>("GET", "/admin/usage"),
      supportTickets: (status: "OPEN" | "HANDLED" = "OPEN") =>
        request<{ open: number; tickets: AdminSupportTicketRow[] }>("GET", `/admin/support-tickets?status=${status}`),
      ticketHandled: (id: string, input: { reason: string }) =>
        request<{ id: string; status: string; handledAt: string }>("POST", `/admin/support-tickets/${encodeURIComponent(id)}/handled`, input),
    },
    // --- Notifications (docs/21 W9) ---
    inbox: () =>
      request<{ unread: number; notifications: Array<{ id: string; type: string; title: string; body: string; url: string | null; read: boolean; at: string }> }>(
        "GET",
        "/me/notifications"
      ),
    markInboxRead: () => request<{ read: number }>("POST", "/me/notifications/read", {}),
    pushPublicKey: () => request<{ publicKey: string | null }>("GET", "/push/public-key"),
    savePushSubscription: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
      request<{ ok: true }>("POST", "/me/push-subscriptions", sub),
    /** Which services a typed sentence could be (docs/21 W5). */
    matchRequest: (text: string) => request<RequestMatch & { classifier: string }>("POST", "/match", { text }),
    /** What was suggested for a sentence, and what the customer chose. */
    sendMatchFeedback: (input: MatchFeedbackInput) => request<void>("POST", "/match/feedback", input),
    getAddresses: () => request<{ addresses: AddressView[] }>("GET", "/me/addresses"),
    createAddress: (input: CreateAddressInput) => request<{ address: AddressView }>("POST", "/me/addresses", input),
    /** Takes a saved address off my list (audit v2 #4); a job that used it keeps it ("archived"). */
    deleteAddress: (id: string) => request<{ removed: "deleted" | "archived" }>("DELETE", `/me/addresses/${encodeURIComponent(id)}`),
    suggestStreets: (query: string) =>
      request<{ suggestions: StreetSuggestion[] }>("GET", `/geo/streets?q=${encodeURIComponent(query)}`),
    searchAddresses: (query: string) => request<{ results: GeocodingResult[] }>("GET", `/geo/search?q=${encodeURIComponent(query)}`),
    reverseGeocode: (location: { lat: number; lng: number }) =>
      request<{ result: GeocodingResult | null }>("GET", `/geo/reverse?lat=${location.lat}&lng=${location.lng}`),
    createJob: (
      input: {
        serviceId: string;
        /** The catalogue service picked ("svc-clean"): its name is the one shown after ordering. */
        catalogServiceId?: string;
        addressId: string;
        description?: string;
        structuredAnswers?: Record<string, unknown>;
        mediaRefs?: string[];
        /** The person at home, when ordering for someone else (docs/21 W6). */
        onSite?: { name: string; phone: string };
      },
      idempotencyKey: string
    ) =>
      request<{ job: JobView; dispatch: DispatchResultView }>("POST", "/jobs", input, {
        "Idempotency-Key": idempotencyKey,
      }),
    uploadMedia: async (input: {
      kind: UploadKind;
      mime: string;
      body: Blob | ArrayBuffer;
    }): Promise<{ upload: UploadRecord }> => {
      const bytes =
        typeof Blob !== "undefined" && input.body instanceof Blob
          ? input.body.size
          : (input.body as ArrayBuffer).byteLength;
      const prepared = await request<{
        upload: UploadRecord;
        uploadUrl: string;
      }>("POST", "/uploads", { kind: input.kind, mime: input.mime, bytes });

      /*
       * Straight to storage, WITHOUT credentials. The signed URL is the
       * authorisation; our session cookie must never travel to another
       * host, and storage (correctly) refuses a credentialed cross-origin
       * request, which failed every browser upload until W7 (QA #1).
       */
      const putResponse = await doFetch(prepared.uploadUrl, {
        method: "PUT",
        credentials: "omit",
        headers: { "Content-Type": input.mime },
        body: input.body,
      });
      if (!putResponse.ok) {
        throw new ApiError(putResponse.status, "STORAGE_UPLOAD_FAILED", "The file could not be uploaded");
      }
      return request<{ upload: UploadRecord }>("POST", `/uploads/${prepared.upload.id}/complete`);
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

// --- Admin views (docs/21 W8), as the server sends them ---
export interface AdminDecision {
  approve: boolean;
  reason?: string;
  expiresAt?: string;
  noExpiry?: boolean;
}
export interface AdminProfessionalView {
  application: ProApplicationView;
  /** The review loop: marks not yet sent, the latest sent round, older ones, and items changed since the send (or, before any round, since the submission). */
  review: {
    draft: Array<{ id: string; itemKey: string; reasonHe: string }>;
    current: { roundId: string; status: "SENT" | "ANSWERED" | "CLOSED"; sentAt: string; requests: Array<{ id: string; itemKey: string; reasonHe: string; status: "OPEN" | "FIXED" | "CANCELLED"; fixedAt: string | null }> } | null;
    earlier: Array<{ roundId: string; sentAt: string; requests: Array<{ itemKey: string; reasonHe: string; status: string }> }>;
    changedItemKeys: string[];
  };
  identity: {
    id: string; status: string; vendorName: string; isSandbox: boolean; method: string | null;
    submittedAt: string; decidedAt: string | null; decisionReason: string | null;
    photos: { idCard: string | null; straight: string | null; right: string | null; left: string | null };
    declared: { legalName: string; dateOfBirth: string | null };
    provider: { nameMatch: boolean | null; livenessPassed: boolean | null; documentValid: boolean | null; reasonCodes: string[] };
  } | null;
  /** The last 30 days of edits by the professional or by staff, newest first (at most 50). */
  recentChanges: Array<{ at: string; action: string; itemKey: string | null; byStaff: boolean }>;
  email: string;
  joinedAt: string;
  documents: Array<{ id: string; kind: string; status: string; mime: string | null; url: string | null }>;
  /** The face they chose while joining; `url` is a short-lived link to their photo. */
  portrait: { kind: "PHOTO" | "CHARACTER"; mime: string | null; url: string | null } | null;
  credentials: Array<{ id: string; serviceNameHe: string; type: string; number: string | null; status: string; expiresAt: string | null; noExpiry: boolean; mime: string | null; url: string | null }>;
}
export interface AdminJobRow { id: string; status: string; serviceNameHe: string; professional: string | null; createdAt: string; updatedAt: string }
export interface AdminJobDetail {
  id: string;
  status: string;
  service: { nameHe: string; code: string; priceModel: string };
  address: string | null;
  description: string | null;
  customer: { name: string | null; email: string };
  professional: { id: string; displayName: string } | null;
  onSite: { name: string } | null;
  createdAt: string;
  events: Array<{ at: string; type: string; actor: string; metadata: unknown }>;
  offers: Array<{ at: string; professional: string; status: string; etaSeconds: number | null }>;
  quotes: Array<{ version: number; status: string; totalMinorUnits: number; lines: number }>;
  review: { overallRating: number; text: string | null } | null;
}
export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  roles: string[];
  deleted: boolean;
  professional: { id: string; verificationStatus: string } | null;
  createdAt: string;
}
export interface AdminActivationRow {
  id: string;
  marketCode?: string;
  service?: { code: string; nameHe: string };
  customerVisible: boolean;
  providerOnboardingEnabled: boolean;
  dispatchEnabled: boolean;
}
export interface AdminCredentialRow { credentialId: string; professionalId: string; displayName: string; serviceNameHe: string; type: string; expiresAt: string | null }
export interface AdminCredentialRenewalRow { credentialId: string; professionalId: string; displayName: string; serviceNameHe: string; type: string; replacesExpiresAt: string | null }
export interface AdminFeedbackRow { id: string; text: string; suggested: string[]; chosen: string | null; confidence: string; missed: boolean; at: string }
export interface AdminUsageView {
  users: number;
  professionals: Record<string, number>;
  jobs: Record<string, number>;
  storage: { bytes: number; files: number; limitBytes: number | null };
  database: { bytes: number; limitBytes: number | null };
}
/** A report or request for help (audit v2 #8b): who, about which visit and professional, and why. */
export interface AdminSupportTicketRow {
  id: string;
  kind: string;
  status: string;
  subject: string;
  reason: string | null;
  reasonHe: string | null;
  noteHe: string | null;
  createdAt: string;
  handledAt: string | null;
  job: { id: string; serviceNameHe: string; statusAtReport: string | null; statusNow: string } | null;
  reporter: { name: string | null; email: string } | null;
  professional: { id: string; displayName: string } | null;
}
