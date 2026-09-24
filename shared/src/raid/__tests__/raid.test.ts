import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  BOSS_PLAYER_ID,
  contributors,
  currentRaid,
  freshRaid,
  raidTurn,
  raidView,
  startAttempt,
  weekIdFor,
  type BossDefinition,
} from "../raid.js";
import { makeSpecies, makeMove, makeParticipant } from "../../battle/__tests__/fixtures.js";

const boss: BossDefinition = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "../../../content/raid/kaempedragen.json"), "utf-8")
);

test("the week starts Monday 00:00 Danish time, across summer and winter time", () => {
  // Sunday 23:30 in Copenhagen (summer, UTC+2) still belongs to the week that began the Monday before.
  assert.equal(weekIdFor(new Date("2026-09-27T21:30:00Z")), "2026-09-21");
  // Monday 00:30 in Copenhagen is a new week, although it is still Sunday in UTC.
  assert.equal(weekIdFor(new Date("2026-09-27T22:30:00Z")), "2026-09-28");
  // Winter time (UTC+1).
  assert.equal(weekIdFor(new Date("2026-12-20T22:59:00Z")), "2026-12-14");
  assert.equal(weekIdFor(new Date("2026-12-20T23:01:00Z")), "2026-12-21");
});

test("a new week wakes a fresh dragon; the same week keeps the stored one", () => {
  const monday = new Date("2026-09-21T10:00:00Z");
  const hurt = { ...freshRaid(boss, "2026-09-21"), hp: 100 };
  assert.equal(currentRaid(hurt, boss, monday), hurt);
  const nextWeek = currentRaid(hurt, boss, new Date("2026-09-29T10:00:00Z"));
  assert.equal(nextWeek.hp, boss.maxHp);
  assert.equal(nextWeek.weekId, "2026-09-28");
  assert.deepEqual(nextWeek.damageBy, {});
});

const strongMove = makeMove({ id: "slag", type: "vand", power: 150, accuracy: 1 });
const seat = (id: string, hp = 40) =>
  makeParticipant(id, makeSpecies({ id: "helt", baseStats: { hp, angreb: 60, forsvar: 10, fart: 50 } }), [strongMove]);
const now = new Date("2026-09-22T12:00:00Z");

test("damage comes off the shared HP and is credited to the attacker", () => {
  const raid = freshRaid(boss, weekIdFor(now));
  const battle = startAttempt(raid, boss, seat("alice"), 7);
  assert.equal(battle.mode, "boss");
  const r = raidTurn(raid, battle, "alice", { kind: "move", moveId: "slag" }, now);
  assert.ok(r.damage > 0);
  assert.equal(r.raid.hp, boss.maxHp - r.damage);
  assert.equal(r.raid.damageBy["alice"], r.damage);
  assert.equal(r.battle.participants[1].active.currentHp, r.raid.hp);
});

test("each turn starts from the latest shared HP, so parallel attempts add up", () => {
  let raid = freshRaid(boss, weekIdFor(now));
  const a = startAttempt(raid, boss, seat("alice"), 1);
  const b = startAttempt(raid, boss, seat("bob"), 2);
  const first = raidTurn(raid, a, "alice", { kind: "move", moveId: "slag" }, now);
  raid = first.raid;
  const second = raidTurn(raid, b, "bob", { kind: "move", moveId: "slag" }, now);
  assert.equal(second.raid.hp, boss.maxHp - first.damage - second.damage);
  assert.deepEqual(contributors(second.raid).sort(), ["alice", "bob"]);
  assert.equal(raidView(second.raid).contributors, 2);
});

test("the turn that empties the HP beats the dragon and records the final blow", () => {
  const raid = { ...freshRaid(boss, weekIdFor(now)), hp: 5, damageBy: { bob: 595 } };
  const r = raidTurn(raid, startAttempt(raid, boss, seat("alice"), 3), "alice", { kind: "move", moveId: "slag" }, now);
  assert.equal(r.defeatedNow, true);
  assert.equal(r.raid.hp, 0);
  assert.equal(r.raid.finalBlowBy, "alice");
  assert.equal(r.battle.winnerId, "alice");
  assert.equal(raidView(r.raid).defeated, true);
  // Nothing more happens to a beaten dragon.
  const again = raidTurn(r.raid, startAttempt(r.raid, boss, seat("bob"), 4), "bob", { kind: "move", moveId: "slag" }, now);
  assert.equal(again.damage, 0);
});

test("fleeing ends the attempt without hurting anyone, and the dragon cannot be caught", () => {
  const raid = freshRaid(boss, weekIdFor(now));
  const battle = startAttempt(raid, boss, seat("alice"), 5);
  const fled = raidTurn(raid, battle, "alice", { kind: "flee" }, now);
  assert.equal(fled.battle.outcome, "fled");
  assert.equal(fled.damage, 0);
  assert.equal(fled.raid.hp, boss.maxHp);
});

test("a weak monster eventually faints and the dragon wins that attempt", () => {
  let raid = freshRaid(boss, weekIdFor(now));
  const weak = makeParticipant("alice", makeSpecies({ id: "svag", baseStats: { hp: 20, angreb: 5, forsvar: 5, fart: 1 } }), [makeMove({ id: "prik", power: 5 })]);
  let battle = startAttempt(raid, boss, weak, 9);
  for (let i = 0; i < 20 && battle.outcome === "ongoing"; i++) {
    const r = raidTurn(raid, battle, "alice", { kind: "move", moveId: "prik" }, now);
    raid = r.raid;
    battle = r.battle;
  }
  assert.equal(battle.outcome, "lost");
  assert.equal(battle.winnerId, BOSS_PLAYER_ID);
  assert.ok(raid.hp > 0);
});

test("the same seed and choices always give the same turn", () => {
  const raid = freshRaid(boss, weekIdFor(now));
  const run = () => JSON.stringify(raidTurn(raid, startAttempt(raid, boss, seat("alice"), 11), "alice", { kind: "move", moveId: "slag" }, now));
  assert.equal(run(), run());
});
