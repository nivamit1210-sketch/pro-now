import * as THREE from "three";

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

function texture(c: HTMLCanvasElement, repeatX: number, repeatY: number): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function paving(repeat = 26): THREE.Texture {
  const [c, x] = canvas(512, 512);
  x.fillStyle = "#332b28";
  x.fillRect(0, 0, 512, 512);
  const TILE = 128;
  for (let row = 0; row < 4; row += 1) {
    const offset = row % 2 ? TILE / 2 : 0;
    for (let col = -1; col < 5; col += 1) {
      const v = Math.random() * 14 - 7;
      x.fillStyle = `rgb(${86 + v},${78 + v},${71 + v})`;
      x.fillRect(col * TILE + offset + 2, row * TILE + 2, TILE - 4, TILE - 4);
      const g = x.createRadialGradient(
        col * TILE + offset + TILE / 2, row * TILE + TILE / 2, TILE * 0.2,
        col * TILE + offset + TILE / 2, row * TILE + TILE / 2, TILE * 0.72
      );
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.28)");
      x.fillStyle = g;
      x.fillRect(col * TILE + offset + 2, row * TILE + 2, TILE - 4, TILE - 4);
    }
  }
  return texture(c, repeat, repeat * 2.4);
}

export function asphalt(): THREE.Texture {
  const [c, x] = canvas(256, 1024);
  x.fillStyle = "#26232e";
  x.fillRect(0, 0, 256, 1024);
  for (let i = 0; i < 4200; i += 1) {
    x.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
    x.fillRect(Math.random() * 256, Math.random() * 1024, 2, 2);
  }
  x.fillStyle = "rgba(226,222,236,0.55)";
  for (let y = 0; y < 1024; y += 150) x.fillRect(122, y, 9, 78);
  return texture(c, 1, 9);
}

export function plaster(tint = "#241d2b"): THREE.Texture {
  const [c, x] = canvas(256, 256);
  x.fillStyle = tint;
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i += 1) {
    const a = Math.random() * 0.05;
    x.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.6})`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
  }
  return texture(c, 3, 2);
}

export function neonGlow(colour = "#ff5f7a", size = 256): THREE.Texture {
  const [c, x] = canvas(size, size);
  x.clearRect(0, 0, size, size);
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, colour);
  g.addColorStop(0.3, colour + "88");
  g.addColorStop(1, colour + "00");
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function glow(colour = "255,180,94"): THREE.Texture {
  const [c, x] = canvas(256, 256);
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, `rgba(${colour},0.9)`);
  g.addColorStop(0.35, `rgba(${colour},0.35)`);
  g.addColorStop(1, `rgba(${colour},0)`);
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** "PRO NOW" in the brand's off-white on clear, for the vans' flanks (the demo's `wordmark`). */
export function wordmark(fg = "#F7F3FA", w = 512, h = 160): THREE.Texture {
  const [c, x] = canvas(w, h);
  x.fillStyle = fg;
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.font = `800 ${Math.round(h * 0.46)}px "Helvetica Neue", Arial, sans-serif`;
  x.letterSpacing = "4px";
  x.fillText("PRO NOW", w / 2, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
