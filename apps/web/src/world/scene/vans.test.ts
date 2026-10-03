import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { KERB_X, STREET_LENGTH } from "./street";
import {
  LANES,
  VAN,
  VAN_LIGHT,
  createVan,
  cutout,
  driveOn,
  fleetSchedule,
  fleetTrade,
  laneTarget,
  parkedLayout,
  ride,
  vanLength,
} from "./vans";

const HALF = STREET_LENGTH / 2;
const loaded = (width: number, height: number) => {
  const t = new THREE.Texture();
  t.image = { width, height };
  return t;
};

describe("the fleet on the road", () => {
  it("is the demo's ten: five driving away down the left lane, five coming up the right, slowly", () => {
    const slots = fleetSchedule(() => 0.5);
    expect(slots).toHaveLength(10);
    const away = slots.filter((s) => s.dir < 0);
    const toward = slots.filter((s) => s.dir > 0);
    expect(away).toHaveLength(5);
    expect(toward).toHaveLength(5);
    for (const s of away) expect(s.laneX).toBe(LANES.away);
    for (const s of toward) expect(s.laneX).toBe(LANES.toward);
    expect(LANES.away).toBeLessThan(0);
    for (const s of fleetSchedule(() => 0)) expect(s.speed).toBeGreaterThanOrEqual(4.5);
    for (const s of fleetSchedule(() => 0.999)) expect(s.speed).toBeLessThan(7.5);
  });

  it("is eight trades' vans, each keeping its trade from where it starts", () => {
    const trades = fleetSchedule().map((s) => fleetTrade(s.z, s.dir));
    expect(new Set(trades)).toEqual(new Set(["clean", "appliance", "plumber", "tech", "beauty", "well", "tow", "vet"]));
    expect(fleetTrade(54, -1)).toBe(fleetTrade(54, -1));
  });

  it("drives off one end of the street and back on at the other", () => {
    expect(driveOn(0, -1, 6, 1)).toBe(-6);
    expect(driveOn(HALF - 1, 1, 6, 1)).toBe(-HALF);
    expect(driveOn(-HALF + 1, -1, 6, 1)).toBe(HALF);
  });

  it("is as long as its side drawing at a van's height", () => {
    expect(vanLength(640 / 393)).toBeCloseTo(2.3 * (640 / 393));
    expect(vanLength(null)).toBe(VAN.fallbackLength);
    expect(vanLength(0)).toBe(VAN.fallbackLength);
  });

  it("rides on its springs, a few centimetres at most", () => {
    for (let t = 0; t < 10; t += 0.37) {
      const r = ride(t);
      expect(Math.abs(r.y)).toBeLessThanOrEqual(0.045);
      expect(Math.abs(r.roll)).toBeLessThanOrEqual(0.008);
    }
  });
});

describe("the kerb", () => {
  it("has the demo's parked van and scooter, side and rear, every 47 m, half up on the kerb", () => {
    const parked = parkedLayout();
    expect(parked.map((p) => p.z)).toEqual([116, 69, 22, -25, -72, -119]);
    expect(parked.map((p) => p.id)).toEqual([
      "parked_van_side",
      "parked_scooter_side",
      "parked_van_back",
      "parked_scooter_back",
      "parked_van_side",
      "parked_scooter_side",
    ]);
    expect(parked.map((p) => p.side)).toEqual([1, -1, 1, -1, 1, -1]);
    for (const p of parked) {
      expect(Math.abs(p.x)).toBeCloseTo(KERB_X - 0.55);
      expect(Math.sign(p.x)).toBe(p.side);
      // Side views face across the road, rear views down it.
      expect(Math.abs(p.yaw)).toBeCloseTo(p.id.endsWith("_side") ? Math.PI / 2 : 0);
      expect(p.height).toBe(p.id.includes("van") ? 2.3 : 1.3);
    }
  });

  it("is driven round: a van looks 18 m ahead and moves out until 7 m past", () => {
    const parked = [{ side: -1 as const, z: 40 }];
    // Driving away (towards -z) in the left lane.
    expect(laneTarget(LANES.away, 55, -1, parked)).toBeCloseTo(-0.35);
    expect(laneTarget(LANES.away, 60, -1, parked)).toBe(LANES.away);
    expect(laneTarget(LANES.away, 35, -1, parked)).toBeCloseTo(-0.35);
    expect(laneTarget(LANES.away, 30, -1, parked)).toBe(LANES.away);
    // A car parked on the other side is not in its way.
    expect(laneTarget(LANES.toward, 30, 1, parked)).toBe(LANES.toward);
  });
});

describe("a van", () => {
  const textures = { wordmark: new THREE.Texture(), glow: new THREE.Texture() };
  const drawings = () => ({ front: loaded(640, 640), back: loaded(640, 640), side: loaded(640, 393) });

  it("is built from its drawings: rear on the tail, front on the nose, the side along its flank", () => {
    const van = createVan({ dir: -1, laneX: LANES.away, speed: 6, z: 54 }, drawings(), textures, { day: false });
    const L = van.length();
    expect(L).toBeCloseTo(2.3 * (640 / 393));
    const planes = van.group.children[0]!.children.filter(
      (o): o is THREE.Mesh => o instanceof THREE.Mesh && (o.material as THREE.MeshStandardMaterial).map !== null,
    );
    const zs = planes.map((p) => p.position.z);
    expect(zs).toContain(L / 2);
    expect(zs).toContain(-L / 2);
    // Driving away, it is not turned: its tail (+z) faces the camera.
    expect(van.group.rotation.y).toBe(0);
  });

  it("coming towards you is turned round, so it shows its face", () => {
    const van = createVan({ dir: 1, laneX: LANES.toward, speed: 6, z: 30 }, drawings(), textures, { day: false });
    expect(van.group.rotation.y).toBeCloseTo(Math.PI);
  });

  it("drives, turns its wheels, and carries its headlight pool ahead of it", () => {
    const van = createVan({ dir: -1, laneX: LANES.away, speed: 6, z: 54 }, drawings(), textures, { day: false });
    const wheel = van.group.children.find((o) => o instanceof THREE.Group && o !== van.group.children[0])!;
    van.tick(0.5, 1, []);
    expect(van.group.position.z).toBeCloseTo(51);
    expect(wheel.rotation.x).toBeCloseTo(-(6 * 0.5) / VAN.wheelRadius);
    expect(van.light.position.z).toBeCloseTo(51 - VAN_LIGHT.ahead);
    expect(van.light.intensity).toBe(62);
    expect(van.light.distance).toBe(14);
  });

  it("is laid out again when its side drawing arrives", () => {
    const d = { ...drawings(), side: new THREE.Texture() };
    const van = createVan({ dir: -1, laneX: LANES.away, speed: 6, z: 0 }, d, textures, { day: false });
    expect(van.length()).toBe(VAN.fallbackLength);
    van.fit(2);
    expect(van.length()).toBeCloseTo(4.6);
  });

  it("keeps its tail-lamp wash faint by day", () => {
    const glows = (day: boolean) =>
      createVan({ dir: -1, laneX: LANES.away, speed: 6, z: 0 }, drawings(), textures, { day }).group.children.find(
        (o): o is THREE.Sprite => o instanceof THREE.Sprite,
      )!.material.opacity;
    expect(glows(false)).toBeCloseTo(0.3);
    expect(glows(true)).toBeCloseTo(0.09);
  });
});

describe("a cut-out", () => {
  it("casts the shadow of its drawing, not of its rectangle, and takes its drawing's shape", () => {
    const c = cutout(loaded(1050, 400), 2.3);
    expect(c.castShadow).toBe(true);
    expect(c.customDepthMaterial).toBeInstanceOf(THREE.MeshDepthMaterial);
    c.fit(1050 / 400);
    expect(c.scale.x).toBeCloseTo(2.3 * (1050 / 400));
    expect(c.position.y).toBeCloseTo(1.15);
  });
});
