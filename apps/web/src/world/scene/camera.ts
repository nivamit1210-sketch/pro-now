import * as THREE from "three";

import { SPAWN, type WorldShopPosition } from "./street";

/** Where the camera wants to be and what it wants to look at. */
export interface CameraPose {
  position: THREE.Vector3;
  look: THREE.Vector3;
}

/** Third-person follow: behind and above the player, looking ahead of them. */
export function followPose(target: THREE.Vector3): CameraPose {
  return {
    position: new THREE.Vector3(target.x * 0.85, target.y + 3.6, target.z + 6.8),
    look: new THREE.Vector3(target.x, target.y + 0.8, target.z - 3.5),
  };
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
