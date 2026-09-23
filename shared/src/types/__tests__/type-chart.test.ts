import { test } from "node:test";
import assert from "node:assert/strict";
import { getMultiplier } from "../type-chart.js";
import type { TypeId } from "../creature.js";

test("attacker gets 1.5x against the type it beats", () => {
  assert.equal(getMultiplier("ild", "graes"), 1.5);
});

test("attacker gets 0.5x against the type that beats it", () => {
  assert.equal(getMultiplier("ild", "sten"), 0.5);
});

test("same or unrelated types deal neutral damage", () => {
  assert.equal(getMultiplier("ild", "ild"), 1);
  assert.equal(getMultiplier("ild", "vand"), 1);
});

test("the five types form a single closed cycle", () => {
  const types: TypeId[] = ["ild", "graes", "lyn", "vand", "sten"];
  for (let i = 0; i < types.length; i++) {
    const attacker = types[i];
    const beats = types[(i + 1) % types.length];
    assert.equal(getMultiplier(attacker, beats), 1.5, `${attacker} should beat ${beats}`);
  }
});
