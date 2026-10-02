import * as THREE from "three";

import { KERB_X, SPAWN, type WorldShopPosition } from "./street";

/** Where the camera wants to be and what it wants to look at. */
export interface CameraPose {
  position: THREE.Vector3;
  look: THREE.Vector3;
}

/**
 * The demo's third-person camera (City.tsx), walking down the street:
 * 6.98 m straight behind the walker, height and aim proportional to that
 * distance (1.2 + 0.33·d up, 1.55·d ahead at 1.1 + 0.16·d), so the figure
 * sits low in the frame with the street opening out ahead of it.
 */
export const FOLLOW_DISTANCE = 6.2 + 0.26 * 3.0;

/**
 * The line the following camera rides. The walker is on the pavement, and
 * straight behind them the camera would fly through the lamps and the
 * trees (billboards that turn to face it and fill the screen). So it stays
 * just off the kerb, clear of every pavement prop, still aimed at the walker.
 */
export const CAMERA_LINE_X = KERB_X + 0.6;

export function cameraLineX(x: number): number {
  return Math.sign(x) * Math.min(Math.abs(x), CAMERA_LINE_X);
}

export function followPose(target: THREE.Vector3): CameraPose {
  const d = FOLLOW_DISTANCE;
  return {
    position: new THREE.Vector3(cameraLineX(target.x), 1.2 + d * 0.33, target.z + d),
    look: new THREE.Vector3(target.x, 1.1 + d * 0.16, target.z - d * 1.55),
  };
}

/**
 * THE ENTRY: high over the street, then down behind the walker.
 *
 * As in the demo, the world opens 38 m back and 26 m up, looking down the
 * lit street, and the first move flies the camera down into the walking
 * view over 1.9 s. `k` is the eased progress, 0 up there and 1 down here.
 */
export const ENTRY_WIDE = { dist: 38, hgt: 26 } as const;
export const DESCENT_SECONDS = 1.9;

/** Ease in and out, so the drop neither starts nor stops with a jolt. */
export function smoothstep01(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

export function entryPose(target: THREE.Vector3, k: number, ground: CameraPose): CameraPose {
  const wide: CameraPose = {
    position: new THREE.Vector3(target.x, ENTRY_WIDE.hgt, target.z + ENTRY_WIDE.dist),
    look: new THREE.Vector3(target.x, 2.6, target.z - ENTRY_WIDE.dist * 1.55 * 0.45),
  };
  if (k <= 0) return wide;
  if (k >= 1) return ground;
  return {
    position: wide.position.lerp(ground.position, k),
    look: wide.look.lerp(ground.look, k),
  };
}

/** The demo's easing towards the pose, by time rather than by frame. */
export function followFactor(dtSeconds: number): number {
  return 1 - Math.pow(0.002, Math.max(0, dtSeconds));
}

/**
 * Near a shop the camera rises and pulls back to show the facade, the
 * demo's "stand at shop" framing.
 */
export function shopPose(playerPos: THREE.Vector3, shop: WorldShopPosition): CameraPose {
  const pullBack = 8.5;
  const height = 4.8;
  const midX = (playerPos.x + shop.x) * 0.35;
  return {
    position: new THREE.Vector3(midX - shop.side * pullBack * 0.3, playerPos.y + height, playerPos.z + pullBack),
    look: new THREE.Vector3(shop.x * 0.7, 2.2, shop.z),
  };
}

// The point each camera is looking at, eased like its position so that moving
// in and out of a shop's range turns the view instead of snapping it.
const lookTargets = new WeakMap<THREE.Camera, THREE.Vector3>();

/**
 * Move the camera a step towards a pose. Reduced motion jumps straight there.
 * The look target eases at the same rate as the position.
 */
export function easeTowards(
  camera: THREE.PerspectiveCamera,
  pose: CameraPose,
  factor: number,
  reducedMotion: boolean,
): void {
  const step = reducedMotion ? 1 : factor;
  camera.position.lerp(pose.position, step);
  let look = lookTargets.get(camera);
  if (!look) {
    look = pose.look.clone();
    lookTargets.set(camera, look);
  } else {
    look.lerp(pose.look, step);
  }
  camera.lookAt(look);
}

/** Look straight at a point and remember it, for views that do not ease. */
function lookAtNow(camera: THREE.PerspectiveCamera, x: number, y: number, z: number): void {
  const look = lookTargets.get(camera) ?? new THREE.Vector3();
  look.set(x, y, z);
  lookTargets.set(camera, look);
  camera.lookAt(look);
}

export function followCharacter(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  reducedMotion: boolean,
): void {
  easeTowards(camera, followPose(target), 0.08, reducedMotion);
}

/**
 * Aerial overview of the street (for SEARCH, AMBIENT, FALLBACK modes).
 */
export function frameStreet(
  camera: THREE.PerspectiveCamera,
  reducedMotion: boolean,
): void {
  const desired = new THREE.Vector3(0, 28, SPAWN.z + 30);
  if (reducedMotion) camera.position.copy(desired);
  else camera.position.lerp(desired, 0.04);
  lookAtNow(camera, 0, 0, SPAWN.z - 40);
}

/**
 * Camera position inside a shop room.
 */
export function followInsideShop(
  camera: THREE.PerspectiveCamera,
  reducedMotion: boolean,
): void {
  const desired = new THREE.Vector3(0, 1.8, 3.2);
  const lerpFactor = reducedMotion ? 1 : 0.06;
  camera.position.lerp(desired, lerpFactor);
  lookAtNow(camera, 0, 1.6, -1.5);
}

export function frameShop(
  camera: THREE.PerspectiveCamera,
  playerPos: THREE.Vector3,
  shop: WorldShopPosition,
  reducedMotion: boolean,
): void {
  easeTowards(camera, shopPose(playerPos, shop), 0.05, reducedMotion);
}
