// Draws the Home Screen / PWA icons in the game's Kanagawa style:
//   node scripts/generate-icons.mjs
// Writes client/public/icons/icon-192.png and icon-512.png (full-bleed squares:
// iOS and Android round the corners themselves). A red rising sun, a friendly
// monster rising out of a seigaiha sea, on sumi ink. Colours match client/src/ui/theme.ts.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng } from "./lib/png.mjs";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client/public/icons");
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const K = {
  ink: hex(0x1f1f28),
  sun: hex(0xc34043),
  monster: hex(0xe6c384),
  monsterShade: hex(0xc0a36e),
  eye: hex(0x16161d),
  cheek: hex(0xd27e99),
  horn: hex(0xdcd7ba),
  sea: hex(0x2d4f67),
  foam: hex(0xdcd7ba),
};

// Everything in unit coordinates: u, v in [0, 1], v growing downwards.
const SUN = { u: 0.5, v: 0.38, r: 0.31 };
const BODY = { u: 0.5, v: 0.55, rx: 0.25, ry: 0.22 };
const SEA_TOP = 0.72;
const R = 0.125; // radius of one wave scale: four across

const inEllipse = (u, v, cu, cv, rx, ry) => ((u - cu) / rx) ** 2 + ((v - cv) / ry) ** 2 <= 1;
const inTriangle = (u, v, [ax, ay], [bx, by], [cx, cy]) => {
  const s = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
  const d1 = s(u, v, ax, ay, bx, by);
  const d2 = s(u, v, bx, by, cx, cy);
  const d3 = s(u, v, cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

/** The seigaiha sea: the lowest scale covering the point wins (it is drawn last). */
function sea(u, v) {
  let best;
  for (let n = 0; n < 8; n++) {
    const cy = SEA_TOP + (n * R) / 2;
    const offset = (n % 2) * R;
    for (let m = -1; m <= 5; m++) {
      const cx = offset + m * 2 * R;
      const d = Math.hypot(u - cx, v - cy);
      if (d <= R && v <= cy) best = d / R;
    }
  }
  if (best === undefined) return v > SEA_TOP + R ? K.sea : undefined;
  // Four concentric rings per scale, drawn as warm-white lines on indigo.
  for (const ring of [1, 0.75, 0.5, 0.25]) if (Math.abs(best - ring + 0.04) < 0.045) return K.foam;
  return K.sea;
}

function monster(u, v) {
  // Two little horns, then the round body with a slightly darker belly.
  if (inTriangle(u, v, [0.38, 0.39], [0.42, 0.27], [0.46, 0.37]) || inTriangle(u, v, [0.54, 0.37], [0.58, 0.27], [0.62, 0.39])) return K.horn;
  if (!inEllipse(u, v, BODY.u, BODY.v, BODY.rx, BODY.ry)) return undefined;
  for (const eu of [0.42, 0.58]) {
    if (inEllipse(u, v, eu, 0.51, 0.032, 0.042)) return inEllipse(u, v, eu + 0.01, 0.498, 0.011, 0.013) ? K.horn : K.eye;
    if (inEllipse(u, v, eu + (eu < 0.5 ? -0.045 : 0.045), 0.575, 0.035, 0.018)) return K.cheek;
  }
  if (inEllipse(u, v, 0.5, 0.57, 0.03, 0.022) && v > 0.57) return K.eye; // a small smile
  return v > BODY.v + 0.05 ? K.monsterShade : K.monster;
}

function colourAt(u, v) {
  return sea(u, v) ?? monster(u, v) ?? (Math.hypot(u - SUN.u, v - SUN.v) <= SUN.r ? K.sun : K.ink);
}

function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  const ss = 4; // 4×4 supersampling for smooth edges
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const [cr, cg, cb] = colourAt((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
          r += cr; g += cg; b += cb;
        }
      }
      const i = (y * size + x) * 4;
      px[i] = Math.round(r / (ss * ss));
      px[i + 1] = Math.round(g / (ss * ss));
      px[i + 2] = Math.round(b / (ss * ss));
      px[i + 3] = 255;
    }
  }
  return { width: size, height: size, px };
}

for (const size of [192, 512]) {
  writeFileSync(path.join(OUT, `icon-${size}.png`), encodePng(draw(size)));
  console.log(`icon-${size}.png`);
}
