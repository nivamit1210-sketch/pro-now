export const MAX_UPLOAD_BYTES = {
  PHOTO: 1_500_000,
  VOICE_NOTE: 1_500_000,
  DOCUMENT: 5_000_000,
  IDENTITY: 3_000_000,
} as const;

export type UploadKind = keyof typeof MAX_UPLOAD_BYTES;

const ALLOWED_MIMES: Record<UploadKind, readonly string[]> = {
  PHOTO: ["image/jpeg", "image/png", "image/webp"],
  VOICE_NOTE: ["audio/mp4", "audio/webm", "audio/ogg"],
  DOCUMENT: ["application/pdf", "image/jpeg", "image/png"],
  IDENTITY: ["image/jpeg", "image/png", "image/webp"],
};

type UploadPolicyFailure = {
  ok: false;
  code: "UPLOAD_KIND_INVALID" | "UPLOAD_MIME_NOT_ALLOWED" | "UPLOAD_TOO_LARGE";
  message: string;
};

type UploadPolicySuccess = { ok: true };

export function validateUploadRequest(input: {
  kind: string;
  mime: string;
  bytes: number;
}): UploadPolicySuccess | UploadPolicyFailure {
  if (!(input.kind in MAX_UPLOAD_BYTES)) {
    return { ok: false, code: "UPLOAD_KIND_INVALID", message: "Unsupported upload kind" };
  }

  const kind = input.kind as UploadKind;
  if (!ALLOWED_MIMES[kind].includes(input.mime.toLowerCase())) {
    return { ok: false, code: "UPLOAD_MIME_NOT_ALLOWED", message: "This file type is not allowed" };
  }
  if (!Number.isInteger(input.bytes) || input.bytes <= 0 || input.bytes > MAX_UPLOAD_BYTES[kind]) {
    return { ok: false, code: "UPLOAD_TOO_LARGE", message: "This file is too large" };
  }
  return { ok: true };
}

export function detectUploadMime(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWithAscii(bytes, "RIFF") && startsWithAscii(bytes.slice(8), "WEBP")) return "image/webp";
  if (startsWithAscii(bytes, "%PDF-")) return "application/pdf";
  if (startsWithAscii(bytes.slice(4), "ftyp")) return "audio/mp4";
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "audio/webm";
  if (startsWithAscii(bytes, "OggS")) return "audio/ogg";
  return null;
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

function startsWithAscii(bytes: Uint8Array, prefix: string): boolean {
  return startsWith(bytes, Array.from(new TextEncoder().encode(prefix)));
}
