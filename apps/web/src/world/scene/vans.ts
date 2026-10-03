import * as THREE from "three";
import { CITY_FLEET_TRADES } from "@pro-now/types";

import { emitter, type LightEmitter } from "./lightPool";
import { KERB_X, ROAD_HALF, STREET_LENGTH } from "./street";

/**
 * THE STREET'S TRAFFIC: THE PRO NOW FLEET, AS THE DEMO'S
 * (tools/design-preview/src/city/street.ts, `car` and the parked vehicles).
 *
 * The product drove ten SIDE-VIEW cards down the road (each turned to face
 * the camera), which on a street running away from you is a broadside
 * sliding along sideways. Its parked vans were the same cards, standing on
 * the pavement. The demo's traffic is every trade's van, built the way a
 * model maker would build it from three drawings:
 *
 * - the REAR drawing on the tail and the FRONT drawing on the nose, so a van
 *   driving away shows its back and one coming towards you its face;
 * - the SIDE drawing along its left flank, which also sets its length;
 * - between them a body in the drawing's own paint, the coral band, glass and
 *   the wordmark on the right flank (mirroring the drawing there would print
 *   PRO NOW backwards), four wheels that turn with the road, and a body that
 *   rides on its springs;
 * - at night a wash of its tail lamps and a pool of headlight on the road
 *   ahead of it (one of the evening's lent point lights, 62 cd over 14 m).
 *
 * Parked vehicles are the demo's too: a van and a scooter, in side and rear
 * views, half up on the kerb every 47 m, and the traffic eases out round them.
 */

export const VAN = {
  height: 2.3,
  width: 2.3 * 0.96,
  /** When a van has no side drawing at all (the demo's fallback). */
  fallbackLength: 3.6,
  wheelRadius: 0.36,
} as const;

/** Read off the drawn van, darkened so a lamp cannot bloom it white (the demo's). */
export const FLEET_PAINT = { body: 0xcbb9b4, band: 0xff6b4a, glass: 0x14111d, trim: 0x2a2530 } as const;

/** The pool of headlight on the road ahead of a van. */
export const VAN_LIGHT = { colour: 0xfff0cc, intensity: 62, distance: 14, ahead: 6.4, height: 0.7 } as const;

/** Driving away down the left lane, towards you up the right (the demo's laneA, laneB). */
export const LANES = { away: -ROAD_HALF * 0.5, toward: ROAD_HALF * 0.5 } as const;

const HALF = STREET_LENGTH / 2;

export type FleetTrade = (typeof CITY_FLEET_TRADES)[number];
export type Direction = 1 | -1;

/** A van's trade, from its lane and where it starts, so it keeps its identity (the demo's). */
export function fleetTrade(z: number, dir: Direction): FleetTrade {
  const i = Math.abs(Math.round(z / 7) + (dir > 0 ? 3 : 0)) % CITY_FLEET_TRADES.length;
  return CITY_FLEET_TRADES[i]!;
}

/** A van is as long as its side drawing is wide at the van's height. */
export function vanLength(sideAspect: number | null | undefined): number {
  return sideAspect && Number.isFinite(sideAspect) && sideAspect > 0 ? VAN.height * sideAspect : VAN.fallbackLength;
}

export interface FleetSlot {
  dir: Direction;
  laneX: number;
  speed: number;
  z: number;
}

/**
 * The demo's ten: five driving away, five coming towards you, slow enough to
 * be looked at (a high street, not a main road).
 */
export function fleetSchedule(random: () => number = Math.random): FleetSlot[] {
  const slots: FleetSlot[] = [];
  for (let i = 0; i < 5; i += 1) slots.push({ dir: -1, laneX: LANES.away, speed: 5 + random() * 2.5, z: -120 + i * 58 });
  for (let i = 0; i < 5; i += 1) slots.push({ dir: 1, laneX: LANES.toward, speed: 4.5 + random() * 2.5, z: -92 + i * 61 });
  return slots;
}

/** Along the street with the demo's wrap: off one end, back on at the other. */
export function driveOn(z: number, dir: Direction, speed: number, dt: number): number {
  const next = z + dir * speed * dt;
  if (next > HALF) return -HALF;
  if (next < -HALF) return HALF;
  return next;
}

export interface ParkedSpot {
  side: Direction;
  z: number;
}

export type ParkedId = "parked_van_side" | "parked_scooter_side" | "parked_van_back" | "parked_scooter_back";

export interface ParkedVehicle extends ParkedSpot {
  id: ParkedId;
  height: number;
  /** Side views face across the road; rear views face down it. */
  yaw: number;
  x: number;
}

/** The demo's kerb: every 47 m, alternating sides, half up on the kerb. */
export function parkedLayout(): ParkedVehicle[] {
  const kinds: Array<[ParkedId, number]> = [
    ["parked_van_side", 2.3],
    ["parked_scooter_side", 1.3],
    ["parked_van_back", 2.3],
    ["parked_scooter_back", 1.3],
  ];
  const out: ParkedVehicle[] = [];
  let k = 0;
  for (let z = HALF - 34; z > -HALF + 10; z -= 47) {
    const [id, height] = kinds[k++ % kinds.length]!;
    const side: Direction = k % 2 ? 1 : -1;
    const yaw = id.endsWith("_side") ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : 0;
    out.push({ id, height, side, z, yaw, x: side * (KERB_X - 0.55) });
  }
  return out;
}

/**
 * Where a van wants to be across the road: out towards the centre line while
 * a car is parked on its side from 7 m behind to 18 m ahead, the way a driver
 * looks ahead (the demo's), otherwise its lane.
 */
export function laneTarget(laneX: number, z: number, dir: Direction, parked: readonly ParkedSpot[]): number {
  const side = Math.sign(laneX);
  const blocked = parked.some((p) => {
    if (p.side !== side) return false;
    const ahead = (p.z - z) * dir;
    return ahead > -7 && ahead < 18;
  });
  return blocked ? side * 0.35 : laneX;
}

/** A van on its springs: a small bounce and roll (the demo's). */
export function ride(t: number): { y: number; roll: number } {
  return { y: 0.03 * Math.sin(t * 7.3) + 0.015 * Math.sin(t * 13.1), roll: 0.008 * Math.sin(t * 3.7) };
}

/** A drawing stood up as a lit, shadow-casting cut-out, sized to its image (the demo's `cutout`). */
export type Cutout = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> & { fit(aspect: number): void };

export function cutout(texture: THREE.Texture, height: number): Cutout {
  texture.colorSpace = THREE.SRGBColorSpace;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshStandardMaterial({
      map: texture,
      emissiveMap: texture,
      emissive: 0xffffff,
      emissiveIntensity: 0.14,
      transparent: true,
      alphaTest: 0.42,
      roughness: 0.9,
      side: THREE.DoubleSide,
    }),
  );
  const mesh: Cutout = Object.assign(plane, {
    fit(aspect: number) {
      plane.scale.set(height * (aspect > 0 && Number.isFinite(aspect) ? aspect : 1), height, 1);
    },
  });
  // The shadow pass copies alphaTest but not the map: without its own depth
  // material a cut-out casts a rectangle.
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: texture,
    alphaTest: 0.42,
  });
  mesh.castShadow = true;
  mesh.fit(1);
  mesh.position.y = height / 2;
  return mesh;
}

/** The aspect of a loaded texture's image, or null while it is still loading. */
export function imageAspect(texture: THREE.Texture | null | undefined): number | null {
  const image = texture?.image as { width?: number; height?: number } | undefined;
  return image?.width && image.height ? image.width / image.height : null;
}

export interface VanDrawings {
  front: THREE.Texture;
  back: THREE.Texture;
  /** The trade's left flank; the generic van's when the trade has none drawn. */
  side: THREE.Texture | null;
}

export interface Van {
  group: THREE.Group;
  trade: FleetTrade;
  dir: Direction;
  laneX: number;
  speed: number;
  /** Lent one of the evening's point lights when it is among the nearest. */
  light: LightEmitter;
  length(): number;
  /** Lay the van out along its side drawing, once that is in. */
  fit(sideAspect: number | null): void;
  tick(dt: number, t: number, parked: readonly ParkedSpot[]): void;
}

export function createVan(
  slot: FleetSlot,
  drawings: VanDrawings,
  textures: { wordmark: THREE.Texture; glow: THREE.Texture },
  options: { day: boolean },
): Van {
  const { dir, laneX, speed } = slot;
  const trade = fleetTrade(slot.z, dir);
  const H = VAN.height;
  const Wd = VAN.width;
  const away = dir < 0;
  const group = new THREE.Group();
  group.name = `van-${trade}`;
  const body = new THREE.Group();
  group.add(body);

  // Built nose to -z, then turned to face the way it drives.
  const tail = cutout(drawings.back, H);
  const nose = cutout(drawings.front, H);
  nose.rotation.y = Math.PI;
  body.add(tail, nose);
  const flank = drawings.side ? cutout(drawings.side, H) : null;
  if (flank) {
    flank.rotation.y = -Math.PI / 2;
    flank.position.x = -Wd * 0.43;
    body.add(flank);
  }

  const paint = new THREE.MeshStandardMaterial({ color: FLEET_PAINT.body, roughness: 0.5, metalness: 0.08 });
  const shell = new THREE.Mesh(new THREE.BoxGeometry(Wd * 0.84, 1.5, 1), paint);
  shell.position.y = 1.18;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(Wd * 0.8, 0.3, 1), paint);
  shell.castShadow = roof.castShadow = true;
  const trim = new THREE.MeshStandardMaterial({ color: FLEET_PAINT.trim, roughness: 0.7 });
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(Wd * 0.86, 0.3, 1), trim);
  skirt.position.y = 0.5;
  body.add(shell, roof, skirt);

  // The right flank: the coral band, glass over the cab, a door seam, a second
  // window and the wordmark.
  const flankX = Wd * 0.42;
  const onFlank = (mesh: THREE.Mesh, lift: number) => {
    mesh.rotation.y = Math.PI / 2;
    mesh.position.x = flankX + lift;
    body.add(mesh);
    return mesh;
  };
  const band = onFlank(
    new THREE.Mesh(new THREE.PlaneGeometry(1, 0.24), new THREE.MeshStandardMaterial({ color: FLEET_PAINT.band, roughness: 0.5 })),
    0.005,
  );
  band.position.y = 0.72;
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: FLEET_PAINT.glass,
    roughness: 0.16,
    emissive: 0x2a2440,
    emissiveIntensity: 0.5,
  });
  const glass = onFlank(new THREE.Mesh(new THREE.PlaneGeometry(1, 0.62), glassMaterial), 0.006);
  glass.position.y = 1.55;
  const rearGlass = onFlank(new THREE.Mesh(new THREE.PlaneGeometry(1, 0.62 * 0.8), glassMaterial), 0.006);
  rearGlass.position.y = 1.6;
  const seam = onFlank(new THREE.Mesh(new THREE.PlaneGeometry(0.03, 1.1), trim), 0.006);
  seam.position.y = 1.2;
  const mark = onFlank(
    new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 0.6),
      new THREE.MeshStandardMaterial({ map: textures.wordmark, transparent: true, color: 0x1a1522, roughness: 0.6 }),
    ),
    0.007,
  );
  mark.position.y = 1.3;

  const tyre = new THREE.MeshStandardMaterial({ color: 0x16131b, roughness: 0.85 });
  const hub = new THREE.MeshStandardMaterial({ color: 0x9a96a4, roughness: 0.4, metalness: 0.3 });
  const wheels: THREE.Group[] = [];
  for (let i = 0; i < 4; i += 1) {
    const wheel = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(VAN.wheelRadius, VAN.wheelRadius, 0.28, 18), tyre);
    t.rotation.z = Math.PI / 2;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.3, 12), hub);
    cap.rotation.z = Math.PI / 2;
    wheel.add(t, cap);
    wheel.position.set((i % 2 ? 1 : -1) * Wd * 0.36, VAN.wheelRadius, 0);
    group.add(wheel);
    wheels.push(wheel);
  }

  // The red wash of tail lamps that are in the drawing (the demo's; warm for
  // one coming towards you). By day an additive glow is kept faint.
  const wash = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: textures.glow,
      color: away ? 0xff3b30 : 0xfff0cc,
      transparent: true,
      opacity: (away ? 0.3 : 0.4) * (options.day ? 0.3 : 1),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  wash.scale.set(3.6, 2.2, 1);
  group.add(wash);

  let L: number = VAN.fallbackLength;
  const fit = (sideAspect: number | null) => {
    L = vanLength(sideAspect);
    tail.fit(imageAspect(drawings.back) ?? 1);
    tail.position.z = L / 2;
    nose.fit(imageAspect(drawings.front) ?? 1);
    nose.position.z = -L / 2;
    if (flank) flank.fit(L / H);
    shell.scale.z = L * 0.9;
    roof.scale.z = L * 0.72;
    roof.position.set(0, 2.02, L * 0.06);
    skirt.scale.z = L * 0.92;
    band.scale.x = L * 0.88;
    glass.scale.x = L * 0.26;
    glass.position.z = -L * 0.3;
    rearGlass.scale.x = L * 0.26 * 0.55;
    rearGlass.position.z = L * 0.32;
    seam.position.z = -L * 0.1;
    mark.position.z = L * 0.14;
    wheels.forEach((wheel, i) => (wheel.position.z = (i < 2 ? -1 : 1) * (L / 2 - 0.62)));
    wash.position.set(0, 1.0, L / 2 + 0.4);
  };
  fit(imageAspect(drawings.side));

  if (dir > 0) group.rotation.y = Math.PI;
  group.position.set(laneX, 0, slot.z);
  const light = emitter(laneX, VAN_LIGHT.height, slot.z + dir * VAN_LIGHT.ahead, VAN_LIGHT.colour, VAN_LIGHT.intensity, VAN_LIGHT.distance);
  const phase = Math.abs(slot.z) % 6.28;

  return {
    group,
    trade,
    dir,
    laneX,
    speed,
    light,
    length: () => L,
    fit,
    tick(dt, t, parked) {
      const p = group.position;
      p.z = driveOn(p.z, dir, speed, dt);
      p.x += (laneTarget(laneX, p.z, dir, parked) - p.x) * Math.min(1, dt * 3.2);
      const r = ride(t + phase);
      body.position.y = r.y;
      body.rotation.z = r.roll;
      for (const wheel of wheels) wheel.rotation.x -= (speed * dt) / VAN.wheelRadius;
      light.position.set(p.x, VAN_LIGHT.height, p.z + dir * VAN_LIGHT.ahead);
    },
  };
}
