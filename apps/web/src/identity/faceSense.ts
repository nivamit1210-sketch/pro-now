/*
 * Face detection on the phone, to take each photo by itself (docs/10).
 * Guidance only: the server never reads its result, and a person reviews
 * the photos.
 *
 * Google's MediaPipe face landmarker, run in the browser from this app's own
 * files (public/face/; the wasm runtime is copied there by
 * scripts/face-runtime.mjs). It is loaded only on the identity screen.
 */
import type { FaceLandmarker, NormalizedLandmark } from "@mediapipe/tasks-vision";

let loading: Promise<FaceLandmarker | null> | null = null;

/** Loads once; resolves null when this device cannot run it (the screen then offers only the shutter). */
export function loadFaceSense(): Promise<FaceLandmarker | null> {
  if (loading) return loading;
  loading = (async () => {
    try {
      const [{ FaceLandmarker }, model] = await Promise.all([
        import("@mediapipe/tasks-vision"),
        fetch("/face/face_landmarker.task").then((r) => {
          if (!r.ok) throw new Error(`model ${r.status}`);
          return r.arrayBuffer();
        }),
      ]);
      return await FaceLandmarker.createFromOptions(
        { wasmLoaderPath: "/face/vision_wasm_internal.js", wasmBinaryPath: "/face/vision_wasm_internal.wasm" },
        { baseOptions: { modelAssetBuffer: new Uint8Array(model), delegate: "CPU" }, runningMode: "VIDEO", numFaces: 1 }
      );
    } catch {
      loading = null;
      return null;
    }
  })();
  return loading;
}

export interface FaceRead {
  /** A face was found. */
  found: boolean;
  /**
   * Which way the head is turned, from the nose's place between the cheeks:
   * about 0 looking straight, ±0.2 and beyond clearly turned. The sign is in
   * the camera's picture, so a mirrored selfie flips it (facePlan.inPosition).
   */
  turn: number;
  /** Rough size of the face in the picture (0–1), to say "come closer". */
  size: number;
}

export function readLandmarks(l: NormalizedLandmark[] | undefined): FaceRead {
  if (!l || l.length < 455) return { found: false, turn: 0, size: 0 };
  const nose = l[1]!, a = l[234]!, b = l[454]!;
  const width = Math.abs(b.x - a.x);
  if (width < 0.01) return { found: false, turn: 0, size: 0 };
  const turn = (nose.x - Math.min(a.x, b.x)) / width - 0.5;
  return { found: true, turn, size: width };
}

export function readVideo(lm: FaceLandmarker, video: HTMLVideoElement, tsMs: number): FaceRead {
  const r = lm.detectForVideo(video, tsMs);
  return readLandmarks(r.faceLandmarks[0]);
}
