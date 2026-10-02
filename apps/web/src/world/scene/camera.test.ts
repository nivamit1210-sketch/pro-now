import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { easeTowards, followCharacter, followPose, frameShop, shopPose } from "./camera";
import { SPAWN, WORLD_SHOPS } from "./street";

const lookDirection = (camera: THREE.Camera) => camera.getWorldDirection(new THREE.Vector3());

describe("world camera", () => {
  const home = WORLD_SHOPS.find((shop) => shop.shopId === "home")!;
  const player = new THREE.Vector3(SPAWN.x, 0.9, SPAWN.z);

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
