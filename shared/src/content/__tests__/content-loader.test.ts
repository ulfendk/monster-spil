import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

test("all creatures load and index without id collisions", () => {
  const species = loadCreatures();
  assert.ok(species.length >= 7);
  const byId = indexCreatures(species);
  assert.equal(Object.keys(byId).length, species.length);
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

test("every creature's sound file exists and is a format iPad Safari plays", () => {
  for (const s of loadCreatures()) {
    if (!s.sound) continue;
    assert.match(s.sound, /\.(wav|mp3|m4a)$/, `${s.id}: sound must be wav, mp3 or m4a`);
    assert.ok(existsSync(path.join(contentDir, s.sound)), `${s.id}: missing file ${s.sound}`);
  }
});

test("every monster has a cry", () => {
  for (const s of loadCreatures()) assert.ok(s.sound, `${s.id} has no sound`);
});
