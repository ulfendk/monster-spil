import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { eggProgress, nestHasRoom, newEgg, walkEggs, type EggConfig } from "../eggs.js";

const config: EggConfig = JSON.parse(readFileSync(new URL("../../../content/eggs.json", import.meta.url), "utf8"));
const now = new Date("2026-09-27T10:00:00Z");
function seeded(seed: number): () => number {
  let a = seed;
  return () => ((a = (a * 16807) % 2147483647) / 2147483647);
}

test("an egg holds a monster of its type, from the pools", () => {
  const rand = seeded(5);
  for (let i = 0; i < 200; i++) {
    const egg = newEgg(config, `e${i}`, now, rand, () => "gylden");
    assert.ok(config.pools[egg.type].includes(egg.speciesId), `${egg.speciesId} is a ${egg.type} egg's`);
    assert.equal(egg.stepsLeft, config.stepsToHatch);
  }
});

test("some eggs hold a rare variant, about as often as the config says", () => {
  const rand = seeded(11);
  let variants = 0;
  for (let i = 0; i < 5000; i++) if (newEgg(config, `e${i}`, now, rand, () => "gylden").variant) variants++;
  assert.ok(Math.abs(variants / 5000 - config.variantChance) < 0.02);
});

test("walking hatches eggs; the nest has room for a few", () => {
  const egg = newEgg(config, "e1", now, seeded(2), () => undefined);
  let eggs = [egg, { ...egg, id: "e2", stepsLeft: 3 }];
  const first = walkEggs(eggs, 3);
  assert.deepEqual(first.hatched.map((e) => e.id), ["e2"]);
  assert.equal(first.waiting[0]!.stepsLeft, config.stepsToHatch - 3);
  eggs = first.waiting;
  assert.ok(Math.abs(eggProgress(config, eggs[0]!) - 3 / config.stepsToHatch) < 1e-9);
  assert.ok(nestHasRoom(config, eggs));
  assert.ok(!nestHasRoom(config, Array.from({ length: config.nestSize }, () => egg)));
});

test("every monster in the pools exists", () => {
  for (const pool of Object.values(config.pools)) {
    for (const id of pool) assert.ok(existsSync(new URL(`../../../content/creatures/${id}.json`, import.meta.url)), id);
  }
});
