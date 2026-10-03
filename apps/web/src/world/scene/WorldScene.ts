import * as THREE from "three";
import { routeAt } from "@pro-now/types";

import type { WorldSceneFactoryArgs, WorldSceneHandle } from "../WorldCanvas";
import { WORLD_ASSETS, type WorldAssetId, worldAssetUrl } from "../assets";
import type { WorldMoveCommand, WorldSceneModel, WorldTrade } from "../types";
import {
  DESCENT_SECONDS,
  easeTowards,
  entryPose,
  followFactor,
  followPose,
  followInsideShop,
  frameStreet,
  shopPose,
  smoothstep01,
} from "./camera";
import {
  canEnterTrade,
  nearestShop,
  WORLD_SHOPS,
  WORLD_PLACES,
  FRONT_X,
  frontageYaw,
  ROAD_HALF,
  STREET_LENGTH,
  KERB_X,
  PAVEMENT,
} from "./street";
import { createPlayer, movePlayer, createContactShadow, type PlayerState } from "./player";
import { createRoom } from "./shopRooms";
import { createShopFront, type ShopFront } from "./shopFront";
import { paving, asphalt, plaster, neonGlow, glow, wordmark } from "./textures";
import {
  createVan,
  cutout,
  fleetSchedule,
  fleetTrade,
  imageAspect,
  parkedLayout,
  type ParkedSpot,
  type Van,
} from "./vans";
import {
  WORLD_LIGHTING,
  aimSun,
  configureSunShadow,
  shadowFocus,
  shadowForSprite,
  skyTexture,
} from "./lighting";
import {
  EVENING_LIGHT,
  LEND_INTERVAL_S,
  createLightPool,
  emitter,
  lendLights,
  type LightEmitter,
} from "./lightPool";
import { advanceAlongStreet } from "./ambient";
import { createFrameGovernor } from "./frameGovernor";
import { createPostProcessing, type PostProcessingHandle } from "./postProcessing";

const VEHICLE_BY_DEPARTMENT: Partial<Record<string, WorldAssetId>> = {
  HOME_URGENT: "pn_electric_side",
  APPLIANCES: "pn_appliance_side",
  HOME_CARE: "pn_clean_side",
  BEAUTY: "pn_beauty_side",
  LOGISTICS: "moving_van",
  PETS: "pn_vet_side",
  TECH: "pn_tech_side",
  WELLNESS: "pn_well_side",
  VEHICLE: "tow_truck",
};

const LAMP_SPACING = 31;
const LAMP_HEIGHT = 4.2;
const TREE_SPACING = 35;
const NPC_COUNT = 14;

function BAY_W(): number {
  return 8.8;
}

function loadTexture(loader: THREE.TextureLoader, id: WorldAssetId): THREE.Texture {
  return loader.load(worldAssetUrl(id));
}

function tiledPhoto(tex: THREE.Texture | null, repeatX: number, repeatY: number): THREE.Texture | null {
  if (!tex) return null;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function tryLoadTexture(loader: THREE.TextureLoader, id: string): THREE.Texture | null {
  if (id in WORLD_ASSETS) return loadTexture(loader, id as WorldAssetId);
  return null;
}

function createSprite(
  loader: THREE.TextureLoader,
  id: WorldAssetId,
  scale: [number, number],
  position: [number, number, number],
): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: loadTexture(loader, id), transparent: true, depthWrite: false }),
  );
  sprite.scale.set(scale[0], scale[1], 1);
  sprite.position.set(position[0], position[1], position[2]);
  return sprite;
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    mesh.customDepthMaterial?.dispose();
    const material = mesh.material;
    const materials = Array.isArray(material) ? material : material ? [material] : [];
    for (const item of materials) {
      const texture = (item as THREE.MeshBasicMaterial).map;
      texture?.dispose();
      item.dispose();
    }
  });
}

function tradeForShop(model: WorldSceneModel, shopId: string): WorldTrade | null {
  return model.trades[shopId] ?? null;
}

function isDaytime(): boolean {
  const h = new Date().getHours();
  return h >= 6 && h < 18;
}

interface NPC {
  sprite: THREE.Sprite;
  shadow: THREE.Sprite;
  x: number;
  z: number;
  speed: number;
  direction: 1 | -1;
  lane: number;
  frameDistance: number;
  textures: THREE.Texture[];
}

type TickFn = (dt: number, elapsed: number) => void;

function buildStreetGeometry(
  root: THREE.Group,
  scene: THREE.Scene,
  loader: THREE.TextureLoader,
  ticking: TickFn[],
): {
  lamps: THREE.Vector3[];
  emitters: LightEmitter[];
  parked: ParkedSpot[];
} {
  const day = isDaytime();
  const halfStreet = STREET_LENGTH / 2;

  // The demo's photographed stone and asphalt; the drawn ones if the art is missing.
  const pavingTex = tiledPhoto(tryLoadTexture(loader, "mat_paving"), 12, 62) ?? paving(26);
  const asphaltTex = tiledPhoto(tryLoadTexture(loader, "mat_road"), 2, 34) ?? asphalt();

  const groundGeo = new THREE.PlaneGeometry(FRONT_X * 2, STREET_LENGTH);
  // The demo's ground: cut stone with a little sheen, so the sun finds it.
  const pavingMaterial = () =>
    new THREE.MeshStandardMaterial({ map: pavingTex, roughness: 0.45, metalness: 0.08 });
  const leftPavement = new THREE.Mesh(
    groundGeo.clone(),
    pavingMaterial(),
  );
  leftPavement.rotation.x = -Math.PI / 2;
  leftPavement.position.set(-FRONT_X / 2 - ROAD_HALF / 2, -0.02, 0);
  leftPavement.receiveShadow = true;
  root.add(leftPavement);

  const rightPavement = new THREE.Mesh(
    groundGeo.clone(),
    pavingMaterial(),
  );
  rightPavement.rotation.x = -Math.PI / 2;
  rightPavement.position.set(FRONT_X / 2 + ROAD_HALF / 2, -0.02, 0);
  rightPavement.receiveShadow = true;
  root.add(rightPavement);

  const roadGeo = new THREE.PlaneGeometry(ROAD_HALF * 2, STREET_LENGTH);
  const road = new THREE.Mesh(
    roadGeo,
    new THREE.MeshStandardMaterial({
      map: asphaltTex,
      roughness: 0.22,
      metalness: 0.35,
    }),
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, 0);
  road.receiveShadow = true;
  root.add(road);

  const kerbGeo = new THREE.BoxGeometry(0.18, 0.15, STREET_LENGTH);
  const kerbMat = new THREE.MeshStandardMaterial({ color: 0x7d7488, roughness: 0.7 });
  const leftKerb = new THREE.Mesh(kerbGeo, kerbMat);
  leftKerb.position.set(-KERB_X, 0.06, 0);
  leftKerb.castShadow = leftKerb.receiveShadow = true;
  root.add(leftKerb);
  const rightKerb = new THREE.Mesh(kerbGeo.clone(), kerbMat.clone());
  rightKerb.position.set(KERB_X, 0.06, 0);
  rightKerb.castShadow = rightKerb.receiveShadow = true;
  root.add(rightKerb);

  /* ---------- filler buildings ---------- */
  const plasterTex = plaster();
  const buildingHeight = 8.5;
  const bldTextures: THREE.Texture[] = [];
  for (let i = 1; i <= 6; i++) {
    const t = tryLoadTexture(loader, `bld_${i}_wall`);
    if (t) bldTextures.push(t);
  }

  let bldIdx = 0;
  for (let z = -halfStreet; z <= halfStreet; z += BAY_W()) {
    for (const side of [-1, 1] as const) {
      const isShop = WORLD_SHOPS.some((s) => Math.abs(s.z - z) < BAY_W() / 2 && s.side === side);
      if (isShop) continue;

      const wallTex = bldTextures.length > 0 ? bldTextures[bldIdx % bldTextures.length] : plasterTex.clone();
      bldIdx++;
      const wall = new THREE.Mesh(
        new THREE.PlaneGeometry(BAY_W(), buildingHeight),
        new THREE.MeshStandardMaterial({
          map: wallTex,
          roughness: 0.9,
          color: bldTextures.length > 0 ? "#cccccc" : "#3a3040",
          // A face turned from the sun still throws its shadow into the street.
          shadowSide: THREE.DoubleSide,
        }),
      );
      wall.rotation.y = frontageYaw(side);
      wall.position.set(side * FRONT_X, buildingHeight / 2, z);
      wall.castShadow = wall.receiveShadow = true;
      root.add(wall);

      if (!day) {
        const storeys = 2 + Math.floor(Math.random() * 2);
        for (let s = 1; s <= storeys; s++) {
          if (Math.random() > 0.4) {
            const winGeo = new THREE.PlaneGeometry(1.2, 1.5);
            const winMat = new THREE.MeshBasicMaterial({
              color: new THREE.Color().setHSL(
                0.1 + Math.random() * 0.05,
                0.3,
                0.15 + Math.random() * 0.1,
              ),
              transparent: true,
              opacity: 0.7,
            });
            const win = new THREE.Mesh(winGeo, winMat);
            win.rotation.y = frontageYaw(side);
            const wx = side * FRONT_X + side * -0.01;
            const wy = 3.2 + (s - 1) * 2.9 + 0.5;
            const wz = z + (Math.random() - 0.5) * 4;
            win.position.set(wx, wy, wz);
            root.add(win);

            if (Math.random() > 0.6) {
              const base = 0.7;
              const rate = 1.5 + Math.random();
              ticking.push((_dt, t) => {
                winMat.opacity = base + Math.sin(t * rate) * 0.2;
              });
            }
          }
        }
      }

      /* roof props: AC units, tanks */
      const roofY = buildingHeight + 0.15;
      for (let ri = 0; ri < 1 + Math.floor(Math.random() * 2); ri++) {
        const rz = z + (Math.random() - 0.5) * 5;
        const rx = side * (FRONT_X - 0.4 - Math.random() * 2);
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(0.6 + Math.random() * 0.8, 0.4 + Math.random() * 0.3, 0.5 + Math.random() * 0.6),
          new THREE.MeshStandardMaterial({ color: "#4a4650", roughness: 0.9, metalness: 0.2 }),
        );
        box.position.set(rx, roofY + 0.2, rz);
        box.castShadow = true;
        root.add(box);
      }
    }
  }

  /* ---------- street lamps ---------- */
  const lamps: THREE.Vector3[] = [];
  const emitters: LightEmitter[] = [];
  const glowTex = glow();
  const lampTex = tryLoadTexture(loader, "prop_lamp");

  for (let z = -halfStreet + 10; z < halfStreet; z += LAMP_SPACING) {
    for (const side of [-1, 1] as const) {
      const lx = side * (KERB_X + PAVEMENT * 0.35);

      if (lampTex) {
        const lampSprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: lampTex, transparent: true, depthWrite: false, alphaTest: 0.1 }),
        );
        lampSprite.scale.set(1.5, LAMP_HEIGHT + 0.5, 1);
        lampSprite.position.set(lx, (LAMP_HEIGHT + 0.5) / 2, z);
        root.add(lampSprite, shadowForSprite(lampSprite));
      } else {
        const poleMat = new THREE.MeshStandardMaterial({ color: "#2a2530", metalness: 0.5 });
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, LAMP_HEIGHT, 6), poleMat);
        pole.position.set(lx, LAMP_HEIGHT / 2, z);
        pole.castShadow = true;
        root.add(pole);

        const armLen = 0.8;
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, armLen, 4), poleMat.clone());
        arm.rotation.z = Math.PI / 2;
        arm.position.set(lx - side * armLen / 2, LAMP_HEIGHT, z);
        root.add(arm);
      }

      if (!day) {
        const lampGlow = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTex,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: 0.85,
          }),
        );
        lampGlow.scale.set(3.5, 3.5, 1);
        lampGlow.position.set(lx, LAMP_HEIGHT + 0.3, z);
        root.add(lampGlow);

        // A real light only while one of the pool's is lent to it (lightPool.ts).
        const { colour, intensity, distance, height } = EVENING_LIGHT.lamp;
        emitters.push(emitter(lx, height, z, colour, intensity, distance));

        // The painted pool under the lamp and its streak on the wet stone, as
        // the demo's: for a lamp without a real light, this IS its light.
        const disc = new THREE.Mesh(
          new THREE.PlaneGeometry(11, 11),
          new THREE.MeshBasicMaterial({
            map: glowTex, color: colour, transparent: true, opacity: 0.16,
            blending: THREE.AdditiveBlending, depthWrite: false,
          }),
        );
        disc.rotation.x = -Math.PI / 2;
        disc.position.set(lx, 0.02, z);
        root.add(disc);
        const streak = new THREE.Mesh(
          new THREE.PlaneGeometry(1.6, 17),
          new THREE.MeshBasicMaterial({
            map: glowTex, color: colour, transparent: true, opacity: 0.1,
            blending: THREE.AdditiveBlending, depthWrite: false,
          }),
        );
        streak.rotation.x = -Math.PI / 2;
        streak.position.set(lx, 0.025, z + 7.5);
        root.add(streak);
      }

      lamps.push(new THREE.Vector3(lx, LAMP_HEIGHT, z));
    }
  }

  /* ---------- trees (art or procedural) ---------- */
  const palmTex = tryLoadTexture(loader, "prop_palm");
  const jacarandaTex = tryLoadTexture(loader, "prop_jacaranda");

  for (let z = -halfStreet + 20; z < halfStreet; z += TREE_SPACING) {
    for (const side of [-1, 1] as const) {
      const tx = side * (KERB_X + PAVEMENT * 0.7);
      const usePalm = Math.random() > 0.5;
      const treeTex = usePalm ? palmTex : jacarandaTex;

      if (treeTex) {
        const treeSprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: treeTex, transparent: true, depthWrite: false, alphaTest: 0.1 }),
        );
        treeSprite.scale.set(3.6, 5.4, 1);
        treeSprite.position.set(tx, 2.7, z);
        root.add(treeSprite, shadowForSprite(treeSprite));
      } else {
        const trunkMat = new THREE.MeshStandardMaterial({ color: "#3d2b1a" });
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 3, 6), trunkMat);
        trunk.position.set(tx, 1.5, z);
        trunk.castShadow = true;
        root.add(trunk);

        const canopyMat = new THREE.MeshStandardMaterial({
          color: day ? "#2d5a1e" : "#1a3312",
          roughness: 0.95,
          transparent: true,
          opacity: 0.85,
        });
        const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 6), canopyMat);
        canopy.scale.set(1, 0.7, 1);
        canopy.position.set(tx, 3.6, z);
        canopy.castShadow = true;
        root.add(canopy);
      }
    }
  }

  /* ---------- festoon / string lights ---------- */
  if (!day) {
    const bulbs: number[] = [];
    const tints: number[] = [];
    const cablePts: number[] = [];
    const WARM = [
      [1, 0.82, 0.55], [1, 0.72, 0.42], [1, 0.9, 0.7],
      [0.68, 0.86, 1], [1, 0.62, 0.62], [0.78, 1, 0.78],
    ];
    for (let z = halfStreet - 16; z > -halfStreet; z -= 31) {
      const x0 = -KERB_X - 1.4;
      const x1 = KERB_X + 1.4;
      const top = 7.4;
      const sag = 1.9;
      const N = 13;
      let prev: [number, number, number] | null = null;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const x = x0 + (x1 - x0) * t;
        const y = top - sag * (1 - Math.pow(2 * t - 1, 2));
        const zz = z + Math.sin(t * Math.PI) * 0.6;
        if (prev) cablePts.push(prev[0], prev[1], prev[2], x, y, zz);
        prev = [x, y, zz];
        if (i > 0 && i < N) {
          bulbs.push(x, y - 0.22, zz);
          const c = WARM[(((i + Math.round(z)) % WARM.length) + WARM.length) % WARM.length]!;
          tints.push(c[0]!, c[1]!, c[2]!);
        }
      }
    }
    const cableGeo = new THREE.BufferGeometry();
    cableGeo.setAttribute("position", new THREE.Float32BufferAttribute(cablePts, 3));
    scene.add(new THREE.LineSegments(
      cableGeo,
      new THREE.LineBasicMaterial({ color: 0x120e1a, transparent: true, opacity: 0.85 }),
    ));
    const bulbGeo = new THREE.BufferGeometry();
    bulbGeo.setAttribute("position", new THREE.Float32BufferAttribute(bulbs, 3));
    bulbGeo.setAttribute("color", new THREE.Float32BufferAttribute(tints, 3));
    const festoonPoints = new THREE.Points(
      bulbGeo,
      new THREE.PointsMaterial({
        map: glowTex, size: 1.5, sizeAttenuation: true, vertexColors: true,
        transparent: true, opacity: 0.95, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false,
      }),
    );
    scene.add(festoonPoints);
    ticking.push((_dt, t) => {
      (festoonPoints.material as THREE.PointsMaterial).opacity = 0.82 + Math.sin(t * 1.4) * 0.13;
    });
  }

  /* ---------- street furniture: café sets, planters, benches, bins ---------- */
  const cafeSetTex = tryLoadTexture(loader, "prop_cafe_set");
  const benchTex = tryLoadTexture(loader, "prop_bench");
  const binTex = tryLoadTexture(loader, "prop_bin");
  const planterBoxTex = tryLoadTexture(loader, "prop_planter_box");
  const planterRoundTex = tryLoadTexture(loader, "prop_planter_round");

  const furnitureSpots = [
    { z: 40, side: 1 },
    { z: 8, side: -1 },
    { z: -10, side: 1 },
    { z: -44, side: -1 },
    { z: -60, side: 1 },
    { z: -96, side: -1 },
    { z: -130, side: 1 },
  ];

  for (const spot of furnitureSpots) {
    const fx = spot.side * (KERB_X + PAVEMENT * 0.5);

    if (cafeSetTex && Math.random() > 0.4) {
      const cafeSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: cafeSetTex, transparent: true, depthWrite: false, alphaTest: 0.1 }),
      );
      cafeSprite.scale.set(1.35, 1.2, 1);
      cafeSprite.position.set(fx, 0.6, spot.z);
      root.add(cafeSprite, shadowForSprite(cafeSprite));

      if (!day) {
        const candle = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTex, transparent: true, blending: THREE.AdditiveBlending,
            depthWrite: false, opacity: 0.6, color: new THREE.Color("#ffcc66"),
          }),
        );
        candle.scale.set(0.3, 0.4, 1);
        candle.position.set(fx, 0.75, spot.z);
        root.add(candle);
        ticking.push((_dt, t) => {
          candle.material.opacity = 0.5 + Math.sin(t * 3 + spot.z) * 0.15;
        });
      }
    }

    const planterTex = Math.random() > 0.5 ? planterBoxTex : planterRoundTex;
    if (planterTex) {
      const planterSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: planterTex, transparent: true, depthWrite: false, alphaTest: 0.1 }),
      );
      planterSprite.scale.set(0.8, 0.9, 1);
      planterSprite.position.set(fx + spot.side * 1.5, 0.45, spot.z + 3);
      root.add(planterSprite, shadowForSprite(planterSprite));
    }
  }

  const benchSpots = [
    { z: 26, side: -1 },
    { z: -26, side: 1 },
    { z: -78, side: -1 },
    { z: -114, side: 1 },
  ];
  for (const spot of benchSpots) {
    const bx = spot.side * (KERB_X + PAVEMENT * 0.6);
    if (benchTex) {
      const benchSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: benchTex, transparent: true, depthWrite: false, alphaTest: 0.1 }),
      );
      benchSprite.scale.set(1.4, 0.9, 1);
      benchSprite.position.set(bx, 0.45, spot.z);
      root.add(benchSprite, shadowForSprite(benchSprite));
    }
  }

  const binSpots = [
    { z: 44, side: 1 },
    { z: -4, side: -1 },
    { z: -50, side: 1 },
    { z: -100, side: -1 },
  ];
  for (const spot of binSpots) {
    const bx = spot.side * (KERB_X + PAVEMENT * 0.4);
    if (binTex) {
      const binSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: binTex, transparent: true, depthWrite: false, alphaTest: 0.1 }),
      );
      binSprite.scale.set(0.5, 0.7, 1);
      binSprite.position.set(bx, 0.35, spot.z);
      root.add(binSprite, shadowForSprite(binSprite));
    }
  }

  /* ---------- steam vents ---------- */
  if (!day) {
    const steamPositions = [
      { x: -1.5, z: 20 },
      { x: 2.0, z: -40 },
    ];
    for (const pos of steamPositions) {
      const grateGeo = new THREE.PlaneGeometry(0.8, 0.8);
      const grate = new THREE.Mesh(
        grateGeo,
        new THREE.MeshStandardMaterial({ color: "#2a2530", roughness: 0.6, metalness: 0.4 }),
      );
      grate.rotation.x = -Math.PI / 2;
      grate.position.set(pos.x, 0.02, pos.z);
      root.add(grate);

      for (let p = 0; p < 4; p++) {
        const puff = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTex, transparent: true, blending: THREE.AdditiveBlending,
            depthWrite: false, opacity: 0.15, color: new THREE.Color("#c8c0d0"),
          }),
        );
        const phase = p * Math.PI / 2;
        puff.scale.set(0.8, 1.2, 1);
        puff.position.set(pos.x + (Math.random() - 0.5) * 0.3, 0.5, pos.z);
        root.add(puff);
        ticking.push((_dt, t) => {
          const cycle = ((t + phase) % 3) / 3;
          puff.position.y = 0.3 + cycle * 2.5;
          puff.material.opacity = 0.2 * (1 - cycle);
          puff.scale.set(0.6 + cycle * 1.2, 0.8 + cycle * 1.8, 1);
        });
      }
    }
  }

  /* ---------- places: dog park, garden, etc. ---------- */
  for (const place of WORLD_PLACES) {
    const placeId = `place_${place.id.replace("roadside", "roadside")}` as string;
    const placeTex = tryLoadTexture(loader, placeId);
    if (placeTex) {
      const placeSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: placeTex, transparent: true, depthWrite: false, alphaTest: 0.1 }),
      );
      placeSprite.scale.set(6, 3.5, 1);
      placeSprite.position.set(place.x, 1.75, place.z);
      root.add(placeSprite);
    }
  }

  /* dog park details */
  const dogParkPlace = WORLD_PLACES.find((p) => p.id === "dogpark");
  if (dogParkPlace) {
    const parkFigures: Array<{ id: string; height: number; xOff: number; zOff: number }> = [
      { id: "park_person1", height: 1.7, xOff: -1, zOff: -1 },
      { id: "park_person2", height: 1.65, xOff: 1.5, zOff: 0.5 },
      { id: "park_person3", height: 1.6, xOff: 0, zOff: 2 },
      { id: "park_dog1", height: 0.6, xOff: -2, zOff: 1 },
      { id: "park_dog2", height: 0.5, xOff: 2.5, zOff: -0.5 },
      { id: "park_dog3", height: 0.55, xOff: -0.5, zOff: -2 },
    ];
    for (const fig of parkFigures) {
      const figTex = tryLoadTexture(loader, fig.id);
      if (figTex) {
        const figSprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: figTex, transparent: true, depthWrite: false, alphaTest: 0.1 }),
        );
        figSprite.scale.set(fig.height * 0.7, fig.height, 1);
        figSprite.position.set(
          dogParkPlace.x + fig.xOff,
          fig.height / 2,
          dogParkPlace.z + fig.zOff,
        );
        root.add(figSprite);

        if (fig.id.startsWith("park_dog")) {
          const baseY = figSprite.position.y;
          ticking.push((_dt, t) => {
            figSprite.position.y = baseY + Math.sin(t * 4 + fig.xOff) * 0.03;
          });
        }
      }
    }
  }

  /* ---------- parked vehicles (the demo's: half up on the kerb, every 47 m) ---------- */
  const parked: ParkedSpot[] = [];
  for (const spot of parkedLayout()) {
    const drawing = loader.load(worldAssetUrl(spot.id), (loaded) => {
      const aspect = imageAspect(loaded);
      if (aspect) vehicle.fit(aspect);
    });
    const vehicle = cutout(drawing, spot.height);
    const stand = new THREE.Group();
    stand.add(vehicle);
    stand.position.set(spot.x, 0, spot.z);
    stand.rotation.y = spot.yaw;
    root.add(stand);
    parked.push({ side: spot.side, z: spot.z });
  }

  return { lamps, emitters, parked };
}

function buildNPCs(
  root: THREE.Group,
  loader: THREE.TextureLoader,
  ticking: TickFn[],
): NPC[] {
  const day = isDaytime();
  const halfStreet = STREET_LENGTH / 2;
  const npcs: NPC[] = [];
  const glowTex = glow();

  const walkerIds: WorldAssetId[] = ["walk_man", "walk_woman", "walk_dogwalker"];

  for (let i = 0; i < NPC_COUNT; i++) {
    const walkerId = walkerIds[i % walkerIds.length]!;
    const tex = tryLoadTexture(loader, walkerId as string);
    if (!tex) continue;

    const direction = (i % 2 === 0 ? 1 : -1) as 1 | -1;
    const lane = i % 2 === 0 ? -1 : 1;
    const npcX = lane * (KERB_X + PAVEMENT * (0.2 + Math.random() * 0.5));
    const npcZ = -halfStreet + (i / NPC_COUNT) * STREET_LENGTH;
    const speed = 0.8 + Math.random() * 0.6;

    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      alphaTest: 0.1,
    });
    if (!day) {
      mat.color.set("#b8b0c8");
    }
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.1, 1.7, 1);
    sprite.position.set(npcX, 0.85, npcZ);
    root.add(sprite);

    const shadow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex, transparent: true, depthWrite: false,
        opacity: 0.2, color: new THREE.Color("#000000"),
      }),
    );
    shadow.scale.set(0.9, 0.25, 1);
    shadow.position.set(npcX, 0.02, npcZ);
    root.add(shadow);

    const npc: NPC = { sprite, shadow, x: npcX, z: npcZ, speed, direction, lane, frameDistance: 0, textures: [tex] };
    npcs.push(npc);
  }

  ticking.push((dt) => {
    for (const npc of npcs) {
      npc.z = advanceAlongStreet(npc.z, npc.direction * npc.speed, dt, halfStreet, 10);
      npc.sprite.position.set(npc.x, 0.85, npc.z);
      npc.shadow.position.set(npc.x, 0.02, npc.z);
    }
  });

  return npcs;
}

/**
 * The street's traffic: the demo's PRO NOW fleet, each trade's van built from
 * its drawings (vans.ts). Each van lends its headlight pool to the evening's
 * light pool through `emitters`, and eases out round the parked vehicles.
 */
function buildTraffic(
  root: THREE.Group,
  loader: THREE.TextureLoader,
  ticking: TickFn[],
  emitters: LightEmitter[],
  parked: readonly ParkedSpot[],
): Van[] {
  const day = isDaytime();
  const textures = { wordmark: wordmark(), glow: glow() };
  // One load per drawing, shared by every van of that trade; each van is laid
  // out again when one of its drawings arrives.
  const drawings = new Map<WorldAssetId, { texture: THREE.Texture; ready: Array<() => void> }>();
  const drawing = (id: WorldAssetId, onReady: () => void): THREE.Texture => {
    let entry = drawings.get(id);
    if (!entry) {
      const ready: Array<() => void> = [];
      const texture = loader.load(worldAssetUrl(id), () => {
        for (const f of ready) f();
      });
      entry = { texture, ready };
      drawings.set(id, entry);
    }
    entry.ready.push(onReady);
    return entry.texture;
  };

  const vans: Van[] = [];
  for (const slot of fleetSchedule()) {
    const trade = fleetTrade(slot.z, slot.dir);
    const sideId = `fleet_${trade}_side` in WORLD_ASSETS ? (`fleet_${trade}_side` as WorldAssetId) : "parked_van_side";
    const refit = () => van.fit(imageAspect(side));
    const side = drawing(sideId, refit);
    const van: Van = createVan(
      slot,
      {
        front: drawing(`fleet_${trade}_front` as WorldAssetId, refit),
        back: drawing(`fleet_${trade}_back` as WorldAssetId, refit),
        side,
      },
      textures,
      { day },
    );
    root.add(van.group);
    emitters.push(van.light);
    vans.push(van);
  }

  ticking.push((dt, elapsed) => {
    for (const van of vans) van.tick(dt, elapsed, parked);
  });

  return vans;
}

function buildSky(scene: THREE.Scene, day: boolean): void {
  // The gradient itself is the scene's background (createWorldScene), out of
  // the fog's reach. What stands in it is past the fog too: at 170 m the
  // evening haze would leave 1% of a star.
  if (!day) {
    const starCount = 420;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.4;
      const r = 170;
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.cos(phi);
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    // The demo's stars: cool white, a little larger, unfogged.
    const starMat = new THREE.PointsMaterial({
      color: 0xcfd4ff,
      size: 0.9,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      fog: false,
    });
    scene.add(new THREE.Points(starGeo, starMat));
  }

  if (!day) {
    const towerCount = 44;
    const towerPositions: THREE.Vector3[] = [];
    for (let i = 0; i < towerCount; i++) {
      const angle = (i / towerCount) * Math.PI * 2;
      const dist = 120 + Math.random() * 40;
      towerPositions.push(new THREE.Vector3(
        Math.cos(angle) * dist,
        4 + Math.random() * 12,
        Math.sin(angle) * dist,
      ));
    }
    for (const pos of towerPositions) {
      const tw = 1.5 + Math.random() * 3;
      const th = 6 + Math.random() * 14;
      const tower = new THREE.Mesh(
        new THREE.PlaneGeometry(tw, th),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color().setHSL(0.7, 0.15, 0.04 + Math.random() * 0.03),
          transparent: true,
          opacity: 0.6,
          depthWrite: false,
        }),
      );
      tower.position.copy(pos);
      tower.lookAt(0, pos.y, 0);
      scene.add(tower);
    }
  }
}

function buildNeonHalo(
  colour: string,
  position: THREE.Vector3,
  side: -1 | 1,
): THREE.Sprite {
  const haloTex = neonGlow(colour);
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: haloTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.6,
    }),
  );
  halo.scale.set(5, 3.5, 1);
  halo.position.copy(position);
  halo.position.x -= side * 0.5;
  halo.position.y = 3.8;
  return halo;
}

export function createWorldScene({
  renderer,
  scene,
  camera,
  model: initialModel,
  onEvent,
}: WorldSceneFactoryArgs): WorldSceneHandle {
  const day = isDaytime();
  // The arrival screen stays up until the street's art is in (WorldCanvas).
  // Later loads (a shop's room) finish the manager again; only the first counts.
  let artReady = false;
  const artListeners: Array<() => void> = [];
  const manager = new THREE.LoadingManager(() => {
    if (artReady) return;
    artReady = true;
    for (const listener of artListeners.splice(0)) listener();
  });
  const loader = new THREE.TextureLoader(manager);
  const root = new THREE.Group();
  scene.add(root);

  const coarse = window.matchMedia?.("(pointer: coarse)").matches === true || window.innerWidth < 768;
  const ticking: TickFn[] = [];

  const lighting = WORLD_LIGHTING[day ? "day" : "night"];
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = lighting.exposure;
  // Day and evening: the sun's (or the moon's) shadows, as in the demo.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  camera.fov = 72;
  camera.near = 0.1;
  camera.far = 400;
  camera.updateProjectionMatrix();

  scene.fog = new THREE.FogExp2(lighting.fog.colour, lighting.fog.density);
  renderer.setClearColor(lighting.fog.colour);
  const skyBackground = skyTexture(day ? "day" : "night");
  const previousBackground = scene.background;
  scene.background = skyBackground;

  buildSky(scene, day);

  const hemi = new THREE.HemisphereLight(
    lighting.hemisphere.sky,
    lighting.hemisphere.ground,
    lighting.hemisphere.intensity,
  );
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(lighting.sun.colour, lighting.sun.intensity);
  configureSunShadow(sun);
  scene.add(sun, sun.target);
  const sunFocus = new THREE.Vector3();
  const cameraDirection = new THREE.Vector3();

  const { lamps, emitters, parked } = buildStreetGeometry(root, scene, loader, ticking);
  buildNPCs(root, loader, ticking);
  buildTraffic(root, loader, ticking, emitters, parked);

  const LAMP_TINT_RANGE = 14;

  const tintPlayerFromLamps = () => {
    if (day || lamps.length === 0) return;
    let closest = Infinity;
    for (const lamp of lamps) {
      const d = Math.hypot(lamp.x - player.x, lamp.z - player.z);
      if (d < closest) closest = d;
    }
    const k = Math.min(1, closest / LAMP_TINT_RANGE);
    const warm = new THREE.Color("#ffeedd");
    const cool = new THREE.Color("#b8b0c8");
    const tint = warm.lerp(cool, k);
    const mat = player.group.material as THREE.SpriteMaterial;
    mat.color.copy(tint);
  };

  // By day there is no pool: the demo's lamps are on at a fifth in the
  // morning, which nobody sees, and ten lights would cost every pixel.
  const lightPool = day ? [] : createLightPool(root);
  let lendClock = LEND_INTERVAL_S;
  const lendEveningLights = (dt: number) => {
    if (lightPool.length === 0) return;
    lendClock += dt;
    if (lendClock < LEND_INTERVAL_S) return;
    lendClock = 0;
    lendLights(lightPool, emitters, camera.position);
  };

  /* ---------- shop facades (prefer shop_* art over district_*) ---------- */
  const shopGlow = glow();
  const shopFronts: ShopFront[] = [];
  for (const shop of WORLD_SHOPS) {
    const shopArtId = `shop_${shop.shopId}` as WorldAssetId;
    const usesShopArt = shopArtId in WORLD_ASSETS;
    const facadeId = usesShopArt ? shopArtId : (shop.assetId as WorldAssetId);
    // The drawing as a lit wall at its own proportions, dressed as the demo's
    // (shopFront.ts); it is sized to the drawing once the drawing is in.
    const drawing: THREE.Texture = loader.load(worldAssetUrl(facadeId), (loaded) => {
      const image = loaded.image as { width?: number; height?: number } | undefined;
      if (image?.width && image.height) front.fit(image.width / image.height);
    });
    drawing.colorSpace = THREE.SRGBColorSpace;
    const front = createShopFront(shop, drawing, shopGlow);
    shopFronts.push(front);
    root.add(front.group);

    if (!day) {
      root.add(buildNeonHalo(shop.neonColour, new THREE.Vector3(shop.x, 3.8, shop.z), shop.side));

      // The shop's warm light on its own pavement, and its sign's colour, as the demo's.
      const spill = EVENING_LIGHT.shopSpill;
      emitters.push(
        emitter(shop.x - shop.side * spill.out, spill.height, shop.z, spill.colour, spill.intensity, spill.distance),
      );
      const sign = EVENING_LIGHT.shopSign;
      emitters.push(
        emitter(shop.x - shop.side * sign.out, sign.height, shop.z, shop.neonColour, sign.intensity, sign.distance),
      );
    }
  }

  const walkTextures: THREE.Texture[] = [];
  const runTextures: THREE.Texture[] = [];
  for (let i = 1; i <= 8; i++) {
    const wId = `avatar_amit_walk_0${i}` as WorldAssetId;
    const rId = `avatar_amit_run_0${i}` as WorldAssetId;
    if (wId in WORLD_ASSETS) walkTextures.push(loadTexture(loader, wId));
    if (rId in WORLD_ASSETS) runTextures.push(loadTexture(loader, rId));
  }

  const player: PlayerState = createPlayer(walkTextures, runTextures);
  root.add(player.group);

  const shadow = createContactShadow();
  player.group.add(shadow);
  shadow.position.set(0, -player.group.position.y + 0.03, 0);

  const vehicle = createSprite(
    loader,
    VEHICLE_BY_DEPARTMENT.HOME_URGENT!,
    [2.8, 1.65],
    [0, 0.85, -48],
  );
  vehicle.visible = false;
  root.add(vehicle);

  const roomLayer = new THREE.Group();
  roomLayer.visible = false;
  scene.add(roomLayer);

  let postProcessing: PostProcessingHandle | null = null;
  try {
    postProcessing = createPostProcessing(renderer, scene, camera, day, coarse);
  } catch {
    /* graceful fallback: render without post-processing */
  }
  // Too slow with the glow on (software WebGL, a weak phone)? Drop it once.
  const glowGovernor = createFrameGovernor();

  let model = initialModel;
  let lastMs = performance.now();
  let nearbyShopId: string | null = null;
  let insideShopId: string | null = null;
  let moveCommand: WorldMoveCommand = { x: 0, z: 0, sprint: false };
  let elapsed = 0;
  // The entry flight: 0 high over the street, 1 behind the walker; it runs once.
  let descend = 0;
  let leaving = false;

  const emitNear = () => {
    const shop = nearestShop(player.x, player.z);
    const next = shop?.shopId ?? null;
    if (next === nearbyShopId) return;
    nearbyShopId = next;
    onEvent({ type: "SHOP_NEAR", shopId: next });
  };

  const updateVehicle = () => {
    const route = model.route;
    const department = route?.departmentCode ?? model.departmentCode;
    if (!route || route.progress === null || !department || insideShopId) {
      vehicle.visible = false;
      return;
    }
    const step = routeAt(department, route.progress);
    const x = (step.at.u - 0.5) * 12;
    const z = 4 - step.at.v * 68;
    vehicle.position.set(x, 0.8 + step.scale * 0.3, z);
    vehicle.scale.set(2.2 * step.scale, 1.3 * step.scale, 1);
    vehicle.visible = model.mode === "ROUTE";
  };

  const updateVehicleAsset = () => {
    const id = VEHICLE_BY_DEPARTMENT[model.departmentCode ?? ""] ?? "courier_scooter";
    const material = vehicle.material as THREE.SpriteMaterial;
    material.map = loadTexture(loader, id);
    material.needsUpdate = true;
  };

  const enterShop = () => {
    if (!nearbyShopId || insideShopId) return;
    const trade = tradeForShop(model, nearbyShopId);
    if (!trade || !canEnterTrade(trade)) return;
    const key = trade.interiorAssetId as WorldAssetId;
    if (!(key in WORLD_ASSETS)) return;
    insideShopId = nearbyShopId;
    for (const child of roomLayer.children) disposeObject(child);
    roomLayer.clear();
    roomLayer.add(createRoom(loadTexture(loader, key)));
    roomLayer.visible = true;
    root.visible = false;
    onEvent({ type: "ENTER_SHOP", shopId: insideShopId });
  };

  return {
    update(nextModel) {
      const departmentChanged = nextModel.departmentCode !== model.departmentCode;
      model = nextModel;
      if (departmentChanged) updateVehicleAsset();
      if (nextModel.shopId && nextModel.shopId !== insideShopId) {
        nearbyShopId = nextModel.shopId;
        enterShop();
      }
      updateVehicle();
    },
    move(command: WorldMoveCommand) {
      moveCommand = command;
    },
    enter: enterShop,
    render(nowMs) {
      const dt = Math.min(0.05, Math.max(0, (nowMs - lastMs) / 1000));
      elapsed += dt;

      const reducedMotion =
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
      if (insideShopId) {
        followInsideShop(camera, reducedMotion);
      } else if (model.mode === "EXPLORE" || model.mode === "ROUTE") {
        // The walk keeps its own 200 ms cap (#62): a slow renderer (SwiftShader
        // in CI at 2-3 fps) must still cover ground. Animations use the 50 ms dt.
        // The entry's descent uses it too, so it takes 1.9 s on any renderer.
        const walkDt = Math.min(0.2, Math.max(0, (nowMs - lastMs) / 1000));
        const moving = moveCommand.x !== 0 || moveCommand.z !== 0;
        if (moving) {
          leaving = true;
          movePlayer(player, moveCommand, walkDt);
          emitNear();
          tintPlayerFromLamps();
        }

        // As in the demo: the world opens high over the street and the first
        // move flies the camera down behind the walker. Standing by a shop
        // frames it; walking on brings the camera back in behind you.
        if (reducedMotion) descend = 1;
        else if (leaving && descend < 1) descend = Math.min(1, descend + walkDt / DESCENT_SECONDS);
        const nearShop = nearestShop(player.x, player.z, 6);
        const ground =
          nearShop && !moving
            ? shopPose(player.group.position, nearShop)
            : followPose(player.group.position);
        easeTowards(
          camera,
          entryPose(player.group.position, smoothstep01(descend), ground),
          followFactor(walkDt),
          reducedMotion,
        );
      } else {
        frameStreet(camera, reducedMotion);
      }

      // Ambient loops (flicker, steam, walkers, traffic) are decoration: with
      // reduced motion they hold still. The player and camera still move.
      if (!reducedMotion) for (const fn of ticking) fn(dt, elapsed);

      lendEveningLights(dt);
      // A projecting sign seen edge-on fades rather than becoming a streak.
      if (root.visible) for (const front of shopFronts) front.face(camera.position);

      // The shadow box rides a few metres ahead of the camera, as in the demo.
      camera.getWorldDirection(cameraDirection);
      aimSun(sun, shadowFocus(camera.position, cameraDirection, sunFocus));

      if (postProcessing && glowGovernor.record(nowMs - lastMs) === "drop") {
        postProcessing.dispose();
        postProcessing = null;
      }
      if (postProcessing) {
        postProcessing.render(nowMs);
      } else {
        renderer.render(scene, camera);
      }
      lastMs = nowMs;
    },
    resize(width: number, height: number) {
      postProcessing?.resize(width, height);
    },
    onArtReady(listener: () => void) {
      if (artReady) listener();
      else artListeners.push(listener);
    },
    dispose() {
      disposeObject(root);
      disposeObject(roomLayer);
      scene.remove(hemi, sun, sun.target, root, roomLayer);
      sun.dispose();
      scene.background = previousBackground;
      skyBackground.dispose();
      postProcessing?.dispose();
    },
  };
}
