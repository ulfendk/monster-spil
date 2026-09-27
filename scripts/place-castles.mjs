// Finds a spot for each world's castle and writes it into the world's .meta.json ("castle"):
//   node scripts/place-castles.mjs
// Open ground with open ground all around it (so it stands free and you can walk up to it),
// reachable from where you arrive, off the roads, away from the start, the ways to other worlds
// and the map's edge. Deterministic.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AREAS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../shared/content/areas");
const castles = JSON.parse(readFileSync(path.join(AREAS, "../castles.json"), "utf8")).castles;
for (const { worldId } of castles) {
  const metaPath = path.join(AREAS, `${worldId}.meta.json`);
  const metaText = readFileSync(metaPath, "utf8");
  const meta = JSON.parse(metaText);
  const map = JSON.parse(readFileSync(path.join(AREAS, `${worldId}.json`), "utf8"));
  const W = map.width, H = map.height;
  const ground = map.layers.find((l) => l.name === meta.collisionLayer).data;
  const grass = map.layers.find((l) => l.name === meta.encounterZoneLayer).data;
  const at = (x, y) => y * W + x;
  const walk = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !meta.collisionGids.includes(ground[at(x, y)]);
  const seen = new Set([at(meta.playerStart.x, meta.playerStart.y)]);
  const queue = [meta.playerStart];
  while (queue.length) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (walk(x + dx, y + dy) && !seen.has(at(x + dx, y + dy))) { seen.add(at(x + dx, y + dy)); queue.push({ x: x + dx, y: y + dy }); }
  }
  const T = meta.terrain;
  let best;
  for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
    let ok = true;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) {
      const g = ground[at(x + dx, y + dy)];
      if (g !== T.ground || grass[at(x + dx, y + dy)] || !seen.has(at(x + dx, y + dy))) ok = false;
    }
    if (!ok) continue;
    const fromStart = Math.hypot(x - meta.playerStart.x, y - meta.playerStart.y);
    const fromLinks = Math.min(99, ...(meta.links ?? []).map((l) => Math.hypot(x - l.x, y - l.y)));
    if (fromStart < 8 || fromLinks < 5) continue;
    // Not too far from the start either (a small world's castle near its middle; the big one within reach).
    const score = -Math.abs(fromStart - Math.min(W, H) * 0.35) + Math.min(fromLinks, 12) * 0.3;
    if (!best || score > best.score) best = { x, y, score };
  }
  if (!best) throw new Error(`no castle spot in ${worldId}`);
  const spot = `"castle": { "x": ${best.x}, "y": ${best.y} }`;
  const next = /"castle":\s*\{[^}]*\}/.test(metaText) ? metaText.replace(/"castle":\s*\{[^}]*\}/, spot) : metaText.replace(/\n  "encounterRate"/, `\n  ${spot},\n  "encounterRate"`);
  writeFileSync(metaPath, next);
  console.log(`${worldId}: castle at ${best.x},${best.y}`);
}
