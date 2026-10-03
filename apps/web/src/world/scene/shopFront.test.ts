import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BLADE, FACADE_BAND, FACADE_OUT, SHOP_BAY, createShopFront, facadeSize, signFacing } from "./shopFront";
import { frontageYaw } from "./street";

describe("a shopfront's size", () => {
  it("keeps a square drawing square: a bay wide and a bay tall", () => {
    const { w, h } = facadeSize(1);
    expect(w).toBeCloseTo(SHOP_BAY);
    expect(h).toBeCloseTo(SHOP_BAY);
  });

  it("keeps a drawing's proportions from tall to the demo's widest bay", () => {
    for (const aspect of [0.5, 0.8, 1, SHOP_BAY / FACADE_BAND.min]) {
      const { w, h } = facadeSize(aspect);
      expect(w / h).toBeCloseTo(aspect, 6);
      expect(w).toBeLessThanOrEqual(SHOP_BAY + 1e-9);
    }
  });

  it("caps a tall drawing at two storeys and keeps a wide one a bay wide", () => {
    expect(facadeSize(0.5).h).toBeCloseTo(FACADE_BAND.max);
    expect(facadeSize(0.5).w).toBeCloseTo(FACADE_BAND.max * 0.5);
    expect(facadeSize(1.05).w).toBeCloseTo(SHOP_BAY);
    // Wider than that, the demo lifts it to two storeys rather than a squat strip.
    expect(facadeSize(1.6)).toEqual({ w: SHOP_BAY, h: FACADE_BAND.min });
  });
});

describe("a projecting sign seen from the pavement", () => {
  const normal = new THREE.Vector3(1, 0, 0);
  it("is gone edge-on and full square-on, from either side", () => {
    expect(signFacing(normal, new THREE.Vector3(0, 0, 1))).toBe(0);
    expect(signFacing(normal, new THREE.Vector3(1, 0, 0))).toBe(1);
    expect(signFacing(normal, new THREE.Vector3(-1, 0, 0))).toBe(1);
  });

  it("fades smoothly in between", () => {
    const at = (cos: number) => signFacing(normal, new THREE.Vector3(cos, 0, Math.sqrt(1 - cos * cos)));
    expect(at(0.1)).toBe(0);
    expect(at(0.3)).toBeGreaterThan(0);
    expect(at(0.3)).toBeLessThan(1);
    expect(at(0.5)).toBe(1);
    expect(at(0.2)).toBeLessThan(at(0.3));
  });
});

describe("the dressed shopfront", () => {
  afterEach(() => vi.unstubAllGlobals());

  const build = () => {
    // No DOM under vitest: the neon is drawn on a canvas that has no context here.
    vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
    const shop = { x: 12, z: -40, side: -1 as const, labelHe: "חשמלאי", neonColour: "#ff5fa2" };
    return { shop, front: createShopFront(shop, new THREE.Texture(), new THREE.Texture()) };
  };

  it("stands on the frontage, turned to the street, its wall lit and casting shadow", () => {
    const { shop, front } = build();
    expect(front.group.position.toArray()).toEqual([shop.x, 0, shop.z]);
    expect(front.group.rotation.y).toBeCloseTo(frontageYaw(shop.side));
    const face = front.group.getObjectByName("shopfront-face") as THREE.Mesh;
    expect(face.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(face.castShadow).toBe(true);
    expect(face.position.z).toBeCloseTo(FACADE_OUT);
  });

  it("sizes the wall, cornice and canopy to the drawing once it is in", () => {
    const { front } = build();
    front.fit(1.6);
    const { w, h } = facadeSize(1.6);
    const face = front.group.getObjectByName("shopfront-face") as THREE.Mesh;
    expect(face.scale.x).toBeCloseTo(w);
    expect(face.scale.y).toBeCloseTo(h);
    expect(face.position.y).toBeCloseTo(h / 2);
    const ledges = front.group.children.filter(
      (o): o is THREE.Mesh => o instanceof THREE.Mesh && o.geometry instanceof THREE.BoxGeometry && o.scale.x > 1,
    );
    expect(ledges.map((l) => +l.position.y.toFixed(3)).sort((a, b) => a - b)).toEqual([
      +(h * 0.45).toFixed(3),
      +(h - 0.2).toFixed(3),
    ]);
  });

  it("hangs its sign over the pavement, one face each way, fading edge-on", () => {
    const { front } = build();
    const blades = front.group.children.filter((o) => o.name === "shopfront-blade") as THREE.Mesh<
      THREE.PlaneGeometry,
      THREE.MeshBasicMaterial
    >[];
    expect(blades).toHaveLength(2);
    for (const blade of blades) expect(blade.position.z).toBeCloseTo(BLADE.arm / 2);
    expect(blades[0]!.rotation.y).toBeCloseTo(-blades[1]!.rotation.y);

    front.group.updateMatrixWorld(true);
    const bladeAt = blades[0]!.getWorldPosition(new THREE.Vector3());
    const wallOut = new THREE.Vector3(0, 0, 1).applyQuaternion(front.group.quaternion);
    // Straight out from the wall: the sign is edge-on.
    front.face(bladeAt.clone().addScaledVector(wallOut, 20));
    for (const blade of blades) expect(blade.material.opacity).toBe(0);
    // Walking towards it along the pavement: full.
    const along = new THREE.Vector3(1, 0, 0).applyQuaternion(front.group.quaternion);
    front.face(bladeAt.clone().addScaledVector(along, 20));
    for (const blade of blades) expect(blade.material.opacity).toBeCloseTo(1);
  });
});
