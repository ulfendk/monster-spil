import { test } from "node:test";
import assert from "node:assert/strict";
import { attemptCatch, CATCH_EASE } from "../catch.js";
import { makeSpecies, makeParticipant } from "./fixtures.js";
import type { Rng } from "../rng.js";

function fixedRng(value: number): Rng {
  return { next: () => value };
}

test("a near-fainted target is easier to catch than a full-health one", () => {
  const species = makeSpecies({ catchRate: 0.5 });
  const full = makeParticipant("p", species, [], species.baseStats.hp).active;
  const low = makeParticipant("p", species, [], 1).active;
  const roll = 0.4;

  assert.equal(attemptCatch(full, species, fixedRng(roll)), false);
  assert.equal(attemptCatch(low, species, fixedRng(roll)), true);
});

test("catching is 30% easier than the catch rates alone", () => {
  assert.equal(CATCH_EASE, 1.3);
  const species = makeSpecies({ catchRate: 0.4 });
  const half = makeParticipant("p", species, [], species.baseStats.hp / 2).active;
  // Without the ease the chance would be 0.4 × (1.5 − 0.5) = 0.4; with it, 0.52.
  assert.equal(attemptCatch(half, species, fixedRng(0.5)), true);
  assert.equal(attemptCatch(half, species, fixedRng(0.53)), false);
});

test("chance is clamped so it is never guaranteed nor impossible", () => {
  const easySpecies = makeSpecies({ catchRate: 5 });
  const target = makeParticipant("p", easySpecies, [], 0).active;

  assert.equal(attemptCatch(target, easySpecies, fixedRng(0.94)), true);
  assert.equal(attemptCatch(target, easySpecies, fixedRng(0.96)), false);
});
