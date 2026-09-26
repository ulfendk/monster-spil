import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CAVE_SETTINGS,
  caveDue,
  caveMouthTile,
  chooseCaveSpot,
  cleanCaveSettings,
  freshCave,
  nextCaveAt,
  planCaveVisit,
  type CaveConfig,
} from "../caves.js";
import { BALL_START, ballAt, caveCatchChance, closestApproach, flickToThrow, hitPrecision, landingTime } from "../throw.js";
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
  const cave = freshCave("c1", { areaId: "test", x: 28, y: 6 }, new Date("2026-09-26T12:00:00Z"), { ...DEFAULT_CAVE_SETTINGS, openMinutes: 20 });
  assert.equal(cave.closesAt, "2026-09-26T12:20:00.000Z");
  assert.deepEqual(cave.visitedBy, []);
  assert.equal(caveDue(cave, new Date("2026-09-26T12:19:59Z")), false);
  assert.equal(caveDue(cave, new Date("2026-09-26T12:20:00Z")), true);
});

test("a visit picks its monsters by weight", () => {
  const config: CaveConfig = { navn: "Grotten", balls: 10, monsters: 5, species: [{ speciesId: "a", weight: 3 }, { speciesId: "b", weight: 1 }, { speciesId: "c", weight: 0 }] };
  const visit = planCaveVisit(config, "c1", 42, seeded(7));
  assert.equal(visit.speciesIds.length, 5);
  assert.equal(visit.balls, 10);
  assert.ok(visit.speciesIds.every((id) => id === "a" || id === "b"), "weight 0 never turns up");
  let a = 0;
  const r = seeded(9);
  for (let i = 0; i < 400; i++) if (planCaveVisit({ ...config, monsters: 1 }, "c", 1, r).speciesIds[0] === "a") a++;
  assert.ok(a > 250 && a < 350, `about 3 in 4 are "a" (${a}/400)`);
});

test("a tap or a downward drag is no throw; a flick up throws forward and up", () => {
  assert.equal(flickToThrow(0, -10, 100, 800), undefined, "too short");
  assert.equal(flickToThrow(0, 200, 150, 800), undefined, "downwards");
  const v = flickToThrow(0, -320, 250, 800)!;
  assert.ok(v.z < 0 && v.y > 0 && v.x === 0);
  const far = flickToThrow(0, -320, 120, 800)!;
  assert.ok(far.z < v.z, "a faster flick throws further");
  assert.ok(flickToThrow(160, -320, 250, 800)!.x > 0, "a flick to the right aims right");
});

test("the ball flies in an arc from the hand and comes down on the floor", () => {
  const v = flickToThrow(0, -320, 250, 800)!;
  assert.deepEqual(ballAt(v, 0), BALL_START);
  const t = landingTime(v);
  assert.ok(Math.abs(ballAt(v, t).y) < 1e-9);
  assert.ok(ballAt(v, t / 2).y > BALL_START.y, "it rises before it falls");
});

test("every place a monster can peek out can be hit with a reasonable flick", () => {
  // Where monsters show themselves in the cave scene: 5–12 m away, up to 4 m to the side, 0.6–2.1 m up.
  for (const z of [-5, -8, -12]) {
    for (const x of [-4, 0, 4]) {
      for (const y of [0.6, 2.1]) {
        let hit = false;
        search: for (let up = 0.1; up <= 0.8; up += 0.05) {
          for (const ms of [120, 180, 250, 350, 500]) {
            for (let side = -0.5; side <= 0.5; side += 0.05) {
              const v = flickToThrow(side * 800, -up * 800, ms, 800);
              if (v && closestApproach(v, { x, y, z }).distance < 0.3) {
                hit = true;
                break search;
              }
            }
          }
        }
        assert.ok(hit, `reachable: (${x}, ${y}, ${z})`);
      }
    }
  }
});

test("a hit near the middle catches more easily, but nothing is ever certain", () => {
  assert.equal(hitPrecision(0), 1);
  assert.equal(hitPrecision(10), undefined, "a miss");
  assert.ok(hitPrecision(0.5)! < hitPrecision(0.1)!);
  assert.ok(caveCatchChance(0.5, 1) > caveCatchChance(0.5, 0));
  assert.equal(caveCatchChance(5, 1), 0.95);
  assert.equal(caveCatchChance(0, 0), 0.1);
});
