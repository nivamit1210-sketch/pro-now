import * as THREE from "three";
import { routeAt } from "@pro-now/types";

import type { WorldSceneFactoryArgs, WorldSceneHandle } from "../WorldCanvas";
import { WORLD_ASSETS, type WorldAssetId, worldAssetUrl } from "../assets";
import type { WorldMoveCommand, WorldSceneModel, WorldTrade } from "../types";
import { followCharacter, frameStreet } from "./camera";
import { canEnterTrade, nearestShop, WORLD_SHOPS } from "./street";
import { createPlayer, movePlayer, type PlayerState } from "./player";
import { createRoom } from "./shopRooms";

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

function loadTexture(loader: THREE.TextureLoader, id: WorldAssetId): THREE.Texture {
  return loader.load(worldAssetUrl(id));
}

function createSprite(loader: THREE.TextureLoader, id: WorldAssetId, scale: [number, number], position: [number, number, number]): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: loadTexture(loader, id), transparent: true, depthWrite: false }));
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

export function createWorldScene({ renderer, scene, camera, model: initialModel, onEvent }: WorldSceneFactoryArgs): WorldSceneHandle {
  const loader = new THREE.TextureLoader();
  const root = new THREE.Group();
  scene.add(root);

  const ambient = new THREE.AmbientLight("#d8b8e8", 1.8);
  const key = new THREE.DirectionalLight("#ffd7a1", 2.2);
  key.position.set(-4, 10, 8);
  scene.add(ambient, key);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 78),
    new THREE.MeshStandardMaterial({ color: "#2c2136", roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.04, -30);
  root.add(ground);

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(4.8, 78),
    new THREE.MeshStandardMaterial({ color: "#55465e", roughness: 0.95 })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, -30);
  root.add(road);

  for (const shop of WORLD_SHOPS) {
    const assetId = shop.assetId as WorldAssetId;
    const facade = createSprite(loader, assetId, [4.3, 3.8], [shop.x, 1.9, shop.z]);
    root.add(facade);
  }

  const playerTexture = loadTexture(loader, "avatar_amit_walk_01");
  const player: PlayerState = createPlayer(playerTexture);
  root.add(player.group);

  const vehicle = createSprite(loader, VEHICLE_BY_DEPARTMENT.HOME_URGENT!, [2.8, 1.65], [0, 0.85, -48]);
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
    // A held key or drag is a command applied every frame (render), not a
    // step per input event: a key held without auto-repeat must still walk.
    move(command: WorldMoveCommand) {
      moveCommand = command;
    },
    enter: enterShop,
    render(nowMs) {
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
      if (insideShopId) {
        camera.position.lerp(new THREE.Vector3(0, 3.4, 8.8), reducedMotion ? 1 : 0.06);
        camera.lookAt(0, 2.8, 0);
      } else if (model.mode === "EXPLORE" || model.mode === "ROUTE") {
        if (moveCommand.x !== 0 || moveCommand.z !== 0) {
          movePlayer(player, moveCommand, Math.min(0.05, Math.max(0, (nowMs - lastMs) / 1000)));
          emitNear();
        }
        followCharacter(camera, player.group.position, reducedMotion);
      } else {
        frameStreet(camera, reducedMotion);
      }
      renderer.render(scene, camera);
      lastMs = nowMs;
    },
    dispose() {
      disposeObject(root);
      disposeObject(roomLayer);
      scene.remove(ambient, key, root, roomLayer);
    },
  };
}
