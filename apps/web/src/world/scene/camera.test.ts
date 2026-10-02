import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  DESCENT_SECONDS,
  ENTRY_WIDE,
  easeTowards,
  entryPose,
  followCharacter,
  followFactor,
  followPose,
  frameShop,
  shopPose,
  smoothstep01,
} from "./camera";
import { KERB_X, PAVEMENT, SPAWN, WORLD_SHOPS } from "./street";

const lookDirection = (camera: THREE.Camera) => camera.getWorldDirection(new THREE.Vector3());

describe("world camera", () => {
  const home = WORLD_SHOPS.find((shop) => shop.shopId === "home")!;
  const player = new THREE.Vector3(SPAWN.x, 0.9, SPAWN.z);

  it("follows off the kerb, clear of the lamp and tree lines, aimed at the walker", () => {
    const lampX = KERB_X + PAVEMENT * 0.35;
    const treeEdgeX = KERB_X + PAVEMENT * 0.7 - 1.8;
    for (const x of [SPAWN.x, -SPAWN.x, -7.5, 7.5]) {
      const pose = followPose(new THREE.Vector3(x, 0.9, 40));
      expect(Math.abs(pose.position.x)).toBeLessThan(lampX - 1);
      expect(Math.abs(pose.position.x)).toBeLessThan(treeEdgeX - 1);
      expect(Math.sign(pose.position.x)).toBe(Math.sign(x));
      expect(pose.look.x).toBe(x);
    }
    // On the road it is straight behind.
    expect(followPose(new THREE.Vector3(1, 0.9, 40)).position.x).toBe(1);
  });

  it("pulls back and rises near a shop, looking at its facade", () => {
    const follow = followPose(player);
    const shop = shopPose(player, home);
    expect(shop.position.y).toBeGreaterThan(follow.position.y);
    expect(shop.position.z - player.z).toBeGreaterThan(follow.position.z - player.z);
    expect(shop.look.z).toBe(home.z);
    // It looks towards the shop's side of the street.
    expect(Math.sign(shop.look.x)).toBe(Math.sign(home.x));
  });

  it("jumps straight to the pose with reduced motion", () => {
    const camera = new THREE.PerspectiveCamera();
    frameShop(camera, player, home, true);
    const pose = shopPose(player, home);
    expect(camera.position.distanceTo(pose.position)).toBeCloseTo(0);
    const expected = pose.look.clone().sub(pose.position).normalize();
    expect(lookDirection(camera).distanceTo(expected)).toBeCloseTo(0);
  });

  it("turns towards a shop over several frames instead of snapping", () => {
    const camera = new THREE.PerspectiveCamera();
    followCharacter(camera, player, true);
    const before = lookDirection(camera);
    const target = shopPose(player, home);
    const finalDirection = target.look.clone().sub(target.position).normalize();

    easeTowards(camera, target, 0.05, false);
    const firstStep = lookDirection(camera);
    const turned = before.angleTo(firstStep);
    const total = before.angleTo(finalDirection);
    expect(turned).toBeGreaterThan(0);
    expect(turned).toBeLessThan(total * 0.25);

    for (let i = 0; i < 200; i++) easeTowards(camera, target, 0.05, false);
    expect(lookDirection(camera).angleTo(finalDirection)).toBeLessThan(0.01);
  });
});

describe("the demo's camera", () => {
  const player = new THREE.Vector3(SPAWN.x, 0.9, SPAWN.z);

  it("walks 6.98 m behind, 3.5 m up, looking 10.8 m down the street", () => {
    const pose = followPose(player);
    expect(pose.position.x).toBeCloseTo(-(KERB_X + 0.6)); // off the kerb, see cameraLineX
    expect(pose.position.z - player.z).toBeCloseTo(6.98);
    expect(pose.position.y).toBeCloseTo(3.503);
    expect(player.z - pose.look.z).toBeCloseTo(10.819);
    expect(pose.look.y).toBeCloseTo(2.217);
    // Looking down the street, slightly downwards: about 4° below level.
    const dir = pose.look.clone().sub(pose.position);
    const pitch = Math.atan2(-dir.y, Math.hypot(dir.x, dir.z));
    expect(pitch * (180 / Math.PI)).toBeCloseTo(4.0, 0);
  });

  it("opens high over the street and lands exactly on the walking view", () => {
    const ground = followPose(player);
    const top = entryPose(player, 0, ground);
    expect(top.position.y).toBe(ENTRY_WIDE.hgt);
    expect(top.position.z - player.z).toBe(ENTRY_WIDE.dist);
    const landed = entryPose(player, 1, ground);
    expect(landed.position.distanceTo(ground.position)).toBe(0);
    expect(landed.look.distanceTo(ground.look)).toBe(0);
    const half = entryPose(player, 0.5, ground);
    expect(half.position.y).toBeCloseTo((ENTRY_WIDE.hgt + ground.position.y) / 2);
  });

  it("eases the drop in and out over 1.9 s", () => {
    expect(DESCENT_SECONDS).toBe(1.9);
    expect(smoothstep01(0)).toBe(0);
    expect(smoothstep01(1)).toBe(1);
    expect(smoothstep01(0.5)).toBe(0.5);
    expect(smoothstep01(0.1)).toBeLessThan(0.1); // slow start
    expect(smoothstep01(0.9)).toBeGreaterThan(0.9); // slow finish
    expect(smoothstep01(-1)).toBe(0);
    expect(smoothstep01(2)).toBe(1);
  });

  it("follows at the same pace whatever the frame rate", () => {
    const oneStep = followFactor(0.1);
    const twoSteps = 1 - (1 - followFactor(0.05)) ** 2;
    expect(twoSteps).toBeCloseTo(oneStep);
    expect(followFactor(0)).toBe(0);
    expect(followFactor(1 / 60)).toBeCloseTo(0.098, 2);
  });
});
