import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyCut, applyDig, canCut, canDig, crossTarget, pickDigMonster, pickDigReward, type MinigameConfig } from "../work.js";
import { emptyTerrain, healTerrain, tileKey, tileNow, walkableNow, type BaseArea } from "../terrain.js";

const config: MinigameConfig = JSON.parse(readFileSync(new URL("../../../content/minigames.json", import.meta.url), "utf8"));
const T = { ground: 1, tree: 2, grass: 3, water: 4, path: 5, mountain: 6, burnt: 7, crater: 8, flood: 9, log: 10, crack: 11, rubble: 12, wreck: 13, sand: 14, stump: 15, hole: 16 };

/**
 * A 30×20 map: tree border; a river (x 10–12, y 1–11, open ground below it); a mountain ridge
 * (y 14–16) from x 14 to the right edge; a tree at (5,5); tall grass at (7,7); sand at (8,3).
 */
function area(): BaseArea {
  const W = 30;
  const H = 20;
  const ground: number[] = [];
  const grass: number[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let g = T.ground;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) g = T.tree;
      else if (x >= 10 && x <= 12 && y <= 11) g = T.water;
      else if (y >= 14 && y <= 16 && x >= 14) g = T.mountain;
      else if (x === 5 && y === 5) g = T.tree;
      else if (x === 8 && y === 3) g = T.sand;
      ground.push(g);
      grass.push(x === 7 && y === 7 ? T.grass : 0);
    }
  return { id: "t", width: W, height: H, ground, grass, blocking: [T.tree, T.water, T.mountain], tiles: T, start: { x: 3, y: 3 }, fixed: [{ x: 6, y: 6 }] };
}
const now = new Date("2026-09-26T12:00:00Z");
const later = (hours: number) => new Date(now.getTime() + hours * 3_600_000 + 1);

test("trees can be felled, not the map's border", () => {
  const base = area();
  const terrain = emptyTerrain();
  assert.equal(canCut(base, terrain, 5, 5), true);
  assert.equal(canCut(base, terrain, 0, 5), false, "the border stays");
  assert.equal(canCut(base, terrain, 3, 3), false, "not a tree");
});

test("a felled tree leaves a walkable stump, which grows back — but never under someone", () => {
  const base = area();
  const terrain = emptyTerrain();
  applyCut(base, terrain, 5, 5, now, config);
  assert.equal(tileNow(base, terrain, 5, 5).ground, T.stump);
  assert.equal(walkableNow(base, terrain, 5, 5), true);
  assert.equal(canCut(base, terrain, 5, 5), false, "a stump isn't a tree");
  // Time's up, but someone stands on it: it waits.
  healTerrain(base, terrain, later(config.cut.regrowHours), new Set([tileKey(5, 5)]));
  assert.equal(tileNow(base, terrain, 5, 5).ground, T.stump);
  healTerrain(base, terrain, later(config.cut.regrowHours));
  assert.equal(tileNow(base, terrain, 5, 5).ground, T.tree, "grown back");
});

test("a stump that is now the only way through never grows back", () => {
  const base = area();
  const terrain = emptyTerrain();
  // Wall the start's corner in with trees, then cut one of them: the only way out.
  for (let y = 1; y <= 5; y++) terrain.overrides[tileKey(6, y)] = { ground: T.tree, grass: 0 };
  for (let x = 1; x <= 6; x++) terrain.overrides[tileKey(x, 6)] = { ground: T.tree, grass: 0 };
  // The area outside must hold players' tiles too: the start (3,3) is inside, so the outside
  // becomes unreachable once the stump regrows — healing must refuse.
  applyCut(base, terrain, 6, 3, now, config);
  healTerrain(base, terrain, later(config.cut.regrowHours));
  assert.notEqual(tileNow(base, terrain, 6, 3).ground, T.tree);
});

test("digging: plain ground or sand, not grass, a path or a hole already dug", () => {
  const base = area();
  const terrain = emptyTerrain();
  assert.equal(canDig(base, terrain, 3, 3), true);
  assert.equal(canDig(base, terrain, 8, 3), true, "sand");
  assert.equal(canDig(base, terrain, 7, 7), false, "tall grass");
  assert.equal(canDig(base, terrain, 11, 5), false, "water");
  applyDig(base, terrain, 3, 3, now, config);
  assert.equal(tileNow(base, terrain, 3, 3).ground, T.hole);
  assert.equal(walkableNow(base, terrain, 3, 3), true);
  assert.equal(canDig(base, terrain, 3, 3), false, "already dug");
  healTerrain(base, terrain, later(config.dig.healHours));
  assert.equal(tileNow(base, terrain, 3, 3).ground, T.ground, "filled in again");
  assert.equal(canDig(base, terrain, 3, 3), true);
});

test("swimming takes you across the river, climbing over the ridge", () => {
  const base = area();
  const terrain = emptyTerrain();
  assert.deepEqual(crossTarget(base, terrain, { x: 9, y: 5 }, { x: 10, y: 5 }, "swim", config), { x: 13, y: 5, tiles: 3 });
  assert.deepEqual(crossTarget(base, terrain, { x: 13, y: 5 }, { x: 12, y: 5 }, "swim", config), { x: 9, y: 5, tiles: 3 }, "and back");
  assert.deepEqual(crossTarget(base, terrain, { x: 20, y: 13 }, { x: 20, y: 14 }, "climb", config), { x: 20, y: 17, tiles: 3 });
  assert.deepEqual(crossTarget(base, terrain, { x: 9, y: 4 }, { x: 10, y: 5 }, "swim", config), { x: 13, y: 8, tiles: 3 }, "diagonally too");
  assert.equal(crossTarget(base, terrain, { x: 9, y: 5 }, { x: 10, y: 5 }, "climb", config), undefined, "you can't climb water");
  assert.equal(crossTarget(base, terrain, { x: 20, y: 13 }, { x: 20, y: 14 }, "climb", { ...config, climb: { maxTiles: 2 } }), undefined, "too far");
  // Something in the way on the far side: no crossing.
  terrain.overrides[tileKey(13, 5)] = { ground: T.tree, grass: 0 };
  assert.equal(crossTarget(base, terrain, { x: 9, y: 5 }, { x: 10, y: 5 }, "swim", config), undefined);
});

test("a hole turns up rewards by weight", () => {
  let a = 1;
  const rand = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  const counts: Record<string, number> = {};
  for (let i = 0; i < 4000; i++) {
    const k = pickDigReward(config, rand).kind;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  const total = config.dig.rewards.reduce((s, r) => s + r.weight, 0);
  for (const r of config.dig.rewards) assert.ok(Math.abs(counts[r.kind]! / 4000 - r.weight / total) < 0.03, r.kind);
  const dug = pickDigMonster(config, rand);
  assert.ok(config.dig.monsters.some((m) => m.speciesId === dug));
});

test("sand has its own diggers, if the config lists them", () => {
  let a = 7;
  const rand = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  const sandy: MinigameConfig = { ...config, dig: { ...config.dig, sandMonsters: [{ speciesId: "sandhvisker", weight: 1 }] } };
  for (let i = 0; i < 20; i++) assert.equal(pickDigMonster(sandy, rand, true), "sandhvisker");
  const inGround = pickDigMonster(sandy, rand, false);
  assert.ok(config.dig.monsters.some((m) => m.speciesId === inGround));
  const plain: MinigameConfig = { ...config, dig: { ...config.dig, sandMonsters: undefined } };
  const noList = pickDigMonster(plain, rand, true);
  assert.ok(config.dig.monsters.some((m) => m.speciesId === noList), "no sand list: the usual ones");
});
