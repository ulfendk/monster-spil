import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  award,
  boostStats,
  emptyProgress,
  levelForXp,
  levelProgress,
  lookFor,
  monsterBonus,
  progressFromHistory,
  titleFor,
  xpForLevel,
  type Badge,
  type LevelConfig,
} from "../progress.js";

const content = (file: string) => JSON.parse(readFileSync(new URL(`../../../content/${file}`, import.meta.url), "utf8"));
const config: LevelConfig = content("levels.json");
const badges: Badge[] = content("badges.json");
const now = new Date("2026-09-26T12:00:00Z");

test("each level asks a little more XP than the last", () => {
  assert.equal(xpForLevel(1, config), 0);
  assert.equal(levelForXp(0, config), 1);
  let lastStep = 0;
  for (let level = 2; level <= config.maxLevel; level++) {
    const step = xpForLevel(level, config) - xpForLevel(level - 1, config);
    assert.ok(step > lastStep, `level ${level}`);
    lastStep = step;
    assert.equal(levelForXp(xpForLevel(level, config), config), level);
    assert.equal(levelForXp(xpForLevel(level, config) - 1, config), level - 1);
  }
  assert.equal(levelForXp(10_000_000, config), config.maxLevel, "never past the top");
  assert.equal(levelProgress(10_000_000, config), 1);
  const halfway = (xpForLevel(4, config) + xpForLevel(5, config)) / 2;
  assert.ok(Math.abs(levelProgress(halfway, config) - 0.5) < 1e-9);
});

test("titles and looks come with the levels", () => {
  assert.equal(titleFor(1, config), "Nybegynder");
  assert.equal(titleFor(2, config), "Nybegynder");
  assert.equal(titleFor(3, config), "Spejder");
  assert.equal(titleFor(config.maxLevel, config), config.titles.at(-1)!.navn);
  assert.equal(lookFor(1, config), undefined, "no hat at level 1");
  assert.equal(lookFor(config.looks[0]!.level, config), config.looks[0]!.id);
  assert.equal(lookFor(config.maxLevel, config), config.looks.at(-1)!.id, "the finest one at the top");
});

test("monsters grow a little stronger with the level, up to a cap; HP stays", () => {
  assert.equal(monsterBonus(1, config), 0);
  assert.ok(Math.abs(monsterBonus(6, config) - 5 * config.monsterBonusPerLevel) < 1e-9);
  assert.equal(monsterBonus(config.maxLevel, config), config.monsterBonusMax);
  const stats = { hp: 38, angreb: 13, forsvar: 8, fart: 12 };
  assert.deepEqual(boostStats(stats, 1, config), stats);
  const strong = boostStats(stats, config.maxLevel, config);
  assert.equal(strong.hp, 38);
  assert.equal(strong.fart, 12);
  assert.equal(strong.angreb, Math.round(13 * (1 + config.monsterBonusMax)));
  assert.ok(strong.forsvar > 8);
});

test("playing well is worth more: new species, wins, beating the dragon", () => {
  const ctx = { species: 1, now };
  const plain = award(emptyProgress(), { kind: "catch", newSpecies: false }, ctx, config, badges).gained;
  const fresh = award(emptyProgress(), { kind: "catch", newSpecies: true }, ctx, config, badges).gained;
  assert.ok(fresh > plain);
  assert.ok(award(emptyProgress(), { kind: "duel", won: true }, ctx, config, badges).gained > award(emptyProgress(), { kind: "duel", won: false }, ctx, config, badges).gained);
  assert.ok(award(emptyProgress(), { kind: "bossWin", boss: "dragon" }, ctx, config, badges).gained > award(emptyProgress(), { kind: "bossWin", boss: { beastId: "sandslange" } }, ctx, config, badges).gained);
  assert.equal(award(emptyProgress(), { kind: "bossDamage", amount: 95 }, ctx, config, badges).gained, Math.floor(95 / config.xp.bossDamagePerXp));
  assert.equal(award(emptyProgress(), { kind: "food" }, ctx, config, badges).gained, 0, "food counts for a badge, not XP");
});

test("events are counted, level-ups reported and badges earned once", () => {
  let p = emptyProgress();
  const ctx = { species: 1, now };
  const first = award(p, { kind: "catch", newSpecies: true, cave: true }, ctx, config, badges);
  p = first.progress;
  assert.equal(p.stats.catch, 1);
  assert.equal(p.stats.caveCatch, 1);
  assert.deepEqual(first.newBadges.map((b) => b.id), ["foerste-fangst"]);
  assert.equal(p.badges["foerste-fangst"], now.toISOString());
  const again = award(p, { kind: "catch", newSpecies: false }, ctx, config, badges);
  assert.ok(!again.newBadges.some((b) => b.id === "foerste-fangst"), "only once");
  // Enough XP for a level: a level-up is reported.
  const big = award({ ...p, xp: xpForLevel(3, config) - 1 }, { kind: "trade" }, ctx, config, badges);
  assert.deepEqual(big.levelUp, { from: 2, to: 3 });
  assert.ok(big.newBadges.some((b) => b.id === "byttemakker"));
  // A beast of each kind has its own counter (and badge).
  const serpent = award(p, { kind: "bossWin", boss: { beastId: "sandslange" } }, ctx, config, badges);
  assert.equal(serpent.progress.stats["beast:sandslange"], 1);
  assert.ok(serpent.newBadges.some((b) => b.id === "slangejaeger"));
  const cave = award(p, { kind: "caveVisit", caveKind: "lava" }, ctx, config, badges);
  assert.equal(cave.progress.stats["cave:lava"], 1);
});

test("a save from before levels gets credit for what it has caught", () => {
  const p = progressFromHistory({ stenbid: 3, gnistrot: 2, istap: 0 }, now, config, badges);
  assert.equal(p.xp, 5 * config.xp.catch + 2 * config.xp.newSpecies);
  assert.equal(p.stats.catch, 5);
  assert.ok(p.badges["foerste-fangst"]);
  assert.deepEqual(progressFromHistory({}, now, config, badges), { xp: 0, stats: {}, badges: {} });
});

test("the content files make sense", () => {
  const counters = new Set(["catch", "caveCatch", "caveVisit", "wildWin", "duel", "duelWin", "trade", "food", "bossDamage", "dragonWin", "species", "level"]);
  const ids = new Set<string>();
  for (const b of badges) {
    assert.ok(!ids.has(b.id), `badge ids are unique: ${b.id}`);
    ids.add(b.id);
    assert.ok(/^[a-z0-9-]+$/.test(b.id), `ASCII slug: ${b.id}`);
    assert.ok(counters.has(b.stat) || /^beast:[a-z0-9]+$/.test(b.stat) || /^cave:[a-z0-9]+$/.test(b.stat), `a counter the game keeps: ${b.stat}`);
    assert.ok(b.min > 0);
  }
  for (const list of [config.titles, config.looks]) {
    for (let i = 1; i < list.length; i++) assert.ok(list[i]!.level > list[i - 1]!.level, "in level order");
  }
  assert.equal(config.titles[0]!.level, 1, "everyone has a title");
  for (const l of config.looks) assert.ok(["hachimaki", "kasa", "kabuto", "krone"].includes(l.id), `a look the figures can wear: ${l.id}`);
});
