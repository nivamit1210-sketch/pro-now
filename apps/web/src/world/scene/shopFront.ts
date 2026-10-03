import * as THREE from "three";

import { frontageYaw, type WorldShopPosition } from "./street";

/**
 * THE SHOPFRONT, DRESSED AS THE DEMO'S (tools/design-preview/src/city/street.ts,
 * `shopBay`).
 *
 * The product stood each shop's drawing in the street as a sprite: a card that
 * turned to face the camera wherever it was, stretched to 8.8 × 5.2 m whatever
 * the drawing's shape (the delivered drawings are square), and unlit, so it
 * glowed like a sticker at night. The demo's shop is:
 *
 * - the drawing as a WALL, square to the street and lit by it, at its own
 *   proportions: a bay wide, kept between 7.9 and 9.2 m tall (`facadeSize`);
 * - a cornice along the top and a canopy over the window, the projections
 *   every shopfront has, which throw the shadows that make it a building;
 * - a PROJECTING SIGN on a bracket over the pavement, the shop's name in neon
 *   on both faces, at right angles to the wall, so it faces the people walking
 *   towards it. Seen edge-on it fades rather than becoming a bright streak.
 */

/** A bay along the street (street.ts BAY). */
export const SHOP_BAY = 8.8;
/** Two storeys: the band a shopfront's height is kept in. */
export const FACADE_BAND = { min: 7.9, max: 9.2 } as const;
/** How far the drawing stands proud of the frontage line. */
export const FACADE_OUT = 0.42;

const LEDGE = new THREE.MeshStandardMaterial({ color: 0xbfae99, roughness: 0.85 });
const CANOPY = new THREE.MeshStandardMaterial({ color: 0x4a3540, roughness: 0.8 });
const TRIM = new THREE.MeshStandardMaterial({ color: 0x2b2536, roughness: 0.72, metalness: 0.18 });

export const BLADE = { arm: 2.5, armY: 6.9, top: 6.72, width: 2.2, height: 1.2 } as const;

/**
 * Width and height of a facade from its drawing's aspect (width / height),
 * the demo's rule: a bay wide at the drawing's own proportions, then kept
 * within two storeys. A tall drawing is narrowed (never stretched); a very
 * wide one is lifted to the band's floor rather than left a squat strip, so
 * it gives a little vertically. The delivered drawings are all square (8.8 m
 * square, inside the band) and are not changed at all.
 */
export function facadeSize(aspect: number, bay = SHOP_BAY, band = FACADE_BAND): { w: number; h: number } {
  let w = bay;
  let h = w / aspect;
  if (h > band.max) {
    h = band.max;
    w = Math.min(bay, h * aspect);
  } else if (h < band.min) {
    h = band.min;
    w = Math.min(bay, h * aspect);
  }
  return { w, h };
}

/**
 * How visible a flat sign is from where the viewer stands: 0 edge-on, 1
 * square-on, smoothstep between 0.12 and 0.45 of facing (the demo's).
 */
export function signFacing(normal: THREE.Vector3, toViewer: THREE.Vector3): number {
  const face = Math.abs(normal.dot(toViewer));
  const k = Math.max(0, Math.min(1, (face - 0.12) / 0.33));
  return k * k * (3 - 2 * k);
}

/** A word in neon: a wide dim halo, a tighter one, a white core (the demo's `neon`). */
function neonText(label: string, colour: string): THREE.Texture {
  const width = 1024;
  const height = 256;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const x = canvas.getContext("2d");
  if (x) {
    x.lineCap = "round";
    x.lineJoin = "round";
    x.font = `700 ${Math.round(height * 0.52)}px "Heebo", "Arial Hebrew", system-ui, sans-serif`;
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.direction = "rtl";
    const passes: Array<[number, string, number]> = [
      [26, colour, 0.22],
      [12, colour, 0.5],
      [4.5, "#fff6f8", 1],
    ];
    for (const [lineWidth, stroke, alpha] of passes) {
      x.save();
      x.globalAlpha = alpha;
      x.strokeStyle = stroke;
      x.fillStyle = stroke;
      x.lineWidth = lineWidth;
      x.shadowColor = colour;
      x.shadowBlur = lineWidth * 2.4;
      x.strokeText(label, width / 2, height / 2);
      x.fillText(label, width / 2, height / 2);
      x.restore();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function ledge(y: number, width: number, out: number, thick: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, thick, out), material);
  mesh.scale.x = width;
  mesh.position.set(0, y, out / 2 + 0.36);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

export interface ShopFront {
  group: THREE.Group;
  /** Size the facade, cornice and canopy to the drawing, once it has loaded. */
  fit(aspect: number): void;
  /** Fade the blade's faces by how square-on the viewer is to them. */
  face(viewer: THREE.Vector3): void;
}

export function createShopFront(
  shop: Pick<WorldShopPosition, "x" | "z" | "side" | "labelHe" | "neonColour">,
  drawing: THREE.Texture,
  glowTexture: THREE.Texture,
): ShopFront {
  const group = new THREE.Group();
  group.name = "shopfront";
  group.position.set(shop.x, 0, shop.z);
  // Built facing +z (out of the wall); turned to face across the street.
  group.rotation.y = frontageYaw(shop.side);

  // Lit by the street; the drawing's own painted light kept at a whisper.
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshStandardMaterial({
      map: drawing,
      emissiveMap: drawing,
      emissive: 0xffffff,
      emissiveIntensity: 0.18,
      transparent: true,
      alphaTest: 0.35,
      roughness: 0.82,
      metalness: 0.04,
      shadowSide: THREE.DoubleSide,
    }),
  );
  face.name = "shopfront-face";
  face.castShadow = face.receiveShadow = true;
  const cornice = ledge(0, 1, 0.3, 0.22, LEDGE);
  const canopy = ledge(0, 1, 0.55, 0.14, CANOPY);
  group.add(face, cornice, canopy);

  const fit = (aspect: number) => {
    const { w, h } = facadeSize(aspect > 0 && Number.isFinite(aspect) ? aspect : 1);
    face.scale.set(w, h, 1);
    face.position.set(0, h / 2, FACADE_OUT);
    cornice.scale.x = w + 0.22;
    cornice.position.y = h - 0.2;
    canopy.scale.x = w + 0.06;
    canopy.position.y = h * 0.45;
  };
  fit(1);

  // The projecting sign: an arm over the pavement, a plate on the wall, two
  // drops, and the name painted on both faces (one plane each, so neither
  // side reads backwards).
  const { arm, armY, top, width, height } = BLADE;
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, arm), TRIM);
  bracket.position.set(0, armY, arm / 2);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.5, 0.18), TRIM);
  plate.position.set(0, armY, 0.12);
  group.add(bracket, plate);
  for (const dz of [-width / 2 + 0.16, width / 2 - 0.16]) {
    const drop = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.05), TRIM);
    drop.position.set(0, top + 0.1, arm / 2 + dz);
    group.add(drop);
  }
  bracket.castShadow = plate.castShadow = true;

  const signTexture = neonText(shop.labelHe, shop.neonColour);
  const blades: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  for (const side of [1, -1] as const) {
    const blade = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({
        map: signTexture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    blade.name = "shopfront-blade";
    blade.rotation.y = (Math.PI / 2) * side;
    blade.position.set(0, top - height / 2, arm / 2);
    group.add(blade);
    blades.push(blade);
  }
  const bladeGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: new THREE.Color(shop.neonColour),
      transparent: true,
      opacity: 0.26,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  bladeGlow.scale.setScalar(4.6);
  bladeGlow.position.set(0, top - height / 2, arm / 2 + 0.05);
  group.add(bladeGlow);

  const normal = new THREE.Vector3();
  const at = new THREE.Vector3();
  const toViewer = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  return {
    group,
    fit,
    face(viewer) {
      for (const blade of blades) {
        blade.getWorldPosition(at);
        normal.set(0, 0, 1).applyQuaternion(blade.getWorldQuaternion(turn));
        toViewer.copy(viewer).sub(at).normalize();
        blade.material.opacity = signFacing(normal, toViewer);
      }
    },
  };
}
