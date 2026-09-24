import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DISASTER_SETTINGS,
  DISASTER_KINDS,
  applyDisaster,
  cleanDisasterSettings,
  nextDisasterAt,
  pickDisasterKind,
  planDisaster,
  possibleKinds,
  type DisasterConfig,
  type DisasterConfigs,
  type DisasterKind,
} from "../disasters.js";
import { emptyTerrain, healAllNow, healTerrain, staysConnected, tileKey, tileNow, walkableNow, zoneAt, type BaseArea } from "../terrain.js";

const T = { ground: 1, tree: 2, grass: 3, water: 4, path: 5, mountain: 6, burnt: 7, crater: 8, flood: 9, log: 10, crack: 11, rubble: 12, wreck: 13 };

/** A 30×20 test map: tree border, a road through the middle, a pond, a grove and some tall grass. */
function testArea(): BaseArea {
  const W = 30;
  const H = 20;
  const ground: number[] = [];
  const grass: number[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let g = T.ground;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) g = T.tree;
      else if (y === 10) g = T.path;
      else if ((x - 22) ** 2 / 9 + (y - 5) ** 2 / 4 <= 1) g = T.water;
      else if (x >= 4 && x <= 8 && y >= 3 && y <= 6) g = T.tree;
      else if (x >= 20 && x <= 26 && y >= 14 && y <= 16) g = T.mountain;
      ground.push(g);
      grass.push(x >= 10 && x <= 14 && y >= 13 && y <= 16 ? T.grass : 0);
    }
  return { id: "test", width: W, height: H, ground, grass, blocking: [T.tree, T.water, T.mountain, T.log, T.crack, T.wreck], tiles: T, start: { x: 15, y: 10 }, fixed: [{ x: 3, y: 16 }] };
}

const config = (over: Partial<DisasterConfig> = {}): DisasterConfig => ({
  navn: "X",
  weight: 1,
  warnSeconds: 5,
  radius: 3,
  healHours: 10,
  speciesId: "sjælden",
  zoneHours: 5,
  zoneRate: 0.3,
  ...over,
});
const configs = Object.fromEntries(DISASTER_KINDS.map((k) => [k, config()])) as DisasterConfigs;

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOW = new Date("2026-09-25T12:00:00Z");
const hours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

test("a meteor leaves a lasting crater, burnt ground that heals, and rare monsters for a while", () => {
  const base = testArea();
  const terrain = emptyTerrain();
  const plan = planDisaster("meteor", base, terrain, config(), seeded(1), { id: "m1", target: { x: 15, y: 15 } });
  applyDisaster(base, terrain, plan, config(), NOW);
  assert.equal(tileNow(base, terrain, 15, 15).ground, T.crater);
  assert.equal(tileNow(base, terrain, 12, 15).ground, T.burnt, "3 tiles out is burnt");
  assert.equal(tileNow(base, terrain, 12, 15).grass, 0, "the grass there is gone");
  assert.equal(zoneAt(terrain, 15, 15)?.speciesId, "sjælden");
  assert.ok(plan.danger.includes(tileKey(15, 15)) && plan.danger.includes(tileKey(11, 15)), "the danger area reaches one tile past the blast");

  healTerrain(base, terrain, hours(6));
  assert.equal(zoneAt(terrain, 15, 15), undefined, "the rare monster is gone after zoneHours");
  assert.equal(tileNow(base, terrain, 12, 15).ground, T.burnt, "not healed yet");
  healTerrain(base, terrain, hours(11));
  assert.equal(tileNow(base, terrain, 12, 15).ground, T.ground, "burnt ground heals");
  assert.equal(tileNow(base, terrain, 12, 15).grass, T.grass, "and the tall grass grows back");
  assert.equal(tileNow(base, terrain, 15, 15).ground, T.crater, "the crater stays");
});

test("a soft change over a hard one heals back to the hard one", () => {
  const base = testArea();
  const terrain = emptyTerrain();
  applyDisaster(base, terrain, planDisaster("meteor", base, terrain, config(), seeded(2), { id: "a", target: { x: 15, y: 15 } }), config(), NOW);
  applyDisaster(base, terrain, planDisaster("dragonfire", base, terrain, config({ radius: 3 }), seeded(3), { id: "b", lair: { x: 15, y: 13 } }), config(), NOW);
  healTerrain(base, terrain, hours(20));
  assert.equal(tileNow(base, terrain, 15, 15).ground, T.crater);
});

test("no disaster ever cuts part of the map off or blocks the start or a protected tile", () => {
  const base = testArea();
  for (let seed = 1; seed <= 60; seed++) {
    const terrain = emptyTerrain();
    const rand = seeded(seed);
    for (let i = 0; i < 8; i++) {
      const kind = DISASTER_KINDS[Math.floor(rand() * DISASTER_KINDS.length)]!;
      const player = { x: 10, y: 10 };
      const plan = planDisaster(kind, base, terrain, config(), rand, { id: `${seed}-${i}`, lair: { x: 3, y: 16 }, keepWalkable: [player] });
      applyDisaster(base, terrain, plan, config(), hours(i));
      assert.ok(staysConnected(base, (x, y) => walkableNow(base, terrain, x, y), new Set()), `seed ${seed}, ${kind}: map still connected`);
      assert.ok(walkableNow(base, terrain, base.start.x, base.start.y), "start stays walkable");
      assert.ok(walkableNow(base, terrain, player.x, player.y), "where a player stands stays walkable");
      assert.equal(tileNow(base, terrain, 3, 16).ground, T.ground, "the lair never changes");
    }
    healTerrain(base, terrain, hours(1000));
    assert.ok(staysConnected(base, (x, y) => walkableNow(base, terrain, x, y), new Set()), `seed ${seed}: still connected after healing`);
  }
});

test("an earthquake opens a fissure that closes again and raises a hill that stays", () => {
  const base = testArea();
  const terrain = emptyTerrain();
  const plan = planDisaster("earthquake", base, terrain, config(), seeded(7), { id: "e", target: { x: 14, y: 6 } });
  applyDisaster(base, terrain, plan, config({ healHours: 72 }), NOW);
  const cracks = plan.changes.filter((c) => c.state.ground === T.crack);
  const hill = plan.changes.filter((c) => c.state.ground === T.mountain);
  assert.ok(cracks.length > 0 && cracks.every((c) => c.soft), "soft fissure");
  assert.ok(hill.every((c) => !c.soft), "the hill is permanent");
  healTerrain(base, terrain, hours(73));
  assert.ok(!Object.values(terrain.overrides).some((o) => o.ground === T.crack), "the fissure has closed");
});

test("a flood spreads from a pond onto the land around it, then drains", () => {
  const base = testArea();
  const terrain = emptyTerrain();
  const plan = planDisaster("flood", base, terrain, config({ radius: 2 }), seeded(4), { id: "f", target: { x: 22, y: 5 } });
  applyDisaster(base, terrain, plan, config({ healHours: 8 }), NOW);
  assert.equal(tileNow(base, terrain, 22, 8).ground, T.flood, "the shore is under water");
  assert.ok(walkableNow(base, terrain, 22, 8), "floodwater is shallow: you can wade through it");
  assert.equal(tileNow(base, terrain, 22, 16).ground, T.mountain, "far away is untouched");
  healTerrain(base, terrain, hours(9));
  assert.equal(tileNow(base, terrain, 22, 8).ground, T.ground);
});

test("a hurricane knocks down trees along its path and scatters extra food", () => {
  const base = testArea();
  const terrain = emptyTerrain();
  const plan = planDisaster("hurricane", base, terrain, config({ radius: 1, extraFood: 4 }), seeded(11), { id: "h", target: { x: 6, y: 5 } });
  assert.ok(plan.changes.some((c) => c.state.ground === T.log || (c.state.ground === T.ground && !c.soft)), "trees fall or are torn away");
  assert.ok(plan.food.length > 0 && plan.food.length <= 4);
  for (const f of plan.food) {
    const c = plan.changes.find((ch) => ch.key === tileKey(f.x, f.y));
    assert.ok(c ? c.state.ground !== T.log : walkableNow(base, terrain, f.x, f.y), "food lands where you can pick it up");
  }
});

test("a UFO crash leaves a wreck and a single alien next to it", () => {
  const base = testArea();
  const terrain = emptyTerrain();
  const plan = planDisaster("ufo", base, terrain, config({ zoneRate: 0, zoneHours: 6 }), seeded(5), { id: "u", target: { x: 15, y: 15 } });
  applyDisaster(base, terrain, plan, config({ zoneRate: 0, zoneHours: 6 }), NOW);
  assert.equal(tileNow(base, terrain, 15, 15).ground, T.wreck);
  assert.equal(terrain.spawns.length, 1);
  const s = terrain.spawns[0]!;
  assert.equal(Math.abs(s.x - 15) + Math.abs(s.y - 15), 1, "right next to the wreck");
  assert.ok(walkableNow(base, terrain, s.x, s.y));
  assert.equal(terrain.zones.length, 0, "no zone: just the one alien");
  healTerrain(base, terrain, hours(7));
  assert.equal(terrain.spawns.length, 0, "it leaves after a while");
});

test("healing everything now keeps the hard changes", () => {
  const base = testArea();
  const terrain = emptyTerrain();
  applyDisaster(base, terrain, planDisaster("meteor", base, terrain, config(), seeded(1), { id: "m", target: { x: 15, y: 15 } }), config(), NOW);
  healAllNow(base, terrain, NOW);
  assert.ok(Object.values(terrain.overrides).every((o) => !o.until));
  assert.equal(tileNow(base, terrain, 15, 15).ground, T.crater);
});

test("the next disaster comes after the average gap, spread by the randomness", () => {
  const s = { ...DEFAULT_DISASTER_SETTINGS, meanMinutes: 60, randomness: 0.5 };
  const min = (r: number) => (nextDisasterAt(NOW, s, () => r).getTime() - NOW.getTime()) / 60_000;
  assert.equal(min(0.5), 60);
  assert.equal(min(0), 30);
  assert.ok(Math.abs(min(0.9999) - 90) < 0.01);
  assert.equal((nextDisasterAt(NOW, { ...s, randomness: 0 }, () => 0).getTime() - NOW.getTime()) / 60_000, 60);
  assert.equal((nextDisasterAt(NOW, { ...s, meanMinutes: 1, randomness: 1 }, () => 0).getTime() - NOW.getTime()) / 60_000, 2, "never sooner than 2 minutes");
});

test("kinds are picked by weight among those switched on and possible here", () => {
  const weights = { ...configs, ufo: config({ weight: 0 }), meteor: config({ weight: 1 }), flood: config({ weight: 3 }) };
  const on = { ...DEFAULT_DISASTER_SETTINGS, kinds: { meteor: true, earthquake: false, flood: true, hurricane: false, dragonfire: false, ufo: true } };
  const count: Partial<Record<DisasterKind, number>> = {};
  const rand = seeded(9);
  for (let i = 0; i < 4000; i++) {
    const k = pickDisasterKind(on, weights, ["meteor", "flood", "ufo", "earthquake"], rand)!;
    count[k] = (count[k] ?? 0) + 1;
  }
  assert.deepEqual(Object.keys(count).sort(), ["flood", "meteor"]);
  assert.ok(count.flood! / count.meteor! > 2.5 && count.flood! / count.meteor! < 3.5);
  assert.equal(pickDisasterKind({ ...on, kinds: { ...on.kinds, meteor: false, flood: false } }, weights, ["meteor", "flood"], rand), undefined);
  assert.deepEqual(possibleKinds(testArea(), undefined).includes("dragonfire"), false, "no dragon, no dragon fire");
});

test("settings from the admin portal are checked and clamped", () => {
  const s = cleanDisasterSettings({ enabled: false, meanMinutes: 0, randomness: 7, kinds: { ufo: false, meteor: "yes" } }, DEFAULT_DISASTER_SETTINGS);
  assert.equal(s.enabled, false);
  assert.equal(s.meanMinutes, 2);
  assert.equal(s.randomness, 1);
  assert.equal(s.kinds.ufo, false);
  assert.equal(s.kinds.meteor, true, "a non-boolean keeps the old value");
  assert.deepEqual(cleanDisasterSettings(null, DEFAULT_DISASTER_SETTINGS), DEFAULT_DISASTER_SETTINGS);
});
