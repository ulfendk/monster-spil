import type Phaser from "phaser";
import { KANAGAWA } from "../ui/theme";
import { variantOf } from "../content/load-variants";

/**
 * A rare variant's picture: the monster's own picture (a drawing or a placeholder) with its
 * colours turned, washed out, lightened, darkened or tinted as the variant says — baked
 * once per picture into its own texture. The ink stays ink: very dark pixels (the outlines)
 * are left alone, so it still looks drawn. Sizes are for the scenes (variantScale).
 */

/** The texture to show for a monster picture: the variant's, baked on first use, or the picture itself. */
export function pictureKey(scene: Phaser.Scene, key: string, variant: string | undefined): string {
  const v = variantOf(variant);
  const look = v?.look;
  if (!v || !look || !scene.textures.exists(key)) return key;
  const colours = look.hue || look.hueTo !== undefined || look.saturation !== undefined || look.lighten || look.darken || look.tint;
  if (!colours) return key;
  const out = `${key}~${v.id}`;
  if (scene.textures.exists(out)) return out;
  const source = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const g = canvas.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(source, 0, 0);
  const image = g.getImageData(0, 0, canvas.width, canvas.height);
  const tint = look.tint ? (KANAGAWA as Record<string, number>)[look.tint] : undefined;
  recolour(image.data, {
    hue: look.hue ?? 0,
    hueTo: look.hueTo,
    minSaturation: look.minSaturation ?? 0,
    saturation: look.saturation ?? 1,
    lighten: look.lighten ?? 0,
    darken: look.darken ?? 0,
    tint: tint === undefined ? undefined : [(tint >> 16) & 255, (tint >> 8) & 255, tint & 255],
    tintAmount: look.tintAmount ?? 0.5,
  });
  g.putImageData(image, 0, 0);
  scene.textures.addCanvas(out, canvas);
  return out;
}

/** How much bigger (or smaller) a variant is drawn. */
export function variantScale(variant: string | undefined): number {
  return variantOf(variant)?.look.size ?? 1;
}

/** Whether a variant twinkles. */
export function variantSparkles(variant: string | undefined): boolean {
  return Boolean(variantOf(variant)?.look.sparkle);
}

interface Recolour {
  hue: number;
  hueTo?: number;
  minSaturation: number;
  saturation: number;
  lighten: number;
  darken: number;
  tint?: [number, number, number];
  tintAmount: number;
}

/** Changes the colours of RGBA pixels in place (see pictureKey). */
function recolour(data: Uint8ClampedArray, r: Recolour): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! === 0) continue;
    let [h, s, l] = toHsl(data[i]!, data[i + 1]!, data[i + 2]!);
    if (l < 0.16) continue; // ink
    h = r.hueTo !== undefined ? r.hueTo / 360 : (h + r.hue / 360 + 1) % 1;
    s = Math.max(r.minSaturation, Math.min(1, s * r.saturation));
    l = l + (1 - l) * r.lighten - l * r.darken;
    let [red, green, blue] = toRgb(h, s, l);
    if (r.tint) {
      // Multiply by the tint (keeps shading), mixed in by the amount.
      const k = r.tintAmount;
      red = red * (1 - k) + ((red * r.tint[0]) / 255) * k * 1.25;
      green = green * (1 - k) + ((green * r.tint[1]) / 255) * k * 1.25;
      blue = blue * (1 - k) + ((blue * r.tint[2]) / 255) * k * 1.25;
    }
    data[i] = red;
    data[i + 1] = green;
    data[i + 2] = blue;
  }
}

function toHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function toRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255];
}
