import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CAVE_SETTINGS,
  caveDue,
  caveKind,
  caveMouthTile,
  caveRocks,
  caveSpeciesIds,
  chooseCaveSpot,
  cleanCaveSettings,
  freshCave,
  nextCaveAt,
  pickCaveKind,
  planCaveVisit,
  ROCK_AREA,
  type CaveConfig,
  type CaveKind,
} from "../caves.js";
import { BALL_START, ballAt, caveCatchChance, closestApproach, hitPrecision, landingTime, MIN_PULL, slingshotToThrow } from "../throw.js";
import { emptyTerrain, tileKey, type BaseArea } from "../../world/terrain.js";

const T = { ground: 1, tree: 2, grass: 3, water: 4, path: 5, mountain: 6, burnt: 7, crater: 8, flood: 9, log: 10, crack: 11, rubble: 12, wreck: 13 };

/** A 40×30 map: tree border, a road, a mountain block in the east with open ground around it. */
function area(): BaseArea {
  const W = 40;
  const H = 30;
  const ground: number[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let g = T.ground;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) g = T.tree;
      else if (y === 15) g = T.path;
      else if (x >= 28 && x <= 34 && y >= 4 && y <= 9) g = T.mountain;
      ground.push(g);
    }
  return { id: "test", width: W, height: H, ground, grass: ground.map(() => 0), blocking: [T.tree, T.water, T.mountain], tiles: T, start: { x: 20, y: 15 }, fixed: [] };
}

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("the next cave opens after the average gap, spread by the randomness", () => {
  const now = new Date("2026-09-26T12:00:00Z");
  const min = (r: number) => (nextCaveAt(now, { ...DEFAULT_CAVE_SETTINGS, meanMinutes: 60, randomness: 0.5 }, () => r).getTime() - now.getTime()) / 60_000;
  assert.equal(min(0.5), 60);
  assert.equal(min(0), 30);
  assert.equal((nextCaveAt(now, { ...DEFAULT_CAVE_SETTINGS, meanMinutes: 5, randomness: 1 }, () => 0).getTime() - now.getTime()) / 60_000, 5);
});

test("settings from the admin portal are checked and clamped", () => {
  assert.deepEqual(cleanCaveSettings({ enabled: false, meanMinutes: 0, openMinutes: 9999, randomness: 2 }, DEFAULT_CAVE_SETTINGS), {
    enabled: false,
    meanMinutes: 5,
    openMinutes: 240,
    randomness: 1,
  });
  assert.deepEqual(cleanCaveSettings(undefined, DEFAULT_CAVE_SETTINGS), DEFAULT_CAVE_SETTINGS);
});

test("a cave opens in a mountain face you can walk up to, away from the start and from others", () => {
  const base = area();
  const terrain = emptyTerrain();
  assert.equal(caveMouthTile(base, terrain, 28, 6), true, "the west face");
  assert.equal(caveMouthTile(base, terrain, 31, 6), false, "deep inside the mountain");
  assert.equal(caveMouthTile(base, terrain, 12, 12), false, "not a mountain");
  for (let seed = 1; seed <= 30; seed++) {
    const occupied = [{ x: 27, y: 6 }];
    const spot = chooseCaveSpot(base, terrain, { occupied, rand: seeded(seed) })!;
    assert.ok(spot && caveMouthTile(base, terrain, spot.x, spot.y));
    assert.ok(Math.max(Math.abs(spot.x - 27), Math.abs(spot.y - 6)) > 1, "not next to a player");
  }
  // A disaster that turned the mountain into rubble leaves no face for a cave.
  for (let y = 4; y <= 9; y++) for (let x = 28; x <= 34; x++) terrain.overrides[tileKey(x, y)] = { ground: T.rubble, grass: 0 };
  assert.equal(chooseCaveSpot(base, terrain, { rand: seeded(1) }), undefined);
});

test("a cave closes after its open time", () => {
  const cave = freshCave("c1", "krystal", { areaId: "test", x: 28, y: 6 }, new Date("2026-09-26T12:00:00Z"), { ...DEFAULT_CAVE_SETTINGS, openMinutes: 20 });
  assert.equal(cave.closesAt, "2026-09-26T12:20:00.000Z");
  assert.deepEqual(cave.visitedBy, []);
  assert.equal(cave.kind, "krystal");
  assert.equal(caveDue(cave, new Date("2026-09-26T12:19:59Z")), false);
  assert.equal(caveDue(cave, new Date("2026-09-26T12:20:00Z")), true);
});

const look = { walls: "sumiInk6", floor: "sumiInk5", fog: "sumiInk0", glow: ["waveAqua2"], decor: "crystals", particles: "none" } as const;
const kind = (id: string, weight: number, species: CaveKind["species"]): CaveKind => ({ id, navn: id, weight, species, look: { ...look, glow: [...look.glow] } });

test("a visit picks its monsters by weight from the cave kind's residents", () => {
  const k = kind("krystal", 1, [{ speciesId: "a", weight: 3 }, { speciesId: "b", weight: 1 }, { speciesId: "c", weight: 0 }]);
  const config: CaveConfig = { balls: 10, monsters: 5, kinds: [k] };
  const visit = planCaveVisit(config, k, "c1", 42, seeded(7));
  assert.equal(visit.speciesIds.length, 5);
  assert.equal(visit.balls, 10);
  assert.equal(visit.kind, "krystal");
  assert.ok(visit.speciesIds.every((id) => id === "a" || id === "b"), "weight 0 never turns up");
  let a = 0;
  const r = seeded(9);
  for (let i = 0; i < 400; i++) if (planCaveVisit({ ...config, monsters: 1 }, k, "c", 1, r).speciesIds[0] === "a") a++;
  assert.ok(a > 250 && a < 350, `about 3 in 4 are "a" (${a}/400)`);
});

test("which kind of cave opens is picked by weight; an unknown kind falls back to the first", () => {
  const config: CaveConfig = { balls: 10, monsters: 5, kinds: [kind("krystal", 3, [{ speciesId: "a", weight: 1 }]), kind("is", 1, [{ speciesId: "b", weight: 1 }]), kind("aldrig", 0, [{ speciesId: "c", weight: 1 }])] };
  const r = seeded(3);
  const counts: Record<string, number> = {};
  for (let i = 0; i < 400; i++) {
    const id = pickCaveKind(config, r)!.id;
    counts[id] = (counts[id] ?? 0) + 1;
  }
  assert.ok(counts.krystal! > 250 && counts.is! > 50 && !counts.aldrig, JSON.stringify(counts));
  assert.equal(caveKind(config, "is")?.id, "is");
  assert.equal(caveKind(config, undefined)?.id, "krystal", "a cave from before kinds existed");
  assert.equal(caveKind(config, "borte")?.id, "krystal", "a kind that was removed");
  assert.deepEqual([...caveSpeciesIds(config)].sort(), ["a", "b", "c"]);
});

test("the boulders differ from cave to cave, spread out and within reach", () => {
  const layouts = new Set<string>();
  for (let seed = 1; seed <= 60; seed++) {
    const rocks = caveRocks(seed);
    layouts.add(JSON.stringify(rocks));
    assert.ok(rocks.length >= 4 && rocks.length <= 6, `seed ${seed}: ${rocks.length} rocks`);
    for (const r of rocks) assert.ok(r.x >= ROCK_AREA.minX && r.x <= ROCK_AREA.maxX && r.z >= ROCK_AREA.minZ && r.z <= ROCK_AREA.maxZ);
    for (let i = 0; i < rocks.length; i++) for (let j = i + 1; j < rocks.length; j++) assert.ok(Math.hypot(rocks[i]!.x - rocks[j]!.x, rocks[i]!.z - rocks[j]!.z) >= 2.3);
    assert.ok(rocks.some((r) => r.z >= -6.3), "one close by");
    assert.deepEqual(caveRocks(seed), rocks, "the same seed gives the same cave");
  }
  assert.ok(layouts.size === 60, "every cave is laid out differently");
});

test("a short pull or one that doesn't pull back is no throw; a long pull throws forward and up", () => {
  assert.equal(slingshotToThrow(0, 10, 300), undefined, "too short");
  assert.equal(slingshotToThrow(0, 300 * MIN_PULL * 0.9, 300), undefined, "just too short");
  assert.equal(slingshotToThrow(0, -200, 300), undefined, "pushed forwards, not pulled back");
  assert.equal(slingshotToThrow(200, 0, 300), undefined, "straight sideways");
  assert.equal(slingshotToThrow(0, 200, 0), undefined, "no room to pull");
  const v = slingshotToThrow(0, 150, 300)!;
  assert.ok(v.z < 0 && v.y > 0 && v.x === 0);
  const far = slingshotToThrow(0, 300, 300)!;
  assert.ok(far.z < v.z && far.y > v.y, "a longer pull throws further and higher");
  assert.deepEqual(slingshotToThrow(0, 900, 300), far, "pulling past the longest pull adds nothing");
  assert.ok(slingshotToThrow(80, 200, 300)!.x < 0, "pulling to the right aims left");
  assert.ok(slingshotToThrow(-80, 200, 300)!.x > 0, "pulling to the left aims right");
  assert.equal(slingshotToThrow(12, 200, 300)!.x, 0, "a finger wobbling a little off straight back still throws straight");
  const wide = slingshotToThrow(290, 20, 300)!;
  assert.ok(Math.abs(wide.x / wide.z) <= 0.7 + 1e-9, "never aims further to the side than about 35°");
});

test("the ball flies in an arc from the hand and comes down on the floor", () => {
  const v = slingshotToThrow(0, 150, 300)!;
  assert.deepEqual(ballAt(v, 0), BALL_START);
  const t = landingTime(v);
  assert.ok(Math.abs(ballAt(v, t).y) < 1e-9);
  assert.ok(ballAt(v, t / 2).y > BALL_START.y, "it rises before it falls");
});

/** Whether some pull of the slingshot sends the ball within `within` m of a point. */
function reachable(target: { x: number; y: number; z: number }, within = 0.3): boolean {
  for (let dy = 1; dy <= 300; dy += 3) {
    for (let dx = -220; dx <= 220; dx += 4) {
      const v = slingshotToThrow(dx, dy, 300);
      if (v && closestApproach(v, target).distance < within) return true;
    }
  }
  return false;
}

test("every place a monster can peek out in a cave can be hit with a reasonable pull", () => {
  // Where monsters show themselves in the cave scene: behind any boulder (0.9 m back), or
  // peeking round its side (1.1 m out), 0.6–2.1 m up.
  for (const z of [ROCK_AREA.maxZ - 0.9, (ROCK_AREA.maxZ + ROCK_AREA.minZ) / 2 - 0.9, ROCK_AREA.minZ - 0.9]) {
    for (const x of [ROCK_AREA.minX - 1.1, 0, ROCK_AREA.maxX + 1.1]) {
      for (const y of [0.6, 2.1]) assert.ok(reachable({ x, y, z }), `reachable: (${x}, ${y}, ${z})`);
    }
  }
});

test("the monster in the meadow can be hit wherever it sways to", () => {
  // meadow-stage.ts: it stands 7 m out, its middle 0.95 m up, swaying up to 1.4 m to either side.
  for (const x of [-1.4, 0, 1.4]) assert.ok(reachable({ x, y: 0.95, z: -7 }), `reachable at x = ${x}`);
});

test("a hit near the middle catches more easily, but nothing is ever certain", () => {
  assert.equal(hitPrecision(0), 1);
  assert.equal(hitPrecision(10), undefined, "a miss");
  assert.ok(hitPrecision(0.5)! < hitPrecision(0.1)!);
  assert.ok(caveCatchChance(0.5, 1) > caveCatchChance(0.5, 0));
  assert.equal(caveCatchChance(5, 1), 0.95);
  assert.equal(caveCatchChance(0, 0), 0.1);
});
