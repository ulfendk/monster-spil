import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { CreatureSpecies } from "../../types/creature.js";
import type { Move } from "../../types/move.js";
import { indexCreatures, indexMoves, validateContent } from "../content-loader.js";

const contentDir = path.join(import.meta.dirname, "../../../content");

function loadCreatures(): CreatureSpecies[] {
  const dir = path.join(contentDir, "creatures");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf-8")) as CreatureSpecies);
}

function loadMoves(): Move[] {
  return JSON.parse(readFileSync(path.join(contentDir, "moves.json"), "utf-8")) as Move[];
}

test("all six placeholder creatures load and index without id collisions", () => {
  const species = loadCreatures();
  assert.equal(species.length, 6);
  const byId = indexCreatures(species);
  assert.equal(Object.keys(byId).length, 6);
});

test("moves load and index without id collisions", () => {
  const moves = loadMoves();
  assert.ok(moves.length > 0);
  const byId = indexMoves(moves);
  assert.equal(Object.keys(byId).length, moves.length);
});

test("every creature's moveIds resolve against the move table", () => {
  const speciesById = indexCreatures(loadCreatures());
  const movesById = indexMoves(loadMoves());
  assert.doesNotThrow(() => validateContent(speciesById, movesById));
});

test("each creature has 3-4 moves and positive stats", () => {
  for (const species of loadCreatures()) {
    assert.ok(
      species.moveIds.length >= 3 && species.moveIds.length <= 4,
      `${species.id} has ${species.moveIds.length} moves`
    );
    for (const [stat, value] of Object.entries(species.baseStats)) {
      assert.ok(value > 0, `${species.id}.${stat} should be positive`);
    }
  }
});
