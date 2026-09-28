// Generates the worlds beyond Startskoven (each its own map, 64×48) and the ways between
// them — row boats, tunnels, a bridge:
//   node scripts/generate-worlds.mjs
// Writes, for each world, shared/content/areas/<id>.json (Tiled format), <id>-tileset.png
// (the same 16 tiles in the world's own colours: snow, ash and lava, cherry blossom) and
// <id>.meta.json; and it adds the links to Startskoven's .meta.json (Startskoven's map itself
// is not touched: the script only finds good spots on it for a dock, a tunnel mouth and a
// bridge). Deterministic (seeded). Once someone edits a world in Tiled, stop running this
// for that world — the Tiled file is then the source of truth.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng } from "./lib/png.mjs";
import { drawTileset } from "./lib/tileset.mjs";

const AREAS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../shared/content/areas");
const T = 64;
const GROUND = 1, TREE = 2, GRASS = 3, WATER = 4, PATH = 5, MOUNTAIN = 6, SAND = 14;
const BLOCKING = [2, 4, 6, 10, 11, 13];
const TERRAIN = { ground: 1, tree: 2, grass: 3, water: 4, path: 5, mountain: 6, burnt: 7, crater: 8, flood: 9, log: 10, crack: 11, rubble: 12, wreck: 13, sand: 14, stump: 15, hole: 16 };
const MINIMAP = { tree: [2, 10], water: [4], path: [5], mountain: [6, 11, 13], burnt: [7], crater: [8, 12], flood: [9], sand: [14], hole: [16], stump: [15] };

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A blank world and the brushes to paint it with. */
function canvas(W, H, seed) {
  const rand = rng(seed);
  const ground = new Array(W * H).fill(GROUND);
  const grass = new Array(W * H).fill(0);
  const at = (x, y) => y * W + x;
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const ellipse = (cx, cy, rx, ry, paint, ragged = 0) => {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      if (!inside(x, y)) continue;
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d <= 1 - ragged * rand()) paint(x, y);
    }
  };
  /** Walks between waypoints one straight step at a time (never only diagonally connected). */
  const trail = (points, paint, width = 1) => {
    for (let i = 1; i < points.length; i++) {
      let [x, y] = points[i - 1];
      const [x1, y1] = points[i];
      const dx0 = Math.abs(x1 - x), dy0 = Math.abs(y1 - y);
      const brush = () => { for (let oy = 0; oy < width; oy++) for (let ox = 0; ox < width; ox++) if (inside(x + ox, y + oy)) paint(x + ox, y + oy); };
      brush();
      while (x !== x1 || y !== y1) {
        const doneX = dx0 ? Math.abs(x1 - x) / dx0 : 0, doneY = dy0 ? Math.abs(y1 - y) / dy0 : 0;
        if (doneX >= doneY && x !== x1) x += Math.sign(x1 - x);
        else y += Math.sign(y1 - y);
        brush();
      }
    }
  };
  const border = (tile) => {
    for (let x = 0; x < W; x++) { ground[at(x, 0)] = tile; ground[at(x, H - 1)] = tile; }
    for (let y = 0; y < H; y++) { ground[at(0, y)] = tile; ground[at(W - 1, y)] = tile; }
  };
  return { W, H, rand, ground, grass, at, inside, between, ellipse, trail, border };
}

/** Walkable tiles no one can reach from `from` become trees (or `fill`), so nobody is ever stuck in a pocket. */
function seal(c, from, fill = TREE) {
  const { W, H, ground, grass, at } = c;
  const seen = new Set([at(from.x, from.y)]);
  const queue = [from];
  while (queue.length) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const i = at(nx, ny);
      if (seen.has(i) || BLOCKING.includes(ground[i])) continue;
      seen.add(i);
      queue.push({ x: nx, y: ny });
    }
  }
  let sealed = 0;
  for (let i = 0; i < W * H; i++) if (!BLOCKING.includes(ground[i]) && !seen.has(i)) { ground[i] = fill; grass[i] = 0; sealed++; }
  return { reach: seen, sealed };
}

const rows = (data, W) => "[\n" + Array.from({ length: data.length / W }, (_, r) => "        " + data.slice(r * W, r * W + W).join(",")).join(",\n") + "\n      ]";

function writeWorld(id, c, meta, palette) {
  const { W, H, ground, grass } = c;
  const layer = (lid, name, data) => ({ id: lid, name, type: "tilelayer", x: 0, y: 0, width: W, height: H, opacity: 1, visible: true, data });
  const map = {
    compressionlevel: -1,
    type: "map",
    orientation: "orthogonal",
    renderorder: "right-down",
    version: "1.10",
    tiledversion: "1.10.2",
    infinite: false,
    width: W,
    height: H,
    tilewidth: T,
    tileheight: T,
    nextlayerid: 3,
    nextobjectid: 1,
    layers: [layer(1, "bund", ground), layer(2, "graes", grass)],
    tilesets: [{ firstgid: 1, name: `${id}-tileset`, image: `${id}-tileset.png`, imagewidth: 16 * T, imageheight: T, tilewidth: T, tileheight: T, margin: 0, spacing: 0, columns: 16, tilecount: 16 }],
  };
  let json = JSON.stringify(map, (k, v) => (k === "data" ? "@@DATA@@" + JSON.stringify(v) : v), 2);
  json = json.replace(/"@@DATA@@(\[[^"]*\])"/g, (_, arr) => rows(JSON.parse(arr), W));
  writeFileSync(path.join(AREAS, `${id}.json`), json + "\n");
  writeFileSync(path.join(AREAS, `${id}-tileset.png`), encodePng(drawTileset(palette)));
  const full = {
    id,
    tiledMapPath: `areas/${id}.json`,
    tilesetImagePath: `areas/${id}-tileset.png`,
    encounterZoneLayer: "graes",
    collisionLayer: "bund",
    // Trees, water and mountains block while the map is made (so every part stays reachable on
    // foot), but in the game you walk through a forest, swim and climb — slowly. (Lava stays shut.)
    collisionGids: BLOCKING.filter((g) => g !== TREE && g !== MOUNTAIN && (g !== WATER || meta.look3d?.water === "lava")),
    slow: [{ gids: [TREE], speed: 0.5 }, ...(meta.look3d?.water === "lava" ? [] : [{ gids: [WATER], speed: 0.4 }]), { gids: [MOUNTAIN], speed: 0.35 }],
    ...meta,
    terrain: TERRAIN,
    minimap: MINIMAP,
  };
  writeFileSync(path.join(AREAS, `${id}.meta.json`), JSON.stringify(full, null, 2) + "\n");
}

/** The nearest tile to (x, y) that passes `ok`. */
function nearest(c, x, y, ok) {
  let best;
  for (let ty = 1; ty < c.H - 1; ty++) for (let tx = 1; tx < c.W - 1; tx++) {
    if (!ok(tx, ty)) continue;
    const d = Math.hypot(tx - x, ty - y);
    if (!best || d < best.d) best = { x: tx, y: ty, d };
  }
  if (!best) throw new Error(`no spot near ${x},${y}`);
  return { x: best.x, y: best.y };
}
const neighbours = (c, x, y, tile) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => c.inside(x + dx, y + dy) && c.ground[c.at(x + dx, y + dy)] === tile);

// ---------------------------------------------------------------- Kirsebærøen: an island in bloom

function kirsebaeroeen() {
  const c = canvas(64, 48, 20261101);
  const { ground, grass, at, ellipse, trail, rand, between } = c;
  ground.fill(WATER);
  // The island, ragged at the edges, with a smaller one off the east coast.
  ellipse(32, 24, 26, 18, (x, y) => (ground[at(x, y)] = GROUND), 0.18);
  ellipse(55, 12, 4, 3, (x, y) => (ground[at(x, y)] = GROUND), 0.2);
  // Beaches: land next to the sea.
  const coast = [];
  for (let y = 1; y < 47; y++) for (let x = 1; x < 63; x++) if (ground[at(x, y)] === GROUND && neighbours(c, x, y, WATER)) coast.push([x, y]);
  for (const [x, y] of coast) ground[at(x, y)] = SAND;
  ellipse(41, 17, 3, 2, (x, y) => (ground[at(x, y)] = WATER));
  ellipse(21, 13, 3, 2.5, (x, y) => (ground[at(x, y)] = MOUNTAIN), 0.25);
  for (let g = 0; g < 16; g++) {
    const cx = between(10, 54), cy = between(9, 39), r = between(1, 3);
    if (Math.hypot(cx - 32, cy - 24) < 5) continue;
    ellipse(cx, cy, r, r, (x, y) => { if (ground[at(x, y)] === GROUND && rand() < 0.8) ground[at(x, y)] = TREE; });
  }
  for (const [cx, cy, rx, ry] of [[26, 30, 5, 3], [42, 28, 4, 3], [34, 13, 4, 2], [15, 24, 3, 3], [48, 36, 4, 2], [38, 38, 3, 2]]) {
    ellipse(cx, cy, rx, ry, (x, y) => { if (ground[at(x, y)] === GROUND) grass[at(x, y)] = GRASS; });
  }
  // Docks: the westmost beach on the middle row (boat to Startskoven), the southmost in the middle column (boat to Snedalen).
  const west = nearest(c, 0, 24, (x, y) => ground[at(x, y)] === SAND && neighbours(c, x, y, WATER) && y >= 22 && y <= 26);
  const south = nearest(c, 32, 47, (x, y) => ground[at(x, y)] === SAND && neighbours(c, x, y, WATER) && x >= 29 && x <= 35);
  const path = (x, y) => { if (ground[at(x, y)] !== WATER || (x > 2 && y > 2)) { ground[at(x, y)] = PATH; grass[at(x, y)] = 0; } };
  trail([[west.x, west.y], [18, 24], [32, 24], [44, 22], [52, 24]], path);
  trail([[32, 24], [32, 33], [south.x, south.y]], path);
  trail([[32, 24], [30, 16], [22, 17]], path);
  ground[at(west.x, west.y)] = PATH;
  ground[at(south.x, south.y)] = PATH;
  const { sealed } = seal(c, west, WATER);
  return { c, links: { west, south }, sealed };
}

// ---------------------------------------------------------------- Snedalen: a snowy valley between mountains

function snedalen() {
  const c = canvas(64, 48, 20261102);
  const { ground, grass, at, ellipse, trail, rand, between, border } = c;
  border(TREE);
  // Mountains along the north and the south; the valley runs west–east between them.
  for (let x = 1; x < 63; x++) {
    const north = 6 + Math.round(Math.sin(x * 0.3) * 2 + rand() * 2);
    const south = 40 - Math.round(Math.cos(x * 0.25) * 2 + rand() * 2);
    for (let y = 1; y <= north; y++) ground[at(x, y)] = MOUNTAIN;
    for (let y = south; y < 47; y++) ground[at(x, y)] = MOUNTAIN;
  }
  // Tunnel mouths at both ends: a mountain face with a path running into it.
  for (let y = 20; y <= 28; y++) { ground[at(1, y)] = MOUNTAIN; ground[at(62, y)] = MOUNTAIN; }
  ellipse(33, 24, 8, 5, (x, y) => (ground[at(x, y)] = WATER), 0.12);
  for (let g = 0; g < 18; g++) {
    const cx = between(4, 60), cy = between(10, 37), r = between(1, 3);
    if (Math.hypot(cx - 33, cy - 24) < 10) continue;
    ellipse(cx, cy, r, r, (x, y) => { if (ground[at(x, y)] === GROUND && rand() < 0.8) ground[at(x, y)] = TREE; });
  }
  for (const [cx, cy, rx, ry] of [[14, 16, 4, 3], [50, 15, 5, 3], [14, 32, 4, 3], [51, 33, 4, 3], [24, 12, 3, 2], [42, 35, 3, 2]]) {
    ellipse(cx, cy, rx, ry, (x, y) => { if (ground[at(x, y)] === GROUND) grass[at(x, y)] = GRASS; });
  }
  const west = { x: 2, y: 24 };
  const east = { x: 61, y: 24 };
  const path = (x, y) => { if (ground[at(x, y)] !== MOUNTAIN || x === 1 || x === 62) { ground[at(x, y)] = PATH; grass[at(x, y)] = 0; } };
  trail([[west.x, west.y], [12, 24], [20, 20], [33, 17], [46, 20], [54, 24], [east.x, east.y]], path);
  // A jetty on the frozen lake's south shore: the boat to Kirsebærøen.
  const dock = nearest(c, 33, 32, (x, y) => ground[at(x, y)] !== WATER && !BLOCKING.includes(ground[at(x, y)]) && neighbours(c, x, y, WATER) && y > 24);
  trail([[20, 20], [22, 30], [dock.x, dock.y]], path);
  ground[at(1, 24)] = MOUNTAIN;
  ground[at(62, 24)] = MOUNTAIN;
  for (const p of [west, east, dock]) ground[at(p.x, p.y)] = PATH;
  const { sealed } = seal(c, west);
  return { c, links: { west, east, dock }, sealed };
}

// ---------------------------------------------------------------- Ildbjerget: ash, lava and a smoking mountain

function ildbjerget() {
  const c = canvas(64, 48, 20261103);
  const { ground, grass, at, ellipse, trail, rand, between, border } = c;
  border(TREE);
  // The gorge in the west, full of lava (the bridge from Startskoven comes across it).
  for (let y = 1; y < 47; y++) for (let x = 2; x <= 4 + Math.round(rand()); x++) ground[at(x, y)] = WATER;
  // The volcano: a ring of mountains round a lava crater, and a lava river running south-east.
  ellipse(36, 13, 8, 6, (x, y) => (ground[at(x, y)] = MOUNTAIN), 0.15);
  ellipse(36, 13, 3, 2, (x, y) => (ground[at(x, y)] = WATER));
  trail([[40, 18], [44, 26], [50, 34], [56, 46]], (x, y) => (ground[at(x, y)] = WATER), 2);
  // Mountains along the south, with the tunnel from Snedalen in them.
  for (let x = 20; x <= 46; x++) for (let y = 43 - Math.round(rand() * 2); y < 47; y++) ground[at(x, y)] = MOUNTAIN;
  for (let g = 0; g < 12; g++) {
    const cx = between(8, 60), cy = between(4, 40), r = between(1, 2);
    if (Math.hypot(cx - 36, cy - 13) < 10) continue;
    ellipse(cx, cy, r, r, (x, y) => { if (ground[at(x, y)] === GROUND && rand() < 0.7) ground[at(x, y)] = TREE; });
  }
  for (const [cx, cy] of [[14, 12], [52, 8], [22, 32], [58, 20]]) ellipse(cx, cy, 3, 2, (x, y) => { if (ground[at(x, y)] === GROUND) ground[at(x, y)] = SAND; }, 0.3);
  for (const [cx, cy, rx, ry] of [[16, 22, 4, 3], [28, 28, 4, 3], [50, 16, 3, 3], [14, 38, 3, 2], [40, 34, 3, 2], [24, 8, 3, 2]]) {
    ellipse(cx, cy, rx, ry, (x, y) => { if (ground[at(x, y)] === GROUND) grass[at(x, y)] = GRASS; });
  }
  const west = { x: 6, y: 24 };
  const south = { x: 33, y: 41 };
  // Roads cross the lava river as bridges (path over lava).
  // (The road to the tunnel cuts through the southern mountains; the volcano's ring stays whole.)
  const path = (x, y) => { if (ground[at(x, y)] !== MOUNTAIN || y > 35) { ground[at(x, y)] = PATH; grass[at(x, y)] = 0; } };
  trail([[west.x, west.y], [16, 24], [26, 20], [33, 24], [46, 28], [58, 30]], path);
  trail([[33, 24], [33, 30], [south.x, south.y]], path);
  trail([[26, 20], [24, 10]], path);
  ground[at(33, 42)] = MOUNTAIN;
  for (const p of [west, south]) ground[at(p.x, p.y)] = PATH;
  const { sealed } = seal(c, west);
  return { c, links: { west, south }, sealed };
}

// ---------------------------------------------------------------- the ways between the worlds

const link = (id, kind, spot, areaId, to) => ({ id, kind, x: spot.x, y: spot.y, to: { areaId, link: to } });

const island = kirsebaeroeen();
const valley = snedalen();
const volcano = ildbjerget();

// Startskoven: find a dock on Storsøen's east shore, a tunnel mouth in Højfjeldet and the
// bridge at the east edge of the dunes — walkable, no tall grass, next to what they cross.
const sk = JSON.parse(readFileSync(path.join(AREAS, "startskoven.json"), "utf8"));
const skGround = sk.layers.find((l) => l.name === "bund").data;
const skGrass = sk.layers.find((l) => l.name === "graes").data;
const skc = { W: sk.width, H: sk.height, ground: skGround, at: (x, y) => y * sk.width + x, inside: (x, y) => x >= 0 && y >= 0 && x < sk.width && y < sk.height };
const free = (x, y) => !BLOCKING.includes(skGround[skc.at(x, y)]) && !skGrass[skc.at(x, y)];
const skDock = nearest(skc, 140, 44, (x, y) => free(x, y) && neighbours(skc, x, y, WATER));
const skTunnel = nearest(skc, 146, 100, (x, y) => free(x, y) && neighbours(skc, x, y, MOUNTAIN));
const skBridge = nearest(skc, 158, 16, (x, y) => free(x, y) && x >= 156);

/** An encounter table: [speciesId, weight] pairs. */
const wild = (...entries) => entries.map(([speciesId, weight]) => ({ speciesId, weight }));

const skLinks = [
  link("baad-kirsebaeroeen", "boat", skDock, "kirsebaeroeen", "baad-startskoven"),
  link("tunnel-snedalen", "tunnel", skTunnel, "snedalen", "tunnel-startskoven"),
  link("bro-ildbjerget", "bridge", skBridge, "ildbjerget", "bro-startskoven"),
];

writeWorld("kirsebaeroeen", island.c, {
  encounterTable: [
    { speciesId: "blomsterbasse", weight: 3 },
    { speciesId: "aakandefroe", weight: 3 },
    { speciesId: "svanefjer", weight: 2 },
    { speciesId: "perlemusling", weight: 2 },
    { speciesId: "kloeverhop", weight: 2 },
    { speciesId: "mosmus", weight: 2 },
    { speciesId: "taagefisk", weight: 2 },
    { speciesId: "svampenisse", weight: 1 },
  ],
  encounterRate: 0.1,
  // Who hides in the woods, the water and up the mountains (the game's shared/src/world/regions.ts).
  habitats: {
    forest: { gids: [TREE], rate: 0.06, encounterTable: wild(["koglekat", 3], ["grenspringer", 3], ["blomsterbasse", 2]) },
    water: { gids: [WATER], rate: 0.06, encounterTable: wild(["sivodder", 3], ["boblegedde", 2], ["perlemusling", 2], ["svanefjer", 1]) },
    mountain: { gids: [MOUNTAIN], rate: 0.06, encounterTable: wild(["fjeldmurmel", 3], ["grusgekko", 2]) },
  },
  playerStart: island.links.west,
  scene: "kirsebaer",
  look3d: { tree: "sakura", sky: "springBlue", fog: "sakuraPink" },
  links: [
    link("baad-startskoven", "boat", island.links.west, "startskoven", "baad-kirsebaeroeen"),
    link("baad-snedalen", "boat", island.links.south, "snedalen", "baad-kirsebaeroeen"),
  ],
}, {
  ground: [0x6a, 0x8a, 0x5c], groundDot: [0x98, 0xbb, 0x6c], grass: [0x5a, 0x7a, 0x4c], blade: [0x98, 0xbb, 0x6c],
  pine: [0xd2, 0x7e, 0x99], pineLight: [0xf0, 0xc0, 0xcc], bark: [0x36, 0x36, 0x46], plume: [0xd2, 0x7e, 0x99], plumeLight: [0xf0, 0xc0, 0xcc],
});

writeWorld("snedalen", valley.c, {
  encounterTable: [
    { speciesId: "snefnug", weight: 3 },
    { speciesId: "stenged", weight: 2 },
    { speciesId: "granitgnom", weight: 2 },
    { speciesId: "tordenugle", weight: 2 },
    { speciesId: "frostpip", weight: 2 },
    { speciesId: "istap", weight: 1 },
    { speciesId: "snetrold", weight: 1 },
    { speciesId: "krystalhjort", weight: 1 },
  ],
  encounterRate: 0.1,
  // Who hides in the woods, the water and up the mountains (the game's shared/src/world/regions.ts).
  habitats: {
    forest: { gids: [TREE], rate: 0.06, encounterTable: wild(["grenspringer", 3], ["gnistspaette", 2], ["snetrold", 1]) },
    water: { gids: [WATER], rate: 0.06, encounterTable: wild(["boblegedde", 3], ["stroemaal", 2], ["istap", 1]) },
    mountain: { gids: [MOUNTAIN], rate: 0.06, encounterTable: wild(["fjeldmurmel", 3], ["grusgekko", 2], ["krystalhjort", 1]) },
  },
  playerStart: valley.links.west,
  scene: "sne",
  look3d: { tree: "snowPine", sky: "springBlue", fog: "washi" },
  links: [
    link("tunnel-startskoven", "tunnel", valley.links.west, "startskoven", "tunnel-snedalen"),
    link("tunnel-ildbjerget", "tunnel", valley.links.east, "ildbjerget", "tunnel-snedalen"),
    link("baad-kirsebaeroeen", "boat", valley.links.dock, "kirsebaeroeen", "baad-snedalen"),
  ],
}, {
  ground: [0xe6, 0xe2, 0xd6], groundDot: [0xc4, 0xcf, 0xd8], grass: [0xd2, 0xd6, 0xd4], blade: [0xa8, 0xb6, 0xbe],
  pineLight: [0xdc, 0xd7, 0xba], water: [0x7f, 0xb4, 0xca], water2: [0xa6, 0xc8, 0xd6], foam: [0xf0, 0xe6, 0xd2], spray: [0xdc, 0xe8, 0xee],
  path: [0xb4, 0xb0, 0xa4], pathDot: [0x96, 0x92, 0x88], sand: [0xf0, 0xe6, 0xd2], sandLight: [0xf8, 0xf2, 0xe4], sandRipple: [0xd0, 0xcc, 0xc0],
});

writeWorld("ildbjerget", volcano.c, {
  encounterTable: [
    { speciesId: "magmamus", weight: 3 },
    { speciesId: "dampskjold", weight: 2 },
    { speciesId: "gloedsalamander", weight: 2 },
    { speciesId: "gloedskorpion", weight: 2 },
    { speciesId: "gnistflue", weight: 2 },
    { speciesId: "lavasnegl", weight: 1 },
    { speciesId: "stoevtrold", weight: 1 },
    { speciesId: "kulsnude", weight: 1 },
  ],
  encounterRate: 0.1,
  // Who hides in the woods, the water and up the mountains (the game's shared/src/world/regions.ts).
  habitats: {
    forest: { gids: [TREE], rate: 0.06, encounterTable: wild(["gnistspaette", 3], ["kulsnude", 2]) },
    mountain: { gids: [MOUNTAIN], rate: 0.06, encounterTable: wild(["gloedgemse", 3], ["grusgekko", 2], ["stoevtrold", 1]) },
  },
  playerStart: volcano.links.west,
  scene: "vulkan",
  look3d: { tree: "deadPine", peak: "volcano", water: "lava", sky: "sumiInk5", fog: "sumiInk4" },
  links: [
    link("bro-startskoven", "bridge", volcano.links.west, "startskoven", "bro-ildbjerget"),
    link("tunnel-snedalen", "tunnel", volcano.links.south, "snedalen", "tunnel-ildbjerget"),
  ],
}, {
  ground: [0x3a, 0x34, 0x30], groundDot: [0x54, 0x4a, 0x40], grass: [0x4a, 0x38, 0x30], blade: [0x8a, 0x5a, 0x40], stem: [0x93, 0x60, 0x46], plume: [0xc3, 0x40, 0x43], plumeLight: [0xff, 0xa0, 0x66],
  pine: [0x2a, 0x2a, 0x37], pineLight: [0x54, 0x54, 0x6d], bark: [0x16, 0x16, 0x1d],
  water: [0xa8, 0x2c, 0x22], water2: [0xe8, 0x6a, 0x2a], foam: [0xff, 0xa0, 0x66], spray: [0xe6, 0xc3, 0x84],
  path: [0x72, 0x71, 0x69], pathDot: [0x54, 0x54, 0x6d], sand: [0x54, 0x4a, 0x40], sandLight: [0x6a, 0x5e, 0x52], sandRipple: [0x3a, 0x34, 0x30],
});

// Startskoven's links go into its sidecar (replacing any from an earlier run).
const metaPath = path.join(AREAS, "startskoven.meta.json");
let metaText = readFileSync(metaPath, "utf8");
const linksJson = JSON.stringify(skLinks, null, 2).replace(/\n/g, "\n  ");
if (/"links":\s*\[/.test(metaText)) metaText = metaText.replace(/"links":\s*\[[\s\S]*?\n  \]/, `"links": ${linksJson}`);
else metaText = metaText.replace(/\n  "encounterRate"/, `\n  "links": ${linksJson},\n  "encounterRate"`);
writeFileSync(metaPath, metaText);

console.log(`Kirsebærøen: docks ${JSON.stringify(island.links)}, ${island.sealed} sealed`);
console.log(`Snedalen: ${JSON.stringify(valley.links)}, ${valley.sealed} sealed`);
console.log(`Ildbjerget: ${JSON.stringify(volcano.links)}, ${volcano.sealed} sealed`);
console.log(`Startskoven: dock ${JSON.stringify(skDock)}, tunnel ${JSON.stringify(skTunnel)}, bridge ${JSON.stringify(skBridge)}`);
