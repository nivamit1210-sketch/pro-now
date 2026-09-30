/**
 * A logo's brand colour (sync item E; the demo's `dominantColor`): the
 * most frequent vivid colour, ignoring white, black, greys and transparent
 * pixels. Null when the logo has no vivid colour; the swatch stays as chosen.
 */
export function dominantColorOf(rgba: ArrayLike<number>): string | null {
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const r = rgba[i]!, g = rgba[i + 1]!, b = rgba[i + 2]!, a = rgba[i + 3]!;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (a < 128 || max < 40 || min > 225 || max - min < 40) continue;
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n += 1;
    e.r += r;
    e.g += g;
    e.b += b;
    buckets.set(key, e);
  }
  const best = [...buckets.values()].sort((x, y) => y.n - x.n)[0];
  if (!best) return null;
  const hex = (v: number) => Math.round(v / best.n).toString(16).padStart(2, "0");
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`.toUpperCase();
}

/** Reads a picked logo in the browser, small, and returns its brand colour. */
export function brandColorFromFile(file: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 48;
      canvas.height = 48;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, 48, 48);
      URL.revokeObjectURL(url);
      resolve(dominantColorOf(ctx.getImageData(0, 0, 48, 48).data));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
