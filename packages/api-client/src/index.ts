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
  OutsideAppReceiptView,
  RequestMatch,
} from "@pro-now/types";
import type { CreateAddressInput, CustomerOnboardingInput, MatchFeedbackInput, MeResponse } from "@pro-now/validation";

export type UploadKind = "PHOTO" | "VOICE_NOTE" | "DOCUMENT";
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
    confirmCompletion: (id: string) =>
      request<{ ok: true; status: string; receipt?: OutsideAppReceiptView }>(
        "POST",
        `/jobs/${encodeURIComponent(id)}/confirm-completion`,
        {}
      ),
    submitReview: (id: string, input: { overallRating: number; text?: string }) =>
      request<{ review: { id: string } }>("POST", `/jobs/${encodeURIComponent(id)}/reviews`, input),
    /** Which services a typed sentence could be (docs/21 W5). */
    matchRequest: (text: string) => request<RequestMatch & { classifier: string }>("POST", "/match", { text }),
    /** What was suggested for a sentence, and what the customer chose. */
    sendMatchFeedback: (input: MatchFeedbackInput) => request<void>("POST", "/match/feedback", input),
    getAddresses: () => request<{ addresses: AddressView[] }>("GET", "/me/addresses"),
    createAddress: (input: CreateAddressInput) => request<{ address: AddressView }>("POST", "/me/addresses", input),
    searchAddresses: (query: string) => request<{ results: GeocodingResult[] }>("GET", `/geo/search?q=${encodeURIComponent(query)}`),
    reverseGeocode: (location: { lat: number; lng: number }) =>
      request<{ result: GeocodingResult | null }>("GET", `/geo/reverse?lat=${location.lat}&lng=${location.lng}`),
    createJob: (
      input: {
        serviceId: string;
        addressId: string;
        description?: string;
        structuredAnswers?: Record<string, unknown>;
        mediaRefs?: string[];
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

      const putResponse = await doFetch(prepared.uploadUrl, {
        method: "PUT",
        credentials: "include",
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
