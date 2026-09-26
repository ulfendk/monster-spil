import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BEAST_SETTINGS,
  beastDue,
  beastView,
  chooseBeastSpot,
  cleanBeastSettings,
  freshBeast,
  habitatTile,
  nextBeastAt,
  type BeastDefinition,
} from "../beasts.js";
import { raidTurn, startAttempt, contributors } from "../raid.js";
import { createTeam, joinTeam, startTeam, submitTeamAction } from "../team.js";
import { emptyTerrain, staysConnected, tileKey, tileNow, walkableNow, type BaseArea } from "../../world/terrain.js";
import type { BattleParticipant } from "../../types/battle.js";

const T = { ground: 1, tree: 2, grass: 3, water: 4, path: 5, mountain: 6, burnt: 7, crater: 8, flood: 9, log: 10, crack: 11, rubble: 12, wreck: 13, sand: 14 };

/** A 40×30 map: tree border, a road, a dune field in the east, a big grove in the west, tall grass. */
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
      else if (x >= 28 && x <= 36 && y >= 3 && y <= 10) g = T.sand;
      else if (x >= 3 && x <= 9 && y >= 3 && y <= 10) g = T.tree;
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

const serpent: BeastDefinition = {
  id: "sandslange",
  navn: "Sandslangen",
  type: "sten",
  maxHp: 250,
  baseStats: { hp: 250, angreb: 11, forsvar: 10, fart: 8 },
  moves: [{ id: "sandhug", navn: "Sandhug", type: "sten", power: 35, accuracy: 0.95 }],
  spriteFront: "beasts/sandslange_front.png",
  spriteBack: "beasts/sandslange_back.png",
  rewardSpeciesId: "slangeunge",
  restSeconds: 30,
  habitat: "sand",
};

function seat(playerId: string, hp = 40): BattleParticipant {
  return {
    playerId,
    species: { id: "flammepels", navn: "Flammepels", type: "ild", baseStats: { hp, angreb: 30, forsvar: 8, fart: 12 }, moveIds: ["slag"], spriteFront: "", spriteBack: "", catchRate: 0.5 },
    moves: { slag: { id: "slag", navn: "Slag", type: "ild", power: 60, accuracy: 1 } },
    active: { instanceId: `${playerId}-1`, speciesId: "flammepels", ownerId: playerId, niveau: 5, currentHp: hp, caughtAt: "" },
  };
}

test("the next visit comes after the average gap, spread by the randomness", () => {
  const now = new Date("2026-09-26T12:00:00Z");
  const s = { ...DEFAULT_BEAST_SETTINGS, meanMinutes: 60, randomness: 0.5 };
  const min = (r: number) => (nextBeastAt(now, s, () => r).getTime() - now.getTime()) / 60_000;
  assert.equal(min(0.5), 60);
  assert.equal(min(0), 30);
  assert.ok(min(0.9999) < 90, "at most 1.5× the average");
  assert.equal((nextBeastAt(now, { ...s, meanMinutes: 5, randomness: 1 }, () => 0).getTime() - now.getTime()) / 60_000, 5, "never sooner than 5 minutes");
});

test("settings from the admin portal are checked and clamped", () => {
  assert.deepEqual(cleanBeastSettings({ enabled: false, meanMinutes: 1, stayMinutes: 999, randomness: -3 }, DEFAULT_BEAST_SETTINGS), {
    enabled: false,
    meanMinutes: 5,
    stayMinutes: 120,
    randomness: 0,
  });
  assert.equal(cleanBeastSettings({ stayMinutes: "long" }, DEFAULT_BEAST_SETTINGS).stayMinutes, DEFAULT_BEAST_SETTINGS.stayMinutes);
  assert.deepEqual(cleanBeastSettings(null, DEFAULT_BEAST_SETTINGS), DEFAULT_BEAST_SETTINGS);
});

test("serpents rise from sand; eagles land on open ground at a forest's edge", () => {
  const base = area();
  const terrain = emptyTerrain();
  assert.equal(habitatTile(base, terrain, "sand", 30, 5), true);
  assert.equal(habitatTile(base, terrain, "sand", 12, 12), false, "plain ground is no sand");
  assert.equal(habitatTile(base, terrain, "forest", 10, 6), true, "right next to the grove");
  assert.equal(habitatTile(base, terrain, "forest", 14, 12), false, "out in the open");
  assert.equal(habitatTile(base, terrain, "forest", 6, 6), false, "not inside the trees");
  // A map without sand has no serpents.
  const noSand = { ...base, tiles: { ...base.tiles, sand: undefined } };
  assert.equal(chooseBeastSpot(noSand, terrain, "sand", { rand: seeded(1) }), undefined);
});

test("a beast comes up in its habitat, with room around it, never next to someone and never cutting the map", () => {
  const base = area();
  const terrain = emptyTerrain();
  for (const habitat of ["sand", "forest"] as const) {
    for (let seed = 1; seed <= 30; seed++) {
      const players = [{ x: 30, y: 5 }, { x: 10, y: 4 }];
      const spot = chooseBeastSpot(base, terrain, habitat, { occupied: players, rand: seeded(seed) })!;
      assert.ok(spot, `${habitat} seed ${seed}`);
      assert.ok(habitatTile(base, terrain, habitat, spot.x, spot.y));
      for (const p of players) assert.ok(Math.max(Math.abs(p.x - spot.x), Math.abs(p.y - spot.y)) > 1, "not on or next to a player");
      let free = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && walkableNow(base, terrain, spot.x + dx, spot.y + dy)) free++;
      assert.ok(free >= 4, "room for a small team");
      assert.ok(staysConnected(base, (x, y) => walkableNow(base, terrain, x, y), new Set([tileKey(spot.x, spot.y)])));
    }
  }
});

test("a disaster's changes count: burnt sand is no place for a serpent", () => {
  const base = area();
  const terrain = emptyTerrain();
  for (let y = 3; y <= 10; y++) for (let x = 28; x <= 36; x++) terrain.overrides[tileKey(x, y)] = { ground: T.burnt, grass: 0, until: "2099-01-01T00:00:00Z" };
  assert.equal(tileNow(base, terrain, 30, 5).ground, T.burnt);
  assert.equal(chooseBeastSpot(base, terrain, "sand", { rand: seeded(3) }), undefined);
});

test("a fresh beast has full HP and leaves after the stay; its view hides nothing it shouldn't", () => {
  const now = new Date("2026-09-26T12:00:00Z");
  const beast = freshBeast(serpent, "visit-1", { areaId: "test", x: 30, y: 5 }, now, { ...DEFAULT_BEAST_SETTINGS, stayMinutes: 15 });
  assert.equal(beast.hp, 250);
  assert.equal(beast.leavesAt, "2026-09-26T12:15:00.000Z");
  assert.equal(beastDue(beast, new Date("2026-09-26T12:14:59Z")), false);
  assert.equal(beastDue(beast, new Date("2026-09-26T12:15:00Z")), true);
  const view = beastView({ ...beast, damageBy: { a: 10, b: 0 } });
  assert.deepEqual(view, { id: "visit-1", beastId: "sandslange", areaId: "test", x: 30, y: 5, hp: 250, maxHp: 250, defeated: false, contributors: 1, leavesAt: beast.leavesAt });
});

test("beasts are fought like the dragon: solo attempts and teams share the beast's HP", () => {
  const now = new Date("2026-09-26T12:00:00Z");
  let beast = freshBeast(serpent, "visit-1", { areaId: "test", x: 30, y: 5 }, now, DEFAULT_BEAST_SETTINGS);
  // Solo: a strong seat takes HP off the shared pool.
  const battle = startAttempt(beast, serpent, seat("anna"), 42);
  const solo = raidTurn(beast, battle, "anna", { kind: "move", moveId: "slag" }, now);
  assert.ok(solo.damage > 0);
  assert.equal(solo.raid.id, "visit-1", "the beast's own fields survive the turn");
  beast = solo.raid;
  // A team of two then fights on from where Anna left it.
  const created = createTeam("t1", "bo", seat("bo"));
  assert.ok(created.ok);
  const joined = joinTeam(created.session, "cia", seat("cia"));
  assert.ok(joined.ok);
  const started = startTeam(joined.session, "bo", 7);
  assert.ok(started.ok);
  const team = started.session;
  const hpBefore = beast.hp;
  const first = submitTeamAction(team, "bo", { kind: "move", moveId: "slag" }, beast, serpent, now);
  assert.ok(first.ok);
  const both = submitTeamAction(first.session, "cia", { kind: "move", moveId: "slag" }, first.raid, serpent, now);
  assert.ok(both.ok);
  assert.ok(both.raid.hp < hpBefore);
  assert.equal(both.raid.beastId, "sandslange");
  assert.deepEqual(new Set(contributors(both.raid)), new Set(["anna", "bo", "cia"].filter((p) => (both.raid.damageBy[p] ?? 0) > 0)));
});
