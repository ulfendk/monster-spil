import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  FORM_BODIES, FORM_BUILDS, FORM_CRESTS, FORM_EARS, FORM_EXTRAS, FORM_EYES, FORM_HORNS, FORM_LEGS, FORM_MOUTHS, FORM_PATTERNS, FORM_SHAPES, FORM_SNOUTS, FORM_TAILS,
  type CreatureSpecies,
} from "../../types/creature.js";
import type { Move } from "../../types/move.js";
import { indexCreatures, indexMoves, validateContent } from "../content-loader.js";
import { RIDE_GAITS, rideGait } from "../../creature/riding.js";

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

test("every monster can be found somewhere (or is a starter or a reward)", () => {
  const json = (file: string) => JSON.parse(readFileSync(path.join(contentDir, file), "utf-8"));
  const ids = (list: Array<{ speciesId: string; weight?: number }> = []) => list.filter((e) => e.weight !== 0).map((e) => e.speciesId);
  const metas = readdirSync(path.join(contentDir, "areas")).filter((f) => f.endsWith(".meta.json")).map((f) => json(`areas/${f}`));
  const found = new Set<string>([
    "flammepels", "dryppel", "lovgro", // the starters (client/src/scenes/StarterScene.ts)
    ...metas.flatMap((meta) => [
      ...ids(meta.encounterTable),
      ...(meta.regions ?? []).flatMap((r: { encounterTable: [] }) => ids(r.encounterTable)),
      ...Object.values(meta.habitats ?? {}).flatMap((h) => ids((h as { encounterTable: [] }).encounterTable)),
    ]),
    ...json("caves.json").kinds.flatMap((k: { species: [] }) => ids(k.species)),
    ...ids(json("minigames.json").dig.monsters),
    ...ids(json("minigames.json").dig.sandMonsters),
    ...Object.values(json("disasters.json") as Record<string, { speciesId?: string }>).map((d) => d.speciesId ?? ""),
    ...["raid", "beasts"].flatMap((dir) => readdirSync(path.join(contentDir, dir)).filter((f) => f.endsWith(".json")).map((f) => json(`${dir}/${f}`).rewardSpeciesId)),
  ]);
  for (const s of loadCreatures()) assert.ok(found.has(s.id), `${s.id} lives nowhere`);
  for (const id of found) assert.ok(loadCreatures().some((s) => s.id === id), `unknown monster ${id}`);
});

test("some monsters can be ridden, each in a way of moving the game knows", () => {
  const species = loadCreatures();
  const riders = species.filter((s) => s.ride !== undefined);
  assert.ok(riders.length >= 5, "a few monsters to ride");
  for (const s of riders) assert.ok(rideGait(s), `${s.id}: "ride" is true or one of ${RIDE_GAITS.join(", ")}`);
  for (const s of species) if (s.wings !== undefined) assert.ok(s.wings === "bat" || s.wings === "feather", `${s.id}: wings are "bat" or "feather"`);
  for (const s of species) if (s.shell !== undefined) assert.equal(s.shell, true, `${s.id}: "shell" is true or left out`);
});

test("every monster's look (\"form\") uses only words the game can build", () => {
  const lists: Record<string, readonly string[]> = {
    body: FORM_BODIES, shape: FORM_SHAPES, legs: FORM_LEGS, build: FORM_BUILDS, ears: FORM_EARS, snout: FORM_SNOUTS, horns: FORM_HORNS,
    crest: FORM_CRESTS, tail: FORM_TAILS, eyes: FORM_EYES, mouth: FORM_MOUTHS, pattern: FORM_PATTERNS,
  };
  const palette = /^[a-z][A-Za-z0-9]*(:-?\d+)?$/;
  // The dragon's, the serpent's and the eagle's babies are drawn as their parents; Flammeskæl is made by hand.
  const ownLook = new Set(["drageunge", "slangeunge", "oerneunge", "ildflagrer"]);
  for (const s of loadCreatures()) {
    if (ownLook.has(s.id)) continue;
    const form = s.form;
    assert.ok(form, `${s.id} has a "form"`);
    for (const [key, value] of Object.entries(form)) {
      if (key === "extras") {
        for (const e of value as string[]) assert.ok((FORM_EXTRAS as readonly string[]).includes(e), `${s.id}: unknown extra "${e}"`);
      } else if (key === "colour" || key === "belly" || key === "accent") {
        assert.ok(palette.test(value as string), `${s.id}: ${key} "${value}" is a palette name`);
      } else {
        assert.ok(lists[key], `${s.id}: unknown form key "${key}"`);
        assert.ok(lists[key]!.includes(value as string), `${s.id}: ${key} "${value}" is one of ${lists[key]!.join(", ")}`);
      }
    }
  }
});
