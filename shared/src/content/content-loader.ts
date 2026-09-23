import type { CreatureSpecies } from "../types/creature.js";
import type { Move } from "../types/move.js";

/**
 * Pure indexing of already-loaded content JSON. Fetching/importing the JSON
 * itself is the caller's job (browser `fetch` in the client, `fs`/`import` in
 * Node) so this module stays environment-agnostic.
 */
export function indexCreatures(
  species: CreatureSpecies[]
): Record<string, CreatureSpecies> {
  const byId: Record<string, CreatureSpecies> = {};
  for (const s of species) {
    if (byId[s.id]) {
      throw new Error(`Duplicate creature id: ${s.id}`);
    }
    byId[s.id] = s;
  }
  return byId;
}

export function indexMoves(moves: Move[]): Record<string, Move> {
  const byId: Record<string, Move> = {};
  for (const m of moves) {
    if (byId[m.id]) {
      throw new Error(`Duplicate move id: ${m.id}`);
    }
    byId[m.id] = m;
  }
  return byId;
}

/** Throws if any creature references a move id that isn't in the move table. */
export function validateContent(
  speciesById: Record<string, CreatureSpecies>,
  movesById: Record<string, Move>
): void {
  for (const species of Object.values(speciesById)) {
    for (const moveId of species.moveIds) {
      if (!movesById[moveId]) {
        throw new Error(
          `Creature "${species.id}" references unknown move id "${moveId}"`
        );
      }
    }
  }
}
