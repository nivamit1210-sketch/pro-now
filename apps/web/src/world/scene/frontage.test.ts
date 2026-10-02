import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { FRONT_X, SPAWN, WALK_LIMIT, frontageYaw } from "./street";

/** A filler wall as the scene builds it: 8.8 m bay, 8.5 m high. */
function wall(side: -1 | 1, z = SPAWN.z) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(8.8, 8.5));
  mesh.rotation.y = frontageYaw(side);
  mesh.position.set(side * FRONT_X, 8.5 / 2, z);
  mesh.updateMatrixWorld();
  return mesh;
}

describe("street frontage", () => {
  for (const side of [-1, 1] as const) {
    it(`a wall on side ${side} runs along the street, not across the pavement`, () => {
      const box = new THREE.Box3().setFromObject(wall(side));
      // Flat against the building line...
      expect(box.max.x - box.min.x).toBeLessThan(1e-6);
      expect(Math.abs(box.min.x)).toBeCloseTo(FRONT_X);
      // ...beyond where anyone can walk, and a bay long down the street.
      expect(Math.min(Math.abs(box.min.x), Math.abs(box.max.x))).toBeGreaterThan(WALK_LIMIT);
      expect(box.max.z - box.min.z).toBeCloseTo(8.8);
    });

    it(`a wall on side ${side} faces the road`, () => {
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(wall(side).quaternion);
      expect(normal.x).toBeCloseTo(-side);
      expect(normal.z).toBeCloseTo(0);
    });
  }

  it("leaves the spawn point and the camera behind it in the open", () => {
    const camera = new THREE.Vector3(SPAWN.x * 0.85, 4.5, SPAWN.z + 6.8);
    for (const side of [-1, 1] as const) {
      const box = new THREE.Box3().setFromObject(wall(side));
      expect(Math.abs(camera.x)).toBeLessThan(Math.abs(box.min.x));
      expect(Math.abs(SPAWN.x)).toBeLessThan(Math.abs(box.min.x));
    }
  });
});
