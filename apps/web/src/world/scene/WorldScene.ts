import * as THREE from "three";
import { routeAt } from "@pro-now/types";

import type { WorldSceneFactoryArgs, WorldSceneHandle } from "../WorldCanvas";
import { WORLD_ASSETS, type WorldAssetId, worldAssetUrl } from "../assets";
import type { WorldMoveCommand, WorldSceneModel, WorldTrade } from "../types";
import { followCharacter, frameStreet, followInsideShop } from "./camera";
import {
  canEnterTrade,
  nearestShop,
  WORLD_SHOPS,
  FRONT_X,
  ROAD_HALF,
  STREET_LENGTH,
  KERB_X,
  PAVEMENT,
} from "./street";
import { createPlayer, movePlayer, createContactShadow, type PlayerState } from "./player";
import { createRoom } from "./shopRooms";
import { paving, asphalt, plaster, neonGlow, glow, skyGradient } from "./textures";

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
const FACADE_SCALE: [number, number] = [BAY_W(), 5.2];
const FACADE_Y = 2.6;

function BAY_W(): number {
  return 8.8;
}

function loadTexture(loader: THREE.TextureLoader, id: WorldAssetId): THREE.Texture {
  return loader.load(worldAssetUrl(id));
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

function buildStreetGeometry(root: THREE.Group): {
  lamps: THREE.Vector3[];
  lampLights: THREE.PointLight[];
} {
  const day = isDaytime();
  const halfStreet = STREET_LENGTH / 2;

  const pavingTex = paving(26);
  const asphaltTex = asphalt();

  const groundGeo = new THREE.PlaneGeometry(FRONT_X * 2, STREET_LENGTH);
  const leftPavement = new THREE.Mesh(
    groundGeo.clone(),
    new THREE.MeshStandardMaterial({ map: pavingTex, roughness: 0.85 }),
  );
  leftPavement.rotation.x = -Math.PI / 2;
  leftPavement.position.set(-FRONT_X / 2 - ROAD_HALF / 2, -0.02, 0);
  root.add(leftPavement);

  const rightPavement = new THREE.Mesh(
    groundGeo.clone(),
    new THREE.MeshStandardMaterial({ map: pavingTex.clone(), roughness: 0.85 }),
  );
  rightPavement.rotation.x = -Math.PI / 2;
  rightPavement.position.set(FRONT_X / 2 + ROAD_HALF / 2, -0.02, 0);
  root.add(rightPavement);

  const roadGeo = new THREE.PlaneGeometry(ROAD_HALF * 2, STREET_LENGTH);
  const road = new THREE.Mesh(
    roadGeo,
    new THREE.MeshStandardMaterial({
      map: asphaltTex,
      roughness: day ? 0.85 : 0.4,
      metalness: day ? 0 : 0.3,
    }),
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, 0);
  root.add(road);

  const kerbGeo = new THREE.BoxGeometry(0.18, 0.15, STREET_LENGTH);
  const kerbMat = new THREE.MeshStandardMaterial({ color: "#5a5060", roughness: 0.8 });
  const leftKerb = new THREE.Mesh(kerbGeo, kerbMat);
  leftKerb.position.set(-KERB_X, 0.06, 0);
  root.add(leftKerb);
  const rightKerb = new THREE.Mesh(kerbGeo.clone(), kerbMat.clone());
  rightKerb.position.set(KERB_X, 0.06, 0);
  root.add(rightKerb);

  const plasterTex = plaster();
  const buildingHeight = 8.5;
  for (let z = -halfStreet; z <= halfStreet; z += BAY_W()) {
    for (const side of [-1, 1] as const) {
      const isShop = WORLD_SHOPS.some((s) => Math.abs(s.z - z) < BAY_W() / 2 && s.side === side);
      if (isShop) continue;

      const wall = new THREE.Mesh(
        new THREE.PlaneGeometry(BAY_W(), buildingHeight),
        new THREE.MeshStandardMaterial({
          map: plasterTex.clone(),
          roughness: 0.9,
          color: "#3a3040",
        }),
      );
      wall.rotation.y = side === -1 ? 0 : Math.PI;
      wall.position.set(side * FRONT_X, buildingHeight / 2, z);
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
            win.rotation.y = side === -1 ? 0 : Math.PI;
            const wx = side * FRONT_X + side * -0.01;
            const wy = 3.2 + (s - 1) * 2.9 + 0.5;
            const wz = z + (Math.random() - 0.5) * 4;
            win.position.set(wx, wy, wz);
            root.add(win);
          }
        }
      }
    }
  }

  const lamps: THREE.Vector3[] = [];
  const lampLights: THREE.PointLight[] = [];
  const glowTex = glow();

  for (let z = -halfStreet + 10; z < halfStreet; z += LAMP_SPACING) {
    for (const side of [-1, 1] as const) {
      const lx = side * (KERB_X + PAVEMENT * 0.35);

      const poleMat = new THREE.MeshStandardMaterial({ color: "#2a2530", metalness: 0.5 });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, LAMP_HEIGHT, 6), poleMat);
      pole.position.set(lx, LAMP_HEIGHT / 2, z);
      root.add(pole);

      const armLen = 0.8;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, armLen, 4), poleMat.clone());
      arm.rotation.z = Math.PI / 2;
      arm.position.set(lx - side * armLen / 2, LAMP_HEIGHT, z);
      root.add(arm);

      if (!day) {
        const lampSprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTex,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: 0.85,
          }),
        );
        lampSprite.scale.set(3.5, 3.5, 1);
        lampSprite.position.set(lx, LAMP_HEIGHT + 0.3, z);
        root.add(lampSprite);

        const point = new THREE.PointLight("#ffcf8a", 2.4, 14, 1.5);
        point.position.set(lx, LAMP_HEIGHT - 0.2, z);
        root.add(point);
        lampLights.push(point);
      }

      lamps.push(new THREE.Vector3(lx, LAMP_HEIGHT, z));
    }
  }

  for (let z = -halfStreet + 20; z < halfStreet; z += TREE_SPACING) {
    for (const side of [-1, 1] as const) {
      const tx = side * (KERB_X + PAVEMENT * 0.7);
      if ("prop_palm" in WORLD_ASSETS) {
        // will be a sprite from assets if available
      }
      const trunkMat = new THREE.MeshStandardMaterial({ color: "#3d2b1a" });
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 3, 6), trunkMat);
      trunk.position.set(tx, 1.5, z);
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
      root.add(canopy);
    }
  }

  return { lamps, lampLights };
}

function buildSky(scene: THREE.Scene, day: boolean): void {
  const skyTex = skyGradient(day);
  const skyGeo = new THREE.SphereGeometry(180, 16, 8);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  if (!day) {
    const starCount = 300;
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
    const starMat = new THREE.PointsMaterial({
      color: "#ffffff",
      size: 0.6,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    scene.add(new THREE.Points(starGeo, starMat));
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
  const loader = new THREE.TextureLoader();
  const root = new THREE.Group();
  scene.add(root);

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = day ? 1.2 : 1.0;
  renderer.shadowMap.enabled = !day;
  if (renderer.shadowMap.enabled) {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  camera.fov = 72;
  camera.near = 0.1;
  camera.far = 400;
  camera.updateProjectionMatrix();

  if (day) {
    scene.fog = new THREE.FogExp2(0xc4d8ec, 0.0075);
    renderer.setClearColor(0xc4d8ec);
  } else {
    scene.fog = new THREE.FogExp2(0x2a2448, 0.0125);
    renderer.setClearColor(0x120c18);
  }

  buildSky(scene, day);

  const hemi = new THREE.HemisphereLight(
    day ? "#b8d8f0" : "#8090c0",
    day ? "#705830" : "#1a1018",
    day ? 1.9 : 0.95,
  );
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(day ? "#ffd8a8" : "#c8b8e0", day ? 2.9 : 0.8);
  sun.position.set(day ? 8 : -4, 10, 8);
  if (!day) {
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(1024);
    sun.shadow.camera.left = -14;
    sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14;
    sun.shadow.camera.bottom = -14;
  }
  scene.add(sun);

  const { lamps, lampLights } = buildStreetGeometry(root);

  const LAMP_TINT_RANGE = 14;
  const LAMP_POOL_RANGE = 40;

  /**
   * Tint the player sprite from the nearest lamp: warm under a pool of
   * light, cool-neutral between pools — the demo does this to anchor the
   * figure in the lighting rather than floating above it.
   */
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

  /**
   * Pool lamp point-lights: only the ones near the camera are active,
   * so we don't pay for dozens of PointLights across the full street.
   */
  const poolLampLights = () => {
    if (lampLights.length === 0) return;
    const cz = camera.position.z;
    for (const light of lampLights) {
      light.visible = Math.abs(light.position.z - cz) < LAMP_POOL_RANGE;
    }
  };

  for (const shop of WORLD_SHOPS) {
    const assetId = shop.assetId as WorldAssetId;
    const facade = createSprite(loader, assetId, FACADE_SCALE, [shop.x, FACADE_Y, shop.z]);
    root.add(facade);

    if (!day) {
      root.add(buildNeonHalo(shop.neonColour, new THREE.Vector3(shop.x, 3.8, shop.z), shop.side));

      const spillLight = new THREE.PointLight(shop.neonColour, 1.2, 8, 2);
      spillLight.position.set(shop.x - shop.side * 2, 2.0, shop.z);
      root.add(spillLight);
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

  let model = initialModel;
  let lastMs = performance.now();
  let nearbyShopId: string | null = null;
  let insideShopId: string | null = null;
  let moveCommand: WorldMoveCommand = { x: 0, z: 0, sprint: false };

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

  const updateShadowTarget = () => {
    if (sun.castShadow) {
      sun.shadow.camera.left = player.x - 14;
      sun.shadow.camera.right = player.x + 14;
      sun.shadow.camera.top = player.z + 14;
      sun.shadow.camera.bottom = player.z - 14;
      sun.target.position.set(player.x, 0, player.z);
      sun.target.updateMatrixWorld();
      sun.shadow.camera.updateProjectionMatrix();
    }
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
      const reducedMotion =
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
      if (insideShopId) {
        followInsideShop(camera, reducedMotion);
      } else if (model.mode === "EXPLORE" || model.mode === "ROUTE") {
        if (moveCommand.x !== 0 || moveCommand.z !== 0) {
          movePlayer(
            player,
            moveCommand,
            Math.min(0.2, Math.max(0, (nowMs - lastMs) / 1000)),
          );
          emitNear();
          updateShadowTarget();
          tintPlayerFromLamps();
        }
        poolLampLights();
        followCharacter(camera, player.group.position, reducedMotion);
      } else {
        poolLampLights();
        frameStreet(camera, reducedMotion);
      }
      renderer.render(scene, camera);
      lastMs = nowMs;
    },
    dispose() {
      disposeObject(root);
      disposeObject(roomLayer);
      scene.remove(hemi, sun, root, roomLayer);
    },
  };
}
