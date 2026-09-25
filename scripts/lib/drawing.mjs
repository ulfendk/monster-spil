// Turns a phone photo of a child's drawing (on white paper) into a game sprite:
//   photo → flat, white-balanced paper → the drawing's ink and colours → the monster's
//   silhouette → a small palette nudged towards the game's Kanagawa colours → vector
//   shapes (imagetracerjs) → an SVG with a woodblock-style ink outline → PNG (sharp).
// Used by scripts/add-creature.mjs; every step is a plain function over pixel buffers.
import sharp from "sharp";
import ImageTracer from "imagetracerjs";

/** The game's palette (client/src/ui/theme.ts, KANAGAWA): colours are nudged towards these. */
const KANAGAWA = {
  autumnRed: [0xc3, 0x40, 0x43], samuraiRed: [0xe8, 0x24, 0x24], waveRed: [0xe4, 0x68, 0x76], peachRed: [0xff, 0x5d, 0x62],
  surimiOrange: [0xff, 0xa0, 0x66], carpYellow: [0xe6, 0xc3, 0x84], boatYellow2: [0xc0, 0xa3, 0x6e], boatYellow1: [0x93, 0x80, 0x56],
  autumnGreen: [0x76, 0x94, 0x6a], springGreen: [0x98, 0xbb, 0x6c], waveAqua2: [0x7a, 0xa8, 0x9f],
  crystalBlue: [0x7e, 0x9c, 0xd8], springBlue: [0x7f, 0xb4, 0xca], waveBlue2: [0x2d, 0x4f, 0x67],
  oniViolet: [0x95, 0x7f, 0xb8], sakuraPink: [0xd2, 0x7e, 0x99], fujiGray: [0x72, 0x71, 0x69], oldWhite: [0xc8, 0xc0, 0x93],
};
const INK = [0x16, 0x16, 0x1d];
const WASHI = [0xf0, 0xe6, 0xd2];
/** How far a drawn colour moves towards the nearest Kanagawa colour (0 = as drawn, 1 = fully themed). */
const THEME_PULL = 0.5;

const WORK = 1400; // longest side while cleaning
const TRACE = 480; // longest side of the monster when traced

export class DrawingError extends Error {}

/** Reads a photo, turned upright by its EXIF orientation, at a working size. */
export async function loadPhoto(file) {
  try {
    const { data, info } = await sharp(file, { failOn: "none" })
      .rotate()
      .resize({ width: WORK, height: WORK, fit: "inside", withoutEnlargement: true })
      .removeAlpha()
      .toColourspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch (error) {
    if (/heif|heic/i.test(String(error)) || /\.heic$/i.test(file)) {
      throw new DrawingError(
        `Kan ikke læse ${file} (HEIC). Konvertér den til JPEG først, fx med "heif-convert ${file} tegning.jpg", ` +
          `eller sæt iPhonens kamera til »Mest kompatibel« (Indstillinger → Kamera → Formater).`
      );
    }
    throw new DrawingError(`Kan ikke læse billedet ${file}: ${error.message}`);
  }
}

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Least-squares quadratic surface a + bx + cy + dx² + exy + fy², per colour channel, over the given blocks. */
function fitSurface(blocks, paper, bw, bh) {
  const terms = (bx, by) => {
    const x = bx / bw - 0.5;
    const y = by / bh - 0.5;
    return [1, x, y, x * x, x * y, y * y];
  };
  const coeffs = [];
  for (let c = 0; c < 3; c++) {
    const A = Array.from({ length: 6 }, () => new Array(7).fill(0));
    for (const b of blocks) {
      const t = terms(b.bx, b.by);
      const v = paper[b.i * 3 + c];
      for (let r = 0; r < 6; r++) {
        for (let k = 0; k < 6; k++) A[r][k] += t[r] * t[k];
        A[r][6] += t[r] * v;
      }
    }
    for (let r = 0; r < 6; r++) A[r][r] += 1e-6; // keep it solvable with few blocks
    // Gaussian elimination.
    for (let col = 0; col < 6; col++) {
      let piv = col;
      for (let r = col + 1; r < 6; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
      [A[col], A[piv]] = [A[piv], A[col]];
      for (let r = 0; r < 6; r++) {
        if (r === col || !A[col][col]) continue;
        const f = A[r][col] / A[col][col];
        for (let k = col; k < 7; k++) A[r][k] -= f * A[col][k];
      }
    }
    coeffs.push(A.map((row, r) => (row[r] ? row[6] / row[r] : 0)));
  }
  return { coeffs, terms };
}
function evalSurface(fit, bx, by, bw, bh) {
  const t = fit.terms(bx, by);
  return fit.coeffs.map((k) => k.reduce((sum, v, i) => sum + v * t[i], 0));
}
function residual(b, paper, fit, bw, bh) {
  const f = evalSurface(fit, b.bx, b.by, bw, bh);
  let d = 0;
  for (let c = 0; c < 3; c++) d += Math.abs(paper[b.i * 3 + c] - f[c]);
  return d / 3 / Math.max(1, (f[0] + f[1] + f[2]) / 3);
}

/**
 * Evens out the paper: estimates the paper's colour across the photo (shadows, a
 * yellow lamp, the flash's bright spot) from the brightest pixels in each block, and
 * divides it out, so the paper becomes flat white and the drawing keeps its colours.
 */
export function flattenPaper({ data, width, height }) {
  const B = 48;
  const bw = Math.ceil(width / B);
  const bh = Math.ceil(height / B);
  const paper = new Float32Array(bw * bh * 3);
  const bright = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const px = [];
      for (let y = by * B; y < Math.min(height, by * B + B); y += 2)
        for (let x = bx * B; x < Math.min(width, bx * B + B); x += 2) {
          const i = (y * width + x) * 3;
          px.push([lum(data[i], data[i + 1], data[i + 2]), data[i], data[i + 1], data[i + 2]]);
        }
      px.sort((a, b) => b[0] - a[0]);
      const top = px.slice(0, Math.max(1, Math.floor(px.length * 0.2)));
      const k = (by * bw + bx) * 3;
      for (let c = 0; c < 3; c++) paper[k + c] = top.reduce((s, p) => s + p[c + 1], 0) / top.length;
      bright[by * bw + bx] = top.reduce((s, p) => s + p[0], 0) / top.length;
    }
  }
  // Pale crayon is bright too, so brightness alone can't tell paper from drawing. Fit a smooth
  // light model (a quadratic surface per channel) to the blocks, dropping blocks that don't fit
  // it (tinted, or darker), and use a block's own estimate only where it agrees with the model.
  const blocks = [];
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) blocks.push({ bx, by, i: by * bw + bx });
  const chromaOfBlock = (i) => Math.max(paper[i * 3], paper[i * 3 + 1], paper[i * 3 + 2]) - Math.min(paper[i * 3], paper[i * 3 + 1], paper[i * 3 + 2]);
  const chromas = blocks.map((b) => chromaOfBlock(b.i)).sort((a, b) => a - b);
  const typicalChroma = chromas[Math.floor(chromas.length / 2)];
  const sortedBright = [...bright].sort((a, b) => a - b);
  const ref = sortedBright[Math.floor(sortedBright.length * 0.9)];
  let use = blocks.filter((b) => chromaOfBlock(b.i) < typicalChroma + 14 && bright[b.i] > ref * 0.6);
  let fit = fitSurface(use, paper, bw, bh);
  for (let round = 0; round < 4; round++) {
    const kept = use.filter((b) => residual(b, paper, fit, bw, bh) < 0.07);
    if (kept.length < 6) break;
    use = kept;
    fit = fitSurface(use, paper, bw, bh);
  }
  for (const b of blocks) {
    if (residual(b, paper, fit, bw, bh) < 0.05) continue;
    const f = evalSurface(fit, b.bx, b.by, bw, bh);
    for (let c = 0; c < 3; c++) paper[b.i * 3 + c] = f[c];
  }
  const out = Buffer.alloc(data.length);
  for (let y = 0; y < height; y++) {
    const fy = Math.min(bh - 1.001, Math.max(0, y / B - 0.5));
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.min(bw - 1.001, Math.max(0, x / B - 0.5));
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const i = (y * width + x) * 3;
      for (let c = 0; c < 3; c++) {
        const p = (bx, by) => paper[(Math.min(bh - 1, by) * bw + Math.min(bw - 1, bx)) * 3 + c];
        const est = (p(x0, y0) * (1 - tx) + p(x0 + 1, y0) * tx) * (1 - ty) + (p(x0, y0 + 1) * (1 - tx) + p(x0 + 1, y0 + 1) * tx) * ty;
        out[i + c] = Math.max(0, Math.min(255, Math.round((data[i + c] * 255) / Math.max(40, est))));
      }
    }
  }
  return { data: out, width, height };
}

/** Median filter via sharp: melts crayon grain and camera noise into even colour. */
export async function smooth({ data, width, height }, size = 5) {
  const buf = await sharp(data, { raw: { width, height, channels: 3 } }).median(size).raw().toBuffer();
  return { data: buf, width, height };
}

/** A light Gaussian blur via sharp, against camera noise without losing thin lines. */
async function blur({ data, width, height }, sigma) {
  const buf = await sharp(data, { raw: { width, height, channels: 3 } }).blur(sigma).raw().toBuffer();
  return { data: buf, width, height };
}

/** How much a pixel looks like drawing rather than paper: darkness or colour. */
function inkness(r, g, b) {
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  return Math.max(255 - lum(r, g, b), chroma * 1.6);
}

/** Otsu's threshold on a 0–255 histogram, kept within [lo, hi]. */
function otsu(hist, lo, hi) {
  const total = hist.reduce((a, b) => a + b, 0);
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = lo;
  let bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) ** 2;
    if (v > bestVar) {
      bestVar = v;
      best = t;
    }
  }
  return Math.max(lo, Math.min(hi, best));
}

// ---- binary masks (Uint8Array of 0/1)

function dilate(mask, w, h, r) {
  // Separable: a square of side 2r+1, done as a row pass and then a column pass.
  const rows = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (mask[y * w + x]) for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) rows[y * w + k] = 1;
  const out = new Uint8Array(mask.length);
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) if (rows[y * w + x]) for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) out[k * w + x] = 1;
  return out;
}
const invert = (m) => m.map((v) => 1 - v);
const erode = (mask, w, h, r) => invert(dilate(invert(mask), w, h, r));
const close = (mask, w, h, r) => erode(dilate(mask, w, h, r), w, h, r);

/** Connected pieces of a mask (4-neighbour), with their size and bounding box. */
function components(mask, w, h) {
  const label = new Int32Array(mask.length).fill(-1);
  const comps = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start] >= 0) continue;
    const id = comps.length;
    const c = { id, size: 0, x0: w, y0: h, x1: 0, y1: 0, border: false };
    const stack = [start];
    label[start] = id;
    while (stack.length) {
      const i = stack.pop();
      const x = i % w;
      const y = (i - x) / w;
      c.size++;
      c.x0 = Math.min(c.x0, x); c.x1 = Math.max(c.x1, x); c.y0 = Math.min(c.y0, y); c.y1 = Math.max(c.y1, y);
      if (x < 3 || y < 3 || x >= w - 3 || y >= h - 3) c.border = true;
      for (const n of [i - 1, i + 1, i - w, i + w]) {
        if (n < 0 || n >= mask.length || label[n] >= 0 || !mask[n]) continue;
        if ((n === i - 1 && x === 0) || (n === i + 1 && x === w - 1)) continue;
        label[n] = id;
        stack.push(n);
      }
    }
    comps.push(c);
  }
  return { label, comps };
}

/** Everything a flood from the image edge can't reach through `walls`: the shape including its insides. */
function fillFromOutside(walls, w, h) {
  const outside = new Uint8Array(walls.length);
  const stack = [];
  const push = (i) => { if (!walls[i] && !outside[i]) { outside[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < walls.length - w) push(i + w);
  }
  return invert(outside);
}

/**
 * Finds the drawing: the ink that belongs together in the middle of the paper. Specks,
 * the paper's edge, the table and fingers at the border are left out. Returns the ink
 * mask and the monster's filled silhouette.
 */
export function findDrawing(img) {
  const { data, width: w, height: h } = img;
  const ink = new Uint8Array(w * h);
  const hist = new Array(256).fill(0);
  const score = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const s = Math.min(255, Math.round(inkness(data[i * 3], data[i * 3 + 1], data[i * 3 + 2])));
    score[i] = s;
    hist[s]++;
  }
  const t = otsu(hist, 28, 90);
  for (let i = 0; i < w * h; i++) ink[i] = score[i] > t ? 1 : 0;

  const scale = Math.max(w, h) / WORK;
  const joined = close(ink, w, h, Math.max(1, Math.round(2 * scale)));
  const { label, comps } = components(joined, w, h);
  const minSize = w * h * 0.0004;
  // Big pieces can start the drawing; small ones (a broken pencil line, an eye) only join when they're close to it.
  const inner = comps.filter((c) => !c.border && c.size >= minSize / 8).sort((a, b) => b.size - a.size);
  if (inner.length && inner[0].size < minSize) inner.length = 0;
  if (!inner.length) throw new DrawingError("Kan ikke finde en tegning på billedet. Er der nok lys, og er hele tegningen med?");
  // Grow from the biggest piece: anything close to what we already have belongs to the drawing.
  const keep = new Set([inner[0].id]);
  const box = { ...inner[0] };
  const gap = Math.max(w, h) * 0.06;
  for (let grew = true; grew; ) {
    grew = false;
    for (const c of inner) {
      if (keep.has(c.id)) continue;
      if (c.x1 >= box.x0 - gap && c.x0 <= box.x1 + gap && c.y1 >= box.y0 - gap && c.y0 <= box.y1 + gap) {
        keep.add(c.id);
        Object.assign(box, { x0: Math.min(box.x0, c.x0), y0: Math.min(box.y0, c.y0), x1: Math.max(box.x1, c.x1), y1: Math.max(box.y1, c.y1) });
        grew = true;
      }
    }
  }
  const drawing = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (label[i] >= 0 && keep.has(label[i]) && ink[i]) drawing[i] = 1;
  // Lines: the drawing's dark, uncoloured pixels (marker, pen, pencil) — they become sumi ink.
  const line = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!drawing[i]) continue;
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) < 34 && lum(r, g, b) < 215) line[i] = 1;
  }
  // The silhouette: close the outline's little gaps, then fill everything the outside can't reach.
  const walls = close(drawing, w, h, Math.max(2, Math.round(6 * scale)));
  let silhouette = fillFromOutside(walls, w, h);
  silhouette = dilate(erode(silhouette, w, h, 1), w, h, 1); // smooth off single-pixel spurs
  return { ink: line, silhouette, box };
}

/** Crops to the silhouette (with a margin) and scales so the longer side is `size`. */
export async function crop(img, masks, size = TRACE) {
  const { width: w, height: h } = img;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (masks.silhouette[y * w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const k = size / Math.max(cw, ch);
  const ow = Math.max(8, Math.round(cw * k));
  const oh = Math.max(8, Math.round(ch * k));
  // RGB + silhouette + ink as a 5-channel-ish pair of images, resized the same way.
  const rgba = Buffer.alloc(cw * ch * 4);
  const inkBuf = Buffer.alloc(cw * ch);
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const si = (y + y0) * w + (x + x0);
      const di = y * cw + x;
      for (let c = 0; c < 3; c++) rgba[di * 4 + c] = img.data[si * 3 + c];
      rgba[di * 4 + 3] = masks.silhouette[si] ? 255 : 0;
      inkBuf[di] = masks.ink[si] ? 255 : 0;
    }
  const colour = await sharp(rgba, { raw: { width: cw, height: ch, channels: 4 } }).resize(ow, oh, { kernel: "lanczos3" }).raw().toBuffer();
  // Area-averaged, with a low threshold, so a thin line still shows after shrinking.
  const small = await sharp(inkBuf, { raw: { width: cw, height: ch, channels: 1 } }).resize(ow, oh, { kernel: "cubic" }).raw().toBuffer({ resolveWithObject: true });
  // sharp may hand a one-channel image back with more channels: read the first of each pixel.
  const inkChannels = small.info.channels;
  const inkSmall = { length: ow * oh, at: (i) => small.data[i * inkChannels] };
  const silhouette = new Uint8Array(ow * oh);
  const ink = new Uint8Array(ow * oh);
  for (let i = 0; i < ow * oh; i++) {
    silhouette[i] = colour[i * 4 + 3] >= 128 ? 1 : 0;
    ink[i] = inkSmall.at(i) >= Math.max(40, Math.round(128 * k)) ? 1 : 0;
  }
  return { rgba: colour, width: ow, height: oh, silhouette, ink };
}

// ---- colour

const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const chromaOf = (c) => Math.max(...c) - Math.min(...c);

/** Seeded k-means on RGB colours (deterministic, so the same photo gives the same sprite). */
function kmeans(points, k) {
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const centres = [points[Math.floor(rand() * points.length)]];
  while (centres.length < k) {
    // k-means++: the next centre far from the ones we have.
    const d = points.map((p) => Math.min(...centres.map((c) => dist2(p, c))));
    const total = d.reduce((a, b) => a + b, 0);
    if (total === 0) break;
    let r = rand() * total;
    let i = 0;
    while ((r -= d[i]) > 0 && i < d.length - 1) i++;
    centres.push(points[i]);
  }
  const assign = new Int32Array(points.length);
  for (let iter = 0; iter < 12; iter++) {
    const sums = centres.map(() => [0, 0, 0, 0]);
    points.forEach((p, i) => {
      let best = 0;
      let bd = Infinity;
      centres.forEach((c, j) => { const dd = dist2(p, c); if (dd < bd) { bd = dd; best = j; } });
      assign[i] = best;
      const s = sums[best];
      s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    });
    sums.forEach((s, j) => { if (s[3]) centres[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
  }
  return { centres, assign };
}

function nearestKanagawa(c) {
  let best = null;
  let bd = Infinity;
  for (const k of Object.values(KANAGAWA)) {
    const d = dist2(c, k);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

function toHsv([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max / 255];
}
function fromHsv([h, s, v]) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/**
 * A drawn colour made bold and even (crayon on a photo looks pale: paper grain shows
 * through), then nudged towards the nearest Kanagawa colour.
 */
function theme(c) {
  const [h, s, v] = toHsv(c);
  const bold = fromHsv([h, Math.max(s, 0.55), Math.min(0.95, Math.max(v, 0.62))]);
  const k = nearestKanagawa(bold);
  return bold.map((x, i) => Math.round(x * (1 - THEME_PULL) + k[i] * THEME_PULL));
}

/**
 * Gives every silhouette pixel one colour from a small palette: the dark lines become
 * sumi ink, uncoloured paper inside the monster becomes warm washi paper, and the drawn
 * colours are clustered, made bolder and nudged towards Kanagawa. Returns labels
 * (-1 = outside) and the palette.
 */
export function quantize(cropped) {
  const { rgba, width: w, height: h, silhouette, ink } = cropped;
  const colourPts = [];
  const colourIdx = [];
  const label = new Int16Array(w * h).fill(-1);
  const INK_L = 0;
  const WASHI_L = 1;
  for (let i = 0; i < w * h; i++) {
    if (!silhouette[i]) continue;
    const c = [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]];
    const l = lum(...c);
    const ch = chromaOf(c);
    if (ink[i] || (l < 80 && ch < 50)) label[i] = INK_L;
    else if (ch < 16) label[i] = WASHI_L;
    else {
      colourPts.push(c);
      colourIdx.push(i);
    }
  }
  const palette = [INK, WASHI];
  if (colourPts.length > 20) {
    const k = Math.min(6, Math.max(1, Math.round(colourPts.length / 4000) + 2));
    const sample = colourPts.length > 20000 ? colourPts.filter((_, i) => i % Math.ceil(colourPts.length / 20000) === 0) : colourPts;
    const { centres: raw, assign } = kmeans(sample, k);
    // Each cluster's colour from its most saturated pixels: the crayon itself, not the paper grain between.
    const centres = raw.map((c, j) => {
      const mine = sample.filter((_, i) => assign[i] === j).sort((a, b) => chromaOf(b) - chromaOf(a));
      const top = mine.slice(0, Math.max(1, Math.ceil(mine.length * 0.3)));
      return top.length ? [0, 1, 2].map((ch) => top.reduce((sum, p) => sum + p[ch], 0) / top.length) : c;
    });
    // Merge clusters that end up (almost) the same colour after theming.
    const themed = [];
    const map = centres.map((c) => {
      const t = theme(c);
      const same = themed.findIndex((u) => dist2(u, t) < 30 * 30);
      if (same >= 0) return same;
      themed.push(t);
      return themed.length - 1;
    });
    colourIdx.forEach((i, n) => {
      const c = colourPts[n];
      let best = 0;
      let bd = Infinity;
      centres.forEach((ce, j) => { const d = dist2(c, ce); if (d < bd) { bd = d; best = j; } });
      label[i] = 2 + map[best];
    });
    palette.push(...themed);
  } else {
    for (const i of colourIdx) label[i] = WASHI_L;
  }
  return { label, palette, width: w, height: h };
}

/** Majority filter: each coloured pixel takes the most common colour around it (inside the silhouette). Removes crayon speckle; ink lines are kept. */
export function majority(q, r = 2, rounds = 2) {
  const { width: w, height: h } = q;
  let label = q.label;
  for (let round = 0; round < rounds; round++) {
    const next = new Int16Array(label);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        // Lines stay as drawn (a thin pencil line would lose every vote), and don't vote either.
        if (label[i] <= 0) continue;
        const count = new Map();
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const l = label[yy * w + xx];
            if (l > 0) count.set(l, (count.get(l) ?? 0) + 1);
          }
        let best = label[i];
        let bc = 0;
        for (const [l, c] of count) if (c > bc) { bc = c; best = l; }
        next[i] = best;
      }
    label = next;
  }
  return { ...q, label };
}

/** Lines at least ~3 px wide at trace size, so thin pencil lines survive tracing and read at sprite size. */
export function thickenInk(q) {
  const { width: w, height: h, label } = q;
  const next = new Int16Array(label);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (label[i] <= 0) continue; // outside, or already ink
      if ((x > 0 && label[i - 1] === 0) || (x < w - 1 && label[i + 1] === 0) || (y > 0 && label[i - w] === 0) || (y < h - 1 && label[i + w] === 0)) next[i] = 0;
    }
  return { ...q, label: next };
}

// ---- vectors

const hex = ([r, g, b]) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** Traces one palette image with imagetracerjs and returns its <path> elements (transparent layer left out). */
function tracePaths(width, height, label, palette, pathomit) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const l = label[i];
    if (l < 0) continue;
    const c = palette[l];
    data[i * 4] = c[0]; data[i * 4 + 1] = c[1]; data[i * 4 + 2] = c[2]; data[i * 4 + 3] = 255;
  }
  const pal = [{ r: 0, g: 0, b: 0, a: 0 }, ...palette.map(([r, g, b]) => ({ r, g, b, a: 255 }))];
  const svg = ImageTracer.imagedataToSVG({ width, height, data }, {
    pal, colorquantcycles: 1, ltres: 1, qtres: 1, pathomit, rightangleenhance: false,
    blurradius: 0, strokewidth: 1, linefilter: true, roundcoords: 1, viewbox: true, desc: false, scale: 1,
  });
  return [...svg.matchAll(/<path[^>]*\/>/g)].map((m) => m[0]).filter((p) => !/opacity="0"/.test(p) && !/rgba?\(0,0,0,0\)/.test(p));
}

/**
 * The finished monster as SVG: a bold sumi-ink edge around the whole silhouette (like a
 * woodblock print's key block), the traced colour shapes on top, on a transparent square.
 */
export function toSvg(q) {
  const { width: w, height: h, label, palette } = q;
  const size = Math.max(w, h);
  const outline = Math.round(size * 0.012);
  const pad = outline * 2;
  const silhouette = Int16Array.from(label, (l) => (l >= 0 ? 0 : -1));
  const edge = tracePaths(w, h, silhouette, [INK], 24).map((p) =>
    p.replace(/stroke-width="[^"]*"/, `stroke-width="${outline * 2}"`).replace("<path", `<path stroke-linejoin="round" stroke-linecap="round"`)
  );
  const body = tracePaths(w, h, label, palette, 10);
  const view = size + pad * 2;
  const ox = pad + (size - w) / 2;
  const oy = pad + (size - h) / 2;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${view} ${view}" width="${view}" height="${view}">`,
    `<g transform="translate(${ox} ${oy})">`,
    `<g>${edge.join("")}</g>`,
    `<g>${body.join("")}</g>`,
    `</g></svg>`,
  ].join("");
}

/** Renders the SVG as a square PNG (transparent background). `back` = seen from behind: mirrored and a little darker. */
export async function render(svg, size, { back = false } = {}) {
  let img = sharp(Buffer.from(svg), { density: 300 }).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
  if (back) img = img.flop().modulate({ brightness: 0.82, saturation: 0.9 });
  return img.png({ compressionLevel: 9 }).toBuffer();
}

/** The whole pipeline for one photo: returns the SVG, and in-between pictures for the preview. */
export async function drawingToSvg(file) {
  const photo = await loadPhoto(file);
  const flat = flattenPaper(photo);
  // Lines are found on the sharp image (a median would erase thin pencil lines); colours come from the smoothed one.
  const masks = findDrawing(await blur(flat, 1));
  const smoothed = await smooth(flat, 5);
  const cropped = await crop(smoothed, masks);
  const q = thickenInk(majority(quantize(cropped), 2, 2));
  return { svg: toSvg(q), photo, palette: q.palette.map(hex) };
}

export { hex };
