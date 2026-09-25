import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ROAM_SETTINGS, chooseLair, cleanRoamSettings, nextRoamAt } from "../roam.js";
import { emptyTerrain, staysConnected, tileKey, tileNow, walkableNow, type BaseArea } from "../../world/terrain.js";

const T = { ground: 1, tree: 2, grass: 3, water: 4, path: 5, mountain: 6, burnt: 7, crater: 8, flood: 9, log: 10, crack: 11, rubble: 12, wreck: 13 };

/** A 40×30 map: tree border, a road, a pond, a grove, a mountain wall with one pass, tall grass. */
function area(): BaseArea {
  const W = 40;
  const H = 30;
  const ground: number[] = [];
  const grass: number[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let g = T.ground;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) g = T.tree;
      else if (y === 15) g = T.path;
      else if ((x - 30) ** 2 / 9 + (y - 6) ** 2 / 4 <= 1) g = T.water;
      else if (x >= 4 && x <= 9 && y >= 3 && y <= 8) g = T.tree;
      else if (y === 22 && x !== 12) g = T.mountain;
      ground.push(g);
      grass.push(x >= 16 && x <= 22 && y >= 4 && y <= 10 ? T.grass : 0);
    }
  return { id: "test", width: W, height: H, ground, grass, blocking: [T.tree, T.water, T.mountain, T.log, T.crack, T.wreck], tiles: T, start: { x: 20, y: 15 }, fixed: [] };
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

test("the next flight comes after the average gap, spread by the randomness", () => {
  const now = new Date("2026-09-25T12:00:00Z");
  const s = { ...DEFAULT_ROAM_SETTINGS, meanMinutes: 60, randomness: 0.5 };
  const min = (r: number) => (nextRoamAt(now, s, () => r).getTime() - now.getTime()) / 60_000;
  assert.equal(min(0.5), 60);
  assert.equal(min(0), 30);
  assert.equal((nextRoamAt(now, { ...s, randomness: 0 }, () => 0).getTime() - now.getTime()) / 60_000, 60);
  assert.equal((nextRoamAt(now, { ...s, meanMinutes: 5, randomness: 1 }, () => 0).getTime() - now.getTime()) / 60_000, 5, "never sooner than 5 minutes");
});

test("settings from the admin portal are checked and clamped", () => {
  const s = cleanRoamSettings({ enabled: false, meanMinutes: 1, randomness: 9 }, DEFAULT_ROAM_SETTINGS);
  assert.deepEqual(s, { enabled: false, meanMinutes: 5, randomness: 1 });
  assert.equal(cleanRoamSettings({ meanMinutes: "soon" }, DEFAULT_ROAM_SETTINGS).meanMinutes, DEFAULT_ROAM_SETTINGS.meanMinutes);
  assert.deepEqual(cleanRoamSettings(null, DEFAULT_ROAM_SETTINGS), DEFAULT_ROAM_SETTINGS);
});

test("the new perch is open ground with room around it, away from the start and the old perch", () => {
  const base = area();
  const terrain = emptyTerrain();
  const current = { areaId: "test", x: 6, y: 20 };
  for (let seed = 1; seed <= 40; seed++) {
    const lair = chooseLair(base, terrain, { current, rand: seeded(seed) })!;
    assert.ok(lair, `seed ${seed}: found one`);
    const t = tileNow(base, terrain, lair.x, lair.y);
    assert.equal(t.ground, T.ground, "plain ground, not a path");
    assert.equal(t.grass, 0, "not tall grass");
    assert.ok(Math.hypot(lair.x - base.start.x, lair.y - base.start.y) >= 8, "away from the start");
    assert.ok(Math.hypot(lair.x - current.x, lair.y - current.y) >= 12, "a good way from where it was");
    let free = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && walkableNow(base, terrain, lair.x + dx, lair.y + dy)) free++;
    assert.ok(free >= 7, "room to stand around it");
    assert.ok(staysConnected(base, (x, y) => walkableNow(base, terrain, x, y), new Set([tileKey(lair.x, lair.y)])), "the map stays in one piece with it there");
  }
});

test("it never lands on a player or a waiting monster, and the choice is reproducible", () => {
  const base = area();
  const terrain = emptyTerrain();
  terrain.spawns.push({ id: "s", kind: "ufo", speciesId: "x", x: 30, y: 26, until: "2099-01-01T00:00:00Z" });
  const occupied = [{ x: 14, y: 12 }, { x: 25, y: 25 }];
  const picks = new Set<string>();
  for (let seed = 1; seed <= 60; seed++) {
    const a = chooseLair(base, terrain, { occupied, rand: seeded(seed) })!;
    const b = chooseLair(base, terrain, { occupied, rand: seeded(seed) })!;
    assert.deepEqual(a, b, "same random source, same answer");
    assert.ok(!(a.x === 14 && a.y === 12) && !(a.x === 25 && a.y === 25) && !(a.x === 30 && a.y === 26));
    picks.add(tileKey(a.x, a.y));
  }
  assert.ok(picks.size > 10, "it really varies");
});

test("a map with nowhere suitable gives no perch; a crowded one relaxes the distance rule", () => {
  const base = area();
  const walled = { ...base, ground: base.ground.map((g) => (g === T.ground || g === T.path ? T.tree : g)), start: { x: 1, y: 1 } };
  assert.equal(chooseLair(walled, emptyTerrain(), { rand: seeded(1) }), undefined);
  // Far too far a distance asked for: still finds a spot (the rule is a preference).
  assert.ok(chooseLair(base, emptyTerrain(), { current: { areaId: "test", x: 20, y: 25 }, minFromCurrent: 500, rand: seeded(2) }));
});

test("terrain changed by disasters counts: burnt or flooded ground is not a perch, a crater is not either", () => {
  const base = area();
  const terrain = emptyTerrain();
  for (let y = 3; y < base.height - 3; y++) for (let x = 3; x < base.width - 3; x++) {
    if (tileNow(base, terrain, x, y).ground === T.ground) terrain.overrides[tileKey(x, y)] = { ground: T.burnt, grass: 0, until: "2099-01-01T00:00:00Z" };
  }
  assert.equal(chooseLair(base, terrain, { rand: seeded(3) }), undefined);
});
