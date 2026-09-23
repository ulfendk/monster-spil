import { test } from "node:test";
import assert from "node:assert/strict";
import { attemptCatch } from "../catch.js";
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

test("chance is clamped so it is never guaranteed nor impossible", () => {
  const easySpecies = makeSpecies({ catchRate: 5 });
  const target = makeParticipant("p", easySpecies, [], 0).active;

  assert.equal(attemptCatch(target, easySpecies, fixedRng(0.94)), true);
  assert.equal(attemptCatch(target, easySpecies, fixedRng(0.96)), false);
});
