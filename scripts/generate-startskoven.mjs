// Regenerates the big Startskoven map (160×120: the first 64×48 world in the north-west
// corner, new lands to the east and south) and its placeholder tileset.
//   node scripts/generate-startskoven.mjs
// Dependency-free on purpose (own PNG encoder). Writes:
//   shared/content/areas/startskoven.json          (Tiled-format export)
//   shared/content/areas/startskoven-tileset.png   (14 tiles: 5 landscape + 8 for natural disasters + sand)
// and updates playerStart in startskoven.meta.json. The map is deterministic
// (seeded), so re-running gives the same world. Once someone edits the map in
// Tiled, stop running this — the Tiled file is then the source of truth.
import { writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng } from "./lib/png.mjs";

const AREAS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../shared/content/areas");
const T = 64;

// Tile ids (Tiled gids): 1 ground, 2 tree (blocks), 3 tall grass (encounters), 4 water (blocks), 5 path,
// 6 mountain (blocks). The rest only appear when natural disasters change the map
// (shared/src/world/disasters.ts): 7 burnt ground, 8 crater, 9 floodwater (shallow, walkable),
// 10 fallen tree (blocks), 11 fissure (blocks), 12 rubble, 13 UFO wreck (blocks).
// 14 sand: dunes and beaches, where sand serpents rise (shared/src/raid/beasts.ts).
const GROUND = 1, TREE = 2, GRASS = 3, WATER = 4, PATH = 5, MOUNTAIN = 6;
const BURNT = 7, CRATER = 8, FLOOD = 9, LOG = 10, CRACK = 11, RUBBLE = 12, WRECK = 13, SAND = 14;
const TILE_COUNT = 14;
const BLOCKING = [TREE, WATER, MOUNTAIN, LOG, CRACK, WRECK];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260924);

// ---------------------------------------------------------------- tileset
function drawTileset() {
  const tiles = TILE_COUNT;
  const width = tiles * T;
  const px = Buffer.alloc(width * T * 4);
  const set = (x, y, [r, g, b, a = 255]) => {
    const i = (y * width + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  };
  const tileRand = rng(7);
  const ground = (ox, base) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) set(ox + x, y, base);
  };
  const speckle = (ox, colour, n) => {
    for (let k = 0; k < n; k++) {
      const x = 2 + Math.floor(tileRand() * (T - 6));
      const y = 2 + Math.floor(tileRand() * (T - 6));
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) set(ox + x + dx, y + dy, colour);
    }
  };
  const disc = (ox, cx, cy, r, colour) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) set(ox + x, y, colour);
  };

  // Kanagawa palette (see client/src/ui/theme.ts): sumi ink, wave blues, sage greens, sand.
  const K = {
    ground: [0x5f, 0x7a, 0x55], groundDot: [0x76, 0x94, 0x6a],
    pine: [0x2b, 0x33, 0x28], pineLight: [0x3f, 0x52, 0x38], bark: [0x60, 0x38, 0x2c],
    grass: [0x4b, 0x62, 0x44], blade: [0x76, 0x94, 0x6a], stem: [0x93, 0x80, 0x56], plume: [0xc0, 0xa3, 0x6e], plumeLight: [0xe6, 0xc3, 0x84],
    water: [0x22, 0x32, 0x49], water2: [0x2d, 0x4f, 0x67], foam: [0xdc, 0xd7, 0xba], spray: [0x7f, 0xb4, 0xca],
    path: [0xc0, 0xa3, 0x6e], pathDot: [0x93, 0x80, 0x56],
    rock: [0x54, 0x54, 0x6d], rockLight: [0x72, 0x71, 0x69], rockDark: [0x36, 0x36, 0x46], snow: [0xdc, 0xd7, 0xba],
    ash: [0x2a, 0x2a, 0x37], ashLight: [0x36, 0x36, 0x46], ember: [0xff, 0xa0, 0x66], emberRed: [0xc3, 0x40, 0x43],
    craterRim: [0x93, 0x80, 0x56], craterFloor: [0x49, 0x44, 0x3a], craterDeep: [0x2a, 0x27, 0x22],
    shallow: [0x3e, 0x6a, 0x88], shallowLight: [0x7f, 0xb4, 0xca],
    sand: [0xd8, 0xbd, 0x86], sandLight: [0xe6, 0xd2, 0xa4], sandRipple: [0xc0, 0xa3, 0x6e],
    ink: [0x16, 0x16, 0x1d], metal: [0xc8, 0xc0, 0x93], metalLight: [0xdc, 0xd7, 0xba], alien: [0x98, 0xbb, 0x6c],
  };
  const line = (ox, x0, y0, x1, y1, colour, w = 1) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 || 1;
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n);
      const y = Math.round(y0 + ((y1 - y0) * i) / n);
      for (let dy = 0; dy < w; dy++) for (let dx = 0; dx < w; dx++) if (x + dx >= 0 && x + dx < T && y + dy >= 0 && y + dy < T) set(ox + x + dx, y + dy, colour);
    }
  };
  const triangle = (ox, [ax, ay], [bx, by], [cx, cy], colour) => {
    const area = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const d1 = area(ax, ay, bx, by, x, y), d2 = area(bx, by, cx, cy, x, y), d3 = area(cx, cy, ax, ay, x, y);
      const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(neg && pos)) set(ox + x, y, colour);
    }
  };
  const ellipse = (ox, cx, cy, rx, ry, colour) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) set(ox + x, y, colour);
  };

  // Small V-shaped grass tufts, so plain ground reads as a meadow.
  const tuft = (ox, x, y, colour) => {
    for (let i = 0; i < 5; i++) {
      set(ox + x - i, y - i, colour);
      set(ox + x + i, y - i, colour);
      set(ox + x, y - i - 1, colour);
    }
  };

  // 1 ground: sage green with a few grass tufts
  ground(0, K.ground);
  for (const [x, y] of [[12, 16], [44, 12], [28, 38], [52, 50], [10, 54]]) tuft(0, x, y, K.groundDot);
  // 2 tree: a Japanese pine — a crooked trunk under flat, layered cloud-like canopies
  ground(T, K.ground);
  tuft(T, 12, 58, K.groundDot);
  tuft(T, 54, 60, K.groundDot);
  for (let y = 36; y < 60; y++) {
    const lean = Math.round(Math.sin((y - 36) / 7) * 3);
    for (let x = 29; x < 35; x++) set(T + x + lean, y, K.bark);
  }
  for (const [cx, cy, rx, ry] of [[32, 38, 25, 8], [24, 26, 17, 7], [40, 24, 16, 7], [32, 13, 13, 6]]) {
    ellipse(T, cx, cy, rx, ry, K.pine);
    ellipse(T, cx - 3, cy - 2, rx - 5, ry - 3, K.pineLight);
  }
  // 3 tall grass (drawn over ground in its own layer): susuki, Japanese pampas grass —
  // slender stems bending in the wind, each topped with a warm, feathery plume.
  ground(2 * T, K.grass);
  const plumeColours = [K.plume, K.plumeLight];
  for (let b = 0; b < 6; b++) {
    const baseX = 6 + b * 10 + (b % 2) * 2;
    const h = 38 + ((b * 11) % 16);
    const bend = 7 + (b % 3) * 2; // how far the tip leans right, as if in the wind
    let tipX = baseX;
    const tipY = 62 - h;
    for (let y = 62; y > tipY; y--) {
      const t = (62 - y) / h;
      const x = Math.round(baseX + bend * t * t);
      set(2 * T + x, y, K.stem);
      tipX = x;
    }
    // the plume: a soft teardrop of short strands hanging to the right of the tip
    for (let k = 0; k < 18; k++) {
      const t = k / 18;
      const px = Math.round(tipX + 1 + t * 7);
      const py = Math.round(tipY + 2 + t * 12);
      for (let d = -1; d <= 1; d++) set(2 * T + Math.min(T - 1, px + d), Math.min(T - 1, py + (d === 0 ? 0 : 1)), plumeColours[(k + d + 2) % 2]);
    }
  }
  // a few low blades at the foot
  for (let x = 2; x < T - 2; x += 5) for (let y = 56; y < 63; y++) set(2 * T + x + Math.floor((63 - y) / 3), y, K.blade);
  // 4 water: deep indigo with Great-Wave curls of foam and a little spray
  ground(3 * T, K.water2);
  // gentle darker swells that line up across tiles (whole sine periods per tile)
  for (const baseY of [10, 42]) {
    for (let x = 0; x < T; x++) {
      const y = baseY + Math.round(3 * Math.sin((x / T) * Math.PI * 2));
      set(3 * T + x, y, K.water);
      set(3 * T + x, y + 1, K.water);
    }
  }
  for (const [cx, cy] of [[18, 22], [48, 50]]) {
    // a curl: an open ring, thicker on the crest side
    for (let a = 0; a < 300; a++) {
      const t = (a / 300) * Math.PI * 1.6 + Math.PI * 0.9;
      const r = 9 - (a / 300) * 4;
      const x = Math.round(cx + Math.cos(t) * r);
      const y = Math.round(cy + Math.sin(t) * r * 0.8);
      for (let d = 0; d < 2; d++) if (x + d >= 0 && x + d < T && y >= 0 && y < T) set(3 * T + x + d, y, K.foam);
    }
  }
  for (let k = 0; k < 10; k++) {
    const x = 4 + Math.floor(tileRand() * (T - 8));
    const y = 4 + Math.floor(tileRand() * (T - 8));
    set(3 * T + x, y, K.spray);
    set(3 * T + x + 1, y, K.spray);
  }
  // 5 path: raked sand
  ground(4 * T, K.path);
  speckle(4 * T, K.pathDot, 6);

  // 6 mountain: a woodblock peak — ink-edged slate with a light flank and a snowcap
  let o = 5 * T;
  ground(o, K.ground);
  triangle(o, [32, 3], [62, 62], [2, 62], K.rockDark);
  triangle(o, [32, 7], [58, 60], [6, 60], K.rock);
  triangle(o, [32, 7], [32, 60], [6, 60], K.rockLight);
  triangle(o, [32, 7], [42, 24], [22, 24], K.snow);
  for (const [x, y] of [[26, 24], [31, 27], [37, 24]]) triangle(o, [x - 4, 24], [x + 4, 24], [x, y], K.snow);
  // 7 burnt ground: ash with glowing embers
  o = 6 * T;
  ground(o, K.ash);
  speckle(o, K.ashLight, 10);
  for (const [x, y] of [[14, 20], [44, 14], [30, 40], [52, 48], [10, 50], [38, 30]]) { disc(o, x, y, 2, K.emberRed); set(o + x, y, K.ember); }
  // 8 crater: a sandy rim around a dark, deep floor
  o = 7 * T;
  ground(o, K.ground);
  ellipse(o, 32, 32, 30, 26, K.craterRim);
  ellipse(o, 32, 34, 23, 18, K.craterFloor);
  ellipse(o, 33, 37, 13, 9, K.craterDeep);
  for (const [x, y] of [[14, 14], [50, 18], [48, 52], [12, 46]]) disc(o, x, y, 2, K.rockLight);
  // 9 floodwater: shallow, lighter water with ripples and drowned grass tips
  o = 8 * T;
  ground(o, K.shallow);
  for (const [cx, cy, r] of [[18, 20, 8], [44, 42, 10], [20, 50, 6]]) {
    for (let a = 0; a < 200; a++) {
      const t = (a / 200) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(t) * r), y = Math.round(cy + Math.sin(t) * r * 0.5);
      if (x >= 0 && x < T && y >= 0 && y < T) set(o + x, y, K.shallowLight);
    }
  }
  for (const [x, y] of [[40, 16], [10, 34], [54, 28]]) line(o, x, y, x + 2, y - 6, K.blade, 2);
  // 10 fallen tree: a pine trunk lying across the ground, rings at the cut end
  o = 9 * T;
  ground(o, K.ground);
  tuft(o, 12, 16, K.groundDot);
  line(o, 6, 40, 54, 28, K.ink, 12);
  line(o, 7, 40, 53, 28, K.bark, 8);
  disc(o, 55, 28, 7, K.ink);
  disc(o, 55, 28, 5, K.plume);
  disc(o, 55, 28, 2, K.bark);
  for (const [cx, cy] of [[16, 46], [26, 44], [36, 40]]) { ellipse(o, cx, cy, 8, 4, K.pine); ellipse(o, cx - 1, cy - 1, 5, 2, K.pineLight); }
  // 11 fissure: the ground split open, a jagged black crack edged in rock
  o = 10 * T;
  ground(o, K.ground);
  const zig = [[0, 30], [12, 24], [22, 34], [34, 26], [44, 36], [54, 28], [63, 32]];
  for (let i = 1; i < zig.length; i++) line(o, zig[i - 1][0], zig[i - 1][1], zig[i][0], zig[i][1], K.rock, 14);
  for (let i = 1; i < zig.length; i++) line(o, zig[i - 1][0], zig[i - 1][1] + 2, zig[i][0], zig[i][1] + 2, K.ink, 8);
  // 12 rubble: broken stones strewn on bare earth
  o = 11 * T;
  ground(o, K.craterFloor);
  speckle(o, K.pathDot, 8);
  for (const [x, y, r] of [[14, 16, 6], [40, 12, 5], [28, 34, 7], [50, 44, 6], [12, 50, 5], [52, 22, 4]]) { disc(o, x, y, r + 1, K.rockDark); disc(o, x, y, r, K.rockLight); disc(o, x - 1, y - 1, Math.max(1, r - 3), K.snow); }
  // 13 UFO wreck: a silver saucer nose-down in its crater, one green light still on
  o = 12 * T;
  ground(o, K.ground);
  ellipse(o, 32, 36, 30, 24, K.craterRim);
  ellipse(o, 32, 38, 22, 16, K.craterDeep);
  ellipse(o, 32, 30, 25, 9, K.ink);
  ellipse(o, 32, 30, 23, 7, K.metal);
  ellipse(o, 32, 28, 19, 3, K.metalLight);
  ellipse(o, 32, 22, 11, 8, K.ink);
  ellipse(o, 32, 22, 9, 6, K.shallowLight);
  for (const x of [16, 32, 48]) disc(o, x, 31, 2, x === 32 ? K.alien : K.emberRed);
  // 14 sand: pale dune sand with wind ripples that line up across tiles, and a few pebbles
  o = 13 * T;
  ground(o, K.sand);
  for (const baseY of [8, 24, 40, 56]) {
    for (let x = 0; x < T; x++) {
      const y = baseY + Math.round(2.5 * Math.sin((x / T) * Math.PI * 2));
      set(o + x, y, K.sandRipple);
      if (x % 3) set(o + x, y + 1, K.sandLight);
    }
  }
  for (const [x, y] of [[20, 16], [46, 33], [12, 47]]) { disc(o, x, y, 2, K.pathDot); set(o + x - 1, y - 1, K.sandLight); }
  return { width, height: T, px };
}


// ---------------------------------------------------------------- the heartland
// The first 64×48 world, which the family already knows. It is generated exactly as it
// always was (same seed, same order), then placed in the north-west corner of the big map,
// so every stored position — saves, the dragon's perch, disaster changes — stays valid.
const START = { x: 32, y: 24 };

function heartland() {
  const W = 64;
  const H = 48;
  const ground = new Array(W * H).fill(GROUND);
  const grass = new Array(W * H).fill(0);
  const at = (x, y) => y * W + x;
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

  // Border of trees.
  for (let x = 0; x < W; x++) { ground[at(x, 0)] = TREE; ground[at(x, H - 1)] = TREE; }
  for (let y = 0; y < H; y++) { ground[at(0, y)] = TREE; ground[at(W - 1, y)] = TREE; }

  // Paths: a cross through the start, plus a ring road.
  const carve = (x0, y0, x1, y1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inside(x, y)) ground[at(x, y)] = PATH;
  };
  carve(2, 24, W - 3, 24);           // east-west road
  carve(32, 2, 32, H - 3);           // north-south road
  carve(10, 10, W - 11, 10);         // north ring
  carve(10, H - 11, W - 11, H - 11); // south ring
  carve(10, 10, 10, H - 11);         // west ring
  carve(W - 11, 10, W - 11, H - 11); // east ring

  // Ponds (block movement) — kept clear of paths and the start.
  const ponds = [[18, 17, 5, 3], [46, 16, 6, 4], [16, 33, 6, 4], [48, 34, 5, 3], [32, 40, 3, 2]];
  for (const [cx, cy, rx, ry] of ponds) {
    for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
      if (!inside(x, y) || ground[at(x, y)] === PATH) continue;
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) ground[at(x, y)] = WATER;
    }
  }

  // Mountains: a ridge across the south-east (the east ring road runs through it: a pass)
  // and a small massif in the south-west. Only on open ground, so paths and ponds stay.
  const ridges = [
    [[36, 30], [40, 32], [44, 31], [48, 29], [52, 30], [56, 29], [60, 31]],
    [[4, 37], [7, 39], [10, 40], [13, 42]],
  ];
  for (const ridge of ridges) {
    for (let i = 1; i < ridge.length; i++) {
      const [x0, y0] = ridge[i - 1], [x1, y1] = ridge[i];
      for (let t = 0; t <= 1; t += 0.1) {
        const cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
        const r = 1.2 + rand() * 0.9;
        for (let y = Math.floor(cy - 3); y <= cy + 3; y++) for (let x = Math.floor(cx - 3); x <= cx + 3; x++) {
          if (inside(x, y) && ground[at(x, y)] === GROUND && (x - cx) ** 2 + (y - cy) ** 2 <= r * r) ground[at(x, y)] = MOUNTAIN;
        }
      }
    }
  }

  // Tree groves: blobs of trees that never sit on paths, water or near the start.
  const nearStart = (x, y) => Math.abs(x - START.x) < 6 && Math.abs(y - START.y) < 5;
  for (let g = 0; g < 26; g++) {
    const cx = 3 + Math.floor(rand() * (W - 6));
    const cy = 3 + Math.floor(rand() * (H - 6));
    const r = 2 + Math.floor(rand() * 3);
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (!inside(x, y) || ground[at(x, y)] !== GROUND || nearStart(x, y)) continue;
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && rand() < 0.75) ground[at(x, y)] = TREE;
    }
  }

  // Tall-grass patches (encounter zones) on open ground.
  const patches = [[20, 5, 5, 3], [44, 5, 5, 3], [6, 24, 3, 6], [56, 24, 3, 6], [22, 28, 5, 3], [42, 28, 5, 3], [20, 43, 5, 2], [44, 43, 5, 2], [32, 16, 4, 3]];
  for (const [cx, cy, rx, ry] of patches) {
    for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
      if (!inside(x, y) || ground[at(x, y)] !== GROUND) continue;
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) grass[at(x, y)] = GRASS;
    }
  }

  const walkable = (x, y) => inside(x, y) && !BLOCKING.includes(ground[at(x, y)]);
  const reach = new Set([`${START.x},${START.y}`]);
  const queue = [START];
  while (queue.length) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: x + dx, y: y + dy };
      const k = `${n.x},${n.y}`;
      if (!reach.has(k) && walkable(n.x, n.y)) { reach.add(k); queue.push(n); }
    }
  }
  // Anything walkable but cut off from the start becomes a tree, so nobody can spawn or be stranded in a pocket.
  let sealed = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (walkable(x, y) && !reach.has(`${x},${y}`)) { ground[at(x, y)] = TREE; grass[at(x, y)] = 0; sealed++; }
  }
  return { ground, grass };
}

// ---------------------------------------------------------------- the big map
const OLD = heartland();
const OW = 64;
const OH = 48;
const W = 160;
const H = 120;
const ground = new Array(W * H).fill(GROUND);
const grass = new Array(W * H).fill(0);
const at = (x, y) => y * W + x;
const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const isOld = (x, y) => x < OW && y < OH;
const isNew = (x, y) => inside(x, y) && !isOld(x, y);
for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
  ground[at(x, y)] = OLD.ground[y * OW + x];
  grass[at(x, y)] = OLD.grass[y * OW + x];
}

// The new lands have their own seed, so the heartland never changes when they do.
const wild = rng(20260926);
const between = (lo, hi) => lo + Math.floor(wild() * (hi - lo + 1));
/** A random point in the new lands, at least `m` tiles from the edges and the heartland. */
const newPoint = (m) => {
  for (;;) {
    const x = between(m, W - 1 - m), y = between(m, H - 1 - m);
    if (x >= OW + m || y >= OH + m) return { x, y };
  }
};
const fillEllipse = (cx, cy, rx, ry, paint) => {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    if (isNew(x, y) && ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) paint(x, y);
  }
};
/** Walks between waypoints one straight step at a time (so a road or river is never only diagonally connected). */
const trail = (points, paint, width = 1) => {
  for (let i = 1; i < points.length; i++) {
    let [x, y] = points[i - 1];
    const [x1, y1] = points[i];
    const dx0 = Math.abs(x1 - x), dy0 = Math.abs(y1 - y);
    const brush = () => { for (let oy = 0; oy < width; oy++) for (let ox = 0; ox < width; ox++) if (inside(x + ox, y + oy)) paint(x + ox, y + oy); };
    brush();
    while (x !== x1 || y !== y1) {
      // Step along whichever axis is further behind the straight line.
      const doneX = dx0 ? Math.abs(x1 - x) / dx0 : 0, doneY = dy0 ? Math.abs(y1 - y) / dy0 : 0;
      if (doneX >= doneY && x !== x1) x += Math.sign(x1 - x);
      else y += Math.sign(y1 - y);
      brush();
    }
  }
};

// Border of trees around the new edges (the heartland's own east and south borders stay, with gates cut through).
for (let x = 0; x < W; x++) { ground[at(x, 0)] = TREE; ground[at(x, H - 1)] = TREE; }
for (let y = 0; y < H; y++) { ground[at(0, y)] = TREE; ground[at(W - 1, y)] = TREE; }
const onEdge = (x, y) => x === 0 || y === 0 || x === W - 1 || y === H - 1;

// Storsøen: a big lake in the east with an island in it, and a river running south from it.
fillEllipse(122, 44, 16, 11, (x, y) => (ground[at(x, y)] = WATER));
fillEllipse(124, 44, 4.5, 3.2, (x, y) => (ground[at(x, y)] = GROUND));
trail([[112, 53], [106, 64], [110, 78], [103, 94], [108, 106], [106, 119]], (x, y) => { if (isNew(x, y) && !onEdge(x, y)) ground[at(x, y)] = WATER; }, 2);

// Mountains: Højfjeldet in the south-east, a ridge east of the lake and one in the north-east.
const ridges = [
  [[122, 92], [130, 96], [138, 93], [146, 97], [154, 95]],
  [[134, 104], [142, 110], [150, 107], [156, 112]],
  [[146, 80], [150, 84], [154, 82]],
  [[142, 30], [148, 35], [155, 33]],
  [[78, 6], [84, 10], [90, 8]],
];
for (const ridge of ridges) {
  for (let i = 1; i < ridge.length; i++) {
    const [x0, y0] = ridge[i - 1], [x1, y1] = ridge[i];
    for (let t = 0; t <= 1; t += 0.1) {
      const cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
      const r = 1.6 + wild() * 1.6;
      fillEllipse(cx, cy, r, r, (x, y) => { if (ground[at(x, y)] === GROUND && !onEdge(x, y)) ground[at(x, y)] = MOUNTAIN; });
    }
  }
}

// Ponds, kept away from the lake.
for (let p = 0; p < 12; p++) {
  const { x: cx, y: cy } = newPoint(6);
  if (Math.hypot(cx - 122, cy - 44) < 24) continue;
  fillEllipse(cx, cy, between(2, 5), between(2, 3), (x, y) => { if (ground[at(x, y)] === GROUND) ground[at(x, y)] = WATER; });
}

// Roads: the heartland's two main roads run on out through its border, a long road crosses
// the whole south, one runs north–south through the east, a bridge leads to the island and a
// road climbs through a pass in Højfjeldet. Roads cross water as bridges.
const roads = [
  [[62, 24], [80, 24], [92, 20], [110, 21], [140, 22], [156, 24]],
  [[32, 46], [32, 60], [30, 72], [34, 90], [31, 104], [33, 116]],
  [[2, 74], [30, 72], [60, 70], [90, 74], [120, 70], [156, 72]],
  [[96, 2], [96, 21], [98, 48], [94, 73], [97, 100], [96, 116]],
  [[124, 71], [124, 44]],
  [[120, 71], [128, 88], [134, 98], [146, 104], [156, 104]],
  [[60, 70], [64, 58], [76, 52], [96, 50]],
  [[31, 104], [50, 100], [70, 104], [96, 102]],
];
for (const r of roads) trail(r, (x, y) => { if (!onEdge(x, y)) ground[at(x, y)] = PATH; });

// Dybskoven: a deep forest in the south-west — big, dense groves packed together, with
// winding gaps between them, a few sunny clearings of tall grass and footpaths into them.
const clearings = [[14, 96, 4, 3], [46, 111, 5, 3], [18, 111, 3, 2], [52, 88, 4, 3]];
const inClearing = (x, y) => clearings.some(([cx, cy, rx, ry]) => ((x - cx) / (rx + 1)) ** 2 + ((y - cy) / (ry + 1)) ** 2 <= 1);
for (let g = 0; g < 70; g++) {
  const cx = between(2, 60), cy = between(84, H - 3), r = between(2, 5);
  fillEllipse(cx, cy, r, r, (x, y) => { if (ground[at(x, y)] === GROUND && !inClearing(x, y) && wild() < 0.92) ground[at(x, y)] = TREE; });
}
const footpaths = [[[14, 96], [22, 96], [32, 94]], [[46, 111], [40, 108], [32, 106]], [[18, 111], [24, 107], [31, 105]], [[52, 88], [52, 80], [48, 73]]];
for (const f of footpaths) trail(f, (x, y) => { if (ground[at(x, y)] === TREE || ground[at(x, y)] === GROUND) ground[at(x, y)] = PATH; });

// Tree groves all over the new lands.
for (let g = 0; g < 110; g++) {
  const { x: cx, y: cy } = newPoint(3);
  const r = between(2, 4);
  if (Math.hypot(cx - 124, cy - 44) < 8) continue; // the island stays a meadow
  fillEllipse(cx, cy, r, r, (x, y) => { if (ground[at(x, y)] === GROUND && wild() < 0.75) ground[at(x, y)] = TREE; });
}

// Tall grass (encounter zones): big meadows, the forest clearings, and patches everywhere.
const meadows = [[124, 44, 4.5, 3.2], [72, 60, 7, 4], [84, 88, 6, 4], [138, 60, 6, 3], [60, 100, 5, 3], [150, 12, 5, 3], [78, 36, 5, 4], [112, 110, 5, 3], [142, 88, 3, 2], ...clearings];
for (let p = 0; p < 34; p++) {
  const { x, y } = newPoint(5);
  meadows.push([x, y, between(2, 5), between(2, 3)]);
}
for (const [cx, cy, rx, ry] of meadows) fillEllipse(cx, cy, rx, ry, (x, y) => { if (ground[at(x, y)] === GROUND) grass[at(x, y)] = GRASS; });

// Sandklitterne: a dune field in the north-east with a small oasis, and beaches around Storsøen.
// Painted last and with its own seed, so the rest of the new lands stays exactly as it was.
const drift = rng(20261001);
fillEllipse(138, 11, 17, 8, (x, y) => {
  // A ragged edge, so it reads as drifting sand rather than a painted oval.
  const edge = ((x - 138) / 17) ** 2 + ((y - 11) / 8) ** 2;
  if (!onEdge(x, y) && [GROUND, TREE].includes(ground[at(x, y)]) && (edge < 0.7 || drift() < 0.55)) { ground[at(x, y)] = SAND; grass[at(x, y)] = 0; }
});
fillEllipse(144, 9, 2.5, 1.6, (x, y) => (ground[at(x, y)] = WATER));
const nearLake = (x, y, r) => {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (inside(x + dx, y + dy) && ground[at(x + dx, y + dy)] === WATER && Math.hypot(dx, dy) <= r + 0.3) return true;
  return false;
};
for (let y = 28; y < 60; y++) for (let x = 100; x < 144; x++) {
  if (isNew(x, y) && ground[at(x, y)] === GROUND && !grass[at(x, y)] && Math.hypot((x - 122) / 16, (y - 44) / 11) < 1.35 && nearLake(x, y, 2)) ground[at(x, y)] = SAND;
}

// Gates through the heartland's old east and south borders: the two roads above, plus a
// few footpaths, each cut through the border trees until it meets open ground on both sides.
const walkable = (x, y) => inside(x, y) && !BLOCKING.includes(ground[at(x, y)]);
/** Cuts a footpath through the border tile (x, y): trees give way inwards (−d) and outwards (+d) until open ground. */
const gate = (x, y, dx, dy) => {
  const cut = (gx, gy) => { ground[at(gx, gy)] = PATH; grass[at(gx, gy)] = 0; };
  cut(x, y);
  for (const dir of [-1, 1]) {
    for (let i = 1; i < 12; i++) {
      const gx = x + dx * i * dir, gy = y + dy * i * dir;
      if (walkable(gx, gy) || ground[at(gx, gy)] !== TREE) break;
      cut(gx, gy);
    }
  }
};
gate(OW - 1, 40, 1, 0);
gate(OW - 1, 6, 1, 0);
gate(12, OH - 1, 0, 1);
gate(52, OH - 1, 0, 1);

// ---------------------------------------------------------------- checks
const reach = new Set([`${START.x},${START.y}`]);
const queue = [START];
while (queue.length) {
  const { x, y } = queue.shift();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const n = { x: x + dx, y: y + dy };
    const k = `${n.x},${n.y}`;
    if (!reach.has(k) && walkable(n.x, n.y)) { reach.add(k); queue.push(n); }
  }
}
// Anything walkable but cut off from the start becomes a tree, so nobody can spawn or be stranded in a pocket.
let sealed = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (walkable(x, y) && !reach.has(`${x},${y}`)) {
    if (isOld(x, y)) throw new Error(`the heartland lost a tile at ${x},${y}`);
    ground[at(x, y)] = TREE; grass[at(x, y)] = 0; sealed++;
  }
}
const grassTiles = grass.filter(Boolean).length;
let grassReachable = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (grass[at(x, y)] && reach.has(`${x},${y}`)) grassReachable++;
if (grassReachable !== grassTiles) throw new Error("some grass is unreachable");
if (!walkable(START.x, START.y)) throw new Error("start is blocked");
let heartlandChanged = 0;
for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) if (ground[at(x, y)] !== OLD.ground[y * OW + x] || grass[at(x, y)] !== OLD.grass[y * OW + x]) heartlandChanged++;

// ---------------------------------------------------------------- write
const existing = JSON.parse(readFileSync(path.join(AREAS, "startskoven.json"), "utf8"));
const rows = (data) => "[\n" + Array.from({ length: H }, (_, y) => "        " + data.slice(y * W, (y + 1) * W).join(",")).join(",\n") + "\n      ]";
const layer = (l, data) => ({ ...l, width: W, height: H, data });
const map = {
  ...existing,
  width: W,
  height: H,
  layers: [layer(existing.layers[0], ground), layer(existing.layers[1], grass)],
  tilesets: [{ ...existing.tilesets[0], imagewidth: TILE_COUNT * T, columns: TILE_COUNT, tilecount: TILE_COUNT }],
};
// Keep the tile data one row per line so diffs stay readable.
let json = JSON.stringify(map, (k, v) => (k === "data" ? "@@DATA@@" + JSON.stringify(v) : v), 2);
json = json.replace(/"@@DATA@@(\[[^"]*\])"/g, (_, arr) => rows(JSON.parse(arr)));
writeFileSync(path.join(AREAS, "startskoven.json"), json + "\n");
writeFileSync(path.join(AREAS, "startskoven-tileset.png"), encodePng(drawTileset()));

// The sidecar is hand-written, so patch only the two values this map depends on and leave the rest as is.
const metaPath = path.join(AREAS, "startskoven.meta.json");
const metaText = readFileSync(metaPath, "utf8")
  .replace(/"collisionGids":\s*\[[^\]]*\]/, `"collisionGids": [${BLOCKING.join(", ")}]`)
  .replace(/"playerStart":\s*\{[^}]*\}/, `"playerStart": { "x": ${START.x}, "y": ${START.y} }`)
  .replace(/"minimap":\s*\{[^}]*\}/, `"minimap": { "tree": [${TREE}, ${LOG}], "water": [${WATER}], "path": [${PATH}], "mountain": [${MOUNTAIN}, ${CRACK}, ${WRECK}], "burnt": [${BURNT}], "crater": [${CRATER}, ${RUBBLE}], "flood": [${FLOOD}], "sand": [${SAND}] }`)
  .replace(/"terrain":\s*\{[^}]*\}/, `"terrain": ${JSON.stringify({ ground: GROUND, tree: TREE, grass: GRASS, water: WATER, path: PATH, mountain: MOUNTAIN, burnt: BURNT, crater: CRATER, flood: FLOOD, log: LOG, crack: CRACK, rubble: RUBBLE, wreck: WRECK, sand: SAND }).replace(/,/g, ", ").replace(/:/g, ": ")}`);
writeFileSync(metaPath, metaText);

console.log(`Startskoven ${W}x${H}: ${reach.size} walkable tiles, ${grassTiles} grass tiles, ${sealed} sealed-off tiles turned to trees, ${heartlandChanged} heartland tiles opened for gates`);
