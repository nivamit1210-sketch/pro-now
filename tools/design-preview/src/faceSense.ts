/*
 * FACE SENSING ON THE PHONE ITSELF (Amit, 2026-10-02: "שבאמת תפתח מצלמה…
 * תקלוט את הפנים… למרות שזה סימולטור שירגיש אמיתי").
 *
 * Google's MediaPipe face landmarker, run entirely in the browser: the model
 * and the runtime are files of this demo (public/face/), nothing is sent
 * anywhere, and the pictures never leave the device. It finds a face and
 * says which way the head is turned — that part is real. Matching the face
 * to the ID card stays simulated: the identity-verification vendor is still
 * an open decision (/CLAUDE.md §4).
 *
 * The model is stored as base64 text because the demo's host serves text
 * reliably and an unknown binary type perhaps not.
 */
import type { FaceLandmarker, NormalizedLandmark } from "@mediapipe/tasks-vision";

type Mode = "VIDEO" | "IMAGE";
let loading: Promise<FaceLandmarker | null> | null = null;
let current: Mode | null = null;

function url(p: string): string {
  return new URL(p, typeof window !== "undefined" ? window.location.href : "http://localhost/").toString();
}

/** Loads once; resolves null when this device cannot run it (the screen then says so). */
export function loadFaceSense(): Promise<FaceLandmarker | null> {
  if (loading) return loading;
  loading = (async () => {
    try {
      const [{ FaceLandmarker }, b64] = await Promise.all([
        import("@mediapipe/tasks-vision"),
        fetch(url("./face/face_landmarker.b64.txt")).then((r) => {
          if (!r.ok) throw new Error(`model ${r.status}`);
          return r.text();
        }),
      ]);
      const bin = atob(b64.replace(/\s+/g, ""));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const lm = await FaceLandmarker.createFromOptions(
        { wasmLoaderPath: url("./face/vision_wasm_internal.js"), wasmBinaryPath: url("./face/vision_wasm_internal.wasm") },
        { baseOptions: { modelAssetBuffer: bytes, delegate: "CPU" }, runningMode: "VIDEO", numFaces: 1 }
      );
      current = "VIDEO";
      return lm;
    } catch {
      loading = null;
      return null;
    }
  })();
  return loading;
}

async function mode(lm: FaceLandmarker, m: Mode) {
  if (current === m) return;
  await lm.setOptions({ runningMode: m });
  current = m;
}

export interface FaceRead {
  /** A face was found. */
  found: boolean;
  /**
   * Which way the head is turned, from the nose's place between the cheeks:
   * about 0 looking straight, ±0.2 and beyond clearly turned. The sign is in
   * the camera's picture (a mirrored selfie flips it), so a turn is checked
   * against the previous turn, not against "left" or "right" as words.
   */
  turn: number;
  /** Rough size of the face in the picture (0–1), to say "come closer". */
  size: number;
}

function readLandmarks(l: NormalizedLandmark[] | undefined): FaceRead {
  if (!l || l.length < 455) return { found: false, turn: 0, size: 0 };
  const nose = l[1]!, a = l[234]!, b = l[454]!;
  const width = Math.abs(b.x - a.x);
  if (width < 0.01) return { found: false, turn: 0, size: 0 };
  const turn = (nose.x - Math.min(a.x, b.x)) / width - 0.5;
  return { found: true, turn, size: width };
}

export async function readVideo(lm: FaceLandmarker, video: HTMLVideoElement, tsMs: number): Promise<FaceRead> {
  await mode(lm, "VIDEO");
  const r = lm.detectForVideo(video, tsMs);
  return readLandmarks(r.faceLandmarks[0]);
}

export async function readImage(lm: FaceLandmarker, uri: string): Promise<FaceRead> {
  await mode(lm, "IMAGE");
  const img = new Image();
  img.src = uri;
  await img.decode();
  const r = lm.detect(img);
  return readLandmarks(r.faceLandmarks[0]);
}

export const STRAIGHT = 0.1;
export const TURNED = 0.13;
