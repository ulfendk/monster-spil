import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { carryItem, itemDay, itemSpots, type ItemConfig } from "../items.js";
import { createBattle, resolveTurn } from "../../battle/engine.js";
import { createRng } from "../../battle/rng.js";
import { makeMove, makeParticipant, makeSpecies } from "../../battle/__tests__/fixtures.js";

const config: ItemConfig = JSON.parse(readFileSync(new URL("../../../content/items.json", import.meta.url), "utf8"));
const open = Array.from({ length: 1400 }, (_, i) => ({ x: i % 40, y: Math.floor(i / 40) }));

test("today's items: the same for everyone, different tomorrow, on open tiles, never two on one", () => {
  const a = itemSpots(config, "startskoven", "2026-09-27", open);
  assert.deepEqual(itemSpots(config, "startskoven", "2026-09-27", open), a, "the same for everyone on the same day");
  assert.notDeepEqual(itemSpots(config, "startskoven", "2026-09-28", open), a, "they move every day");
  assert.equal(a.length, Math.round(1400 / config.tilesPerItem));
  assert.equal(new Set(a.map((s) => `${s.x},${s.y}`)).size, a.length, "never two on one tile");
  assert.equal(new Set(a.map((s) => s.key)).size, a.length);
  for (const s of a) assert.ok(config.items.some((i) => i.id === s.itemId));
  assert.ok(itemSpots(config, "lille", "2026-09-27", open.slice(0, 20)).length >= 2, "a small map still has a couple");
  assert.deepEqual(itemSpots(config, "tom", "2026-09-27", []), []);
});

test("carrying: up to maxCarried of a kind", () => {
  assert.equal(carryItem(config, {}, "styrkedrik"), 1);
  assert.equal(carryItem(config, { styrkedrik: config.maxCarried }, "styrkedrik"), undefined);
  assert.equal(itemDay(new Date("2026-09-27T23:30:00Z")), "2026-09-28", "a new day at midnight in Denmark");
});

test("in a battle: a strength potion makes the next moves hit harder, then wears off", () => {
  const weak = makeSpecies({ baseStats: { hp: 200, angreb: 10, forsvar: 10, fart: 20 } });
  const foe = makeSpecies({ baseStats: { hp: 200, angreb: 1, forsvar: 10, fart: 1 } });
  const move = makeMove({ id: "slag", power: 40, accuracy: 1 });
  let state = createBattle(1, makeParticipant("player", weak, [move]), makeParticipant("wild", foe, [move]));
  const hit = (s: typeof state) => resolveTurn(s, [{ playerId: "player", action: { kind: "move", moveId: "slag" } }, { playerId: "wild", action: { kind: "move", moveId: "slag" } }], createRng(3));
  const damageOf = (before: typeof state, after: typeof state) => before.participants[1].active.currentHp - after.participants[1].active.currentHp;
  const plain = damageOf(state, hit(state));
  const potion = config.items.find((i) => i.id === "styrkedrik")!;
  state = resolveTurn(state, [{ playerId: "player", action: { kind: "item", navn: potion.navn, effect: potion.effect } }, { playerId: "wild", action: { kind: "move", moveId: "slag" } }], createRng(3));
  assert.equal(state.log.at(-2)?.kind === "item" || state.log.some((e) => e.kind === "item"), true, "the item is in the log");
  assert.equal(state.participants[0].boost?.moves, potion.effect.moves);
  let boosted = 0;
  for (let n = 0; n < potion.effect.moves!; n++) {
    const next = hit(state);
    boosted = damageOf(state, next);
    assert.ok(boosted > plain, `move ${n + 1} is stronger`);
    state = next;
  }
  assert.equal(state.participants[0].boost, undefined, "worn off after its moves");
  assert.equal(damageOf(state, hit(state)), plain, "back to normal");
});

test("in a battle: a feather means no misses, a healing potion heals", () => {
  const sp = makeSpecies({ baseStats: { hp: 100, angreb: 10, forsvar: 10, fart: 20 } });
  const wobbly = makeMove({ id: "vild", power: 30, accuracy: 0.01 });
  let state = createBattle(1, makeParticipant("player", sp, [wobbly], 30), makeParticipant("wild", sp, [wobbly]));
  const feather = config.items.find((i) => i.id === "sigtefjer")!;
  state = resolveTurn(state, [{ playerId: "player", action: { kind: "item", navn: feather.navn, effect: feather.effect } }], createRng(9));
  const next = resolveTurn(state, [{ playerId: "player", action: { kind: "move", moveId: "vild" } }], createRng(9));
  assert.equal(next.log.at(-1)?.kind, "damage", "a 1% move hits with the feather");
  const heal = config.items.find((i) => i.id === "helbredsdrik")!;
  const healed = resolveTurn(state, [{ playerId: "player", action: { kind: "item", navn: heal.navn, effect: heal.effect } }], createRng(9));
  assert.equal(healed.participants[0].active.currentHp, 80, "30 + half of 100");
});
