/**
 * Which way the face should be, and whether a live camera exists (docs/10
 * §Identity check in the app). Guidance only: nothing here is sent to the
 * server or trusted by it.
 */
export type FacePosition = "straight" | "right" | "left";
export const FACE_POSITIONS: readonly FacePosition[] = ["straight", "right", "left"];
export const STRAIGHT = 0.1;
export const TURNED = 0.13;

/** `turn`: the nose's offset between the cheeks in the picture (faceSense). A mirrored selfie flips it. */
export function inPosition(position: FacePosition, turn: number, mirrored: boolean): boolean {
  const t = mirrored ? -turn : turn;
  if (position === "straight") return Math.abs(turn) < STRAIGHT;
  return position === "right" ? t > TURNED : t < -TURNED;
}

/** "live" when the front camera opens (it is closed again at once); otherwise the phone's camera app. */
export async function cameraMode(probe: () => Promise<MediaStream>): Promise<"live" | "picker"> {
  try {
    const stream = await probe();
    stream.getTracks().forEach((t) => t.stop());
    return "live";
  } catch {
    return "picker";
  }
}
