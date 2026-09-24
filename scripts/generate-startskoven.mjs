// Regenerates the big Startskoven map and its placeholder tileset.
//   node scripts/generate-startskoven.mjs
// Dependency-free on purpose (own PNG encoder). Writes:
//   shared/content/areas/startskoven.json          (Tiled-format export)
//   shared/content/areas/startskoven-tileset.png   (5 placeholder tiles)
// and updates playerStart in startskoven.meta.json. The map is deterministic
// (seeded), so re-running gives the same world. Once someone edits the map in
// Tiled, stop running this — the Tiled file is then the source of truth.
import { writeFileSync, readFileSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AREAS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../shared/content/areas");
const W = 64;
const H = 48;
const T = 64;

// Tile ids (Tiled gids): 1 ground, 2 tree (blocks), 3 tall grass (encounters), 4 water (blocks), 5 path
const GROUND = 1, TREE = 2, GRASS = 3, WATER = 4, PATH = 5;

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
  const tiles = 5;
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

  // 1 ground
  ground(0, [76, 175, 80]);
  speckle(0, [102, 187, 106], 4);
  // 2 tree on ground
  ground(T, [76, 175, 80]);
  for (let y = 44; y < 58; y++) for (let x = 28; x < 36; x++) set(T + x, y, [139, 58, 42]);
  disc(T, 32, 28, 24, [46, 125, 50]);
  disc(T, 26, 22, 8, [56, 142, 60]);
  // 3 tall grass (drawn over ground in its own layer)
  ground(2 * T, [46, 125, 50]);
  for (let b = 0; b < 6; b++) {
    const x = 8 + b * 10;
    const h = 22 + ((b * 7) % 12);
    for (let y = 60 - h; y < 60; y++) for (let dx = 0; dx < 3; dx++) set(2 * T + x + dx + Math.floor((60 - y) / 8) * (b % 2 ? 1 : -1), y, [129, 199, 132]);
  }
  // 4 water
  ground(3 * T, [41, 121, 200]);
  for (let row = 0; row < 3; row++) {
    const y = 12 + row * 20;
    for (let x = 6; x < T - 6; x++) {
      const wave = Math.round(2 * Math.sin((x + row * 9) / 5));
      set(3 * T + x, y + wave, [144, 202, 249]);
      set(3 * T + x, y + wave + 1, [144, 202, 249]);
    }
  }
  // 5 path
  ground(4 * T, [215, 190, 140]);
  speckle(4 * T, [190, 165, 115], 6);
  return { width, height: T, px };
}

function encodePng({ width, height, px }) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    px.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- map
const ground = new Array(W * H).fill(GROUND);
const grass = new Array(W * H).fill(0);
const at = (x, y) => y * W + x;
const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

const START = { x: 32, y: 24 };

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

// ---------------------------------------------------------------- checks
const walkable = (x, y) => inside(x, y) && ground[at(x, y)] !== TREE && ground[at(x, y)] !== WATER;
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
const grassTiles = grass.filter(Boolean).length;
let grassReachable = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (grass[at(x, y)] && reach.has(`${x},${y}`)) grassReachable++;
if (grassReachable !== grassTiles) throw new Error("some grass is unreachable");
if (!walkable(START.x, START.y)) throw new Error("start is blocked");

// ---------------------------------------------------------------- write
const existing = JSON.parse(readFileSync(path.join(AREAS, "startskoven.json"), "utf8"));
const rows = (data) => "[\n" + Array.from({ length: H }, (_, y) => "        " + data.slice(y * W, (y + 1) * W).join(",")).join(",\n") + "\n      ]";
const layer = (l, data) => ({ ...l, width: W, height: H, data });
const map = {
  ...existing,
  width: W,
  height: H,
  layers: [layer(existing.layers[0], ground), layer(existing.layers[1], grass)],
  tilesets: [{ ...existing.tilesets[0], imagewidth: 5 * T, columns: 5, tilecount: 5 }],
};
// Keep the tile data one row per line so diffs stay readable.
let json = JSON.stringify(map, (k, v) => (k === "data" ? "@@DATA@@" + JSON.stringify(v) : v), 2);
json = json.replace(/"@@DATA@@(\[[^"]*\])"/g, (_, arr) => rows(JSON.parse(arr)));
writeFileSync(path.join(AREAS, "startskoven.json"), json + "\n");
writeFileSync(path.join(AREAS, "startskoven-tileset.png"), encodePng(drawTileset()));

// The sidecar is hand-written, so patch only the two values this map depends on and leave the rest as is.
const metaPath = path.join(AREAS, "startskoven.meta.json");
const metaText = readFileSync(metaPath, "utf8")
  .replace(/"collisionGids":\s*\[[^\]]*\]/, `"collisionGids": [${TREE}, ${WATER}]`)
  .replace(/"playerStart":\s*\{[^}]*\}/, `"playerStart": { "x": ${START.x}, "y": ${START.y} }`);
writeFileSync(metaPath, metaText);

console.log(`Startskoven ${W}x${H}: ${reach.size} walkable tiles, ${grassTiles} grass tiles, ${sealed} sealed-off tiles turned to trees`);
