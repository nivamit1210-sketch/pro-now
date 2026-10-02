import Constants from "expo-constants";
import * as FileSystem from "expo-file-system";
import type {
  AddressView,
  CatalogResponse,
  DispatchResultView,
  JobMatchView,
  JobView,
  ReviewView,
} from "@pro-now/types";

/**
 * Thin typed fetch wrapper — see /docs/06-API-SPEC.md. A fuller generated
 * client lives in packages/api-client once the OpenAPI contract is
 * authored (Epic 6+); this hand-written version covers the endpoints this
 * app's signature screens need today.
 */
const BASE_URL = (Constants.expoConfig?.extra?.apiBaseUrl as string) ?? "http://localhost:4000";

let sessionToken: string | null = null;
export function setSessionToken(token: string | null) {
  sessionToken = token;
}


/**
 * AN ERROR THAT SAYS WHETHER THE SERVER ANSWERED.
 *
 * Every failure used to arrive as a bare `Error`, so a caller could not
 * tell "the server refused this" from "the request never got there" — and
 * on the professional's accept those are opposite facts. A refusal means
 * somebody else took the job. A transport failure means we do not know
 * whether it was taken, and quietly returning them to the shift screen
 * leaves them waiting for offers while a customer waits for them.
 *
 * `code` is the server's own error code when there was a response, and
 * null when there was not.
 */
export class ApiError extends Error {
  readonly code: string | null;
  readonly status: number | null;
  constructor(message: string, code: string | null, status: number | null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
  /** True when nothing came back — the outcome is genuinely unknown. */
  get unreachable(): boolean {
    return this.status === null;
  }
}

/**
 * The API's error envelope is `{ code, message }` (/docs/06-API-SPEC.md),
 * but a failed request can also return a proxy's HTML or nothing at all —
 * so the body is narrowed rather than trusted.
 */
function serverMessage(body: unknown): string | undefined {
  if (typeof body === "object" && body !== null && "message" in body) {
    const { message } = body as { message: unknown };
    if (typeof message === "string") return message;
  }
  return undefined;
}

function serverCode(body: unknown): string | null {
  if (typeof body === "object" && body !== null && "code" in body) {
    const { code } = body as { code: unknown };
    if (typeof code === "string") return code;
  }
  return null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;

  /*
   * The transport failure is caught SEPARATELY from the refusal, because
   * they are different facts and the caller needs to tell them apart.
   */
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  } catch (err) {
    throw new ApiError(
      err instanceof Error ? err.message : `Could not reach ${path}`,
      null,
      null
    );
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      serverMessage(body) ?? `Request to ${path} failed with ${res.status}`,
      serverCode(body),
      res.status
    );
  }
  return body as T;
}

export const api = {
  requestOtp: (phone: string) => request<{ ok: boolean; sandboxHint?: string }>("/v1/auth/otp/request", { method: "POST", body: JSON.stringify({ phone }) }),
  verifyOtp: (phone: string, code: string) => request<{ token: string; userId: string }>("/v1/auth/otp/verify", { method: "POST", body: JSON.stringify({ phone, code }) }),
  getCatalog: () => request<CatalogResponse>("/v1/catalog"),
  /*
   * The customer's saved places. Until these existed, `POST /v1/jobs`
   * could not succeed for anybody who was not in the seed data — it
   * requires an `addressId` and nothing in the API could make one.
   */
  getAddresses: () => request<{ addresses: AddressView[] }>("/v1/me/addresses"),
  /** A street from the official list, or the device's own location (packages/validation createAddressSchema). */
  createAddress: (
    input:
      | { kind: "street"; localityCode: number; streetCode: number; houseNumber?: string; details?: string; label?: string }
      | { kind: "location"; lat: number; lng: number; details?: string; label?: string }
  ) =>
    request<{ address: AddressView }>("/v1/me/addresses", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createJob: (
    input: {
      serviceId: string;
      /** The catalogue service picked ("svc-leak"): its name is the one shown after ordering. */
      catalogServiceId?: string;
      addressId: string;
      description?: string;
      /** The intake answers, keyed by question id. See AddressScreen. */
      structuredAnswers?: Record<string, unknown>;
      mediaRefs?: string[];
    },
    idempotencyKey: string
  ) =>
    request<{ job: JobView; dispatch: DispatchResultView }>("/v1/jobs", { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify(input) }),
  uploadMedia: async (input: { kind: "PHOTO" | "VOICE_NOTE"; mime: string; uri: string }) => {
    const info = await FileSystem.getInfoAsync(input.uri, { size: true });
    if (!info.exists || typeof info.size !== "number") {
      throw new ApiError("The captured file is no longer available", "UPLOAD_FILE_NOT_FOUND", null);
    }

    const prepared = await request<{
      upload: { id: string };
      uploadUrl: string;
    }>("/v1/uploads", {
      method: "POST",
      body: JSON.stringify({ kind: input.kind, mime: input.mime, bytes: info.size }),
    });
    const uploaded = await FileSystem.uploadAsync(prepared.uploadUrl, input.uri, {
      httpMethod: "PUT",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { "Content-Type": input.mime },
    });
    if (uploaded.status < 200 || uploaded.status >= 300) {
      throw new ApiError("The captured file could not be uploaded", "STORAGE_UPLOAD_FAILED", uploaded.status);
    }
    return request<{ upload: { id: string; status: string } }>(`/v1/uploads/${prepared.upload.id}/complete`, {
      method: "POST",
    });
  },
  getJob: (id: string) => request<{ job: JobView }>(`/v1/jobs/${id}`),
  /*
   * Stopping the request. The searching screen offered "ביטול הבקשה" and
   * then only navigated away — the job stayed SEARCHING on the server and
   * a professional could still be dispatched to somebody who believed
   * they had cancelled.
   */
  cancelJob: (id: string) => request<{ ok: boolean }>(`/v1/jobs/${id}/cancel`, { method: "POST" }),
  /** Everything the match card renders — see /docs/06-API-SPEC.md. */
  getMatch: (jobId: string) => request<JobMatchView>(`/v1/jobs/${jobId}/match`),
  approveQuote: (quoteId: string, quoteVersionHash: string, idempotencyKey: string) =>
    request<{ ok: boolean }>(`/v1/quotes/${quoteId}/approve`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ quoteVersionHash }) }),
  submitReview: (jobId: string, input: { overallRating: number; text?: string }) =>
    request<{ review: ReviewView }>(`/v1/jobs/${jobId}/reviews`, { method: "POST", body: JSON.stringify(input) }),
};
