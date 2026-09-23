import type { CreatureSpecies, Move } from "@shared";
import { indexCreatures, indexMoves, validateContent } from "@shared";

/**
 * import.meta.glob picks up every JSON file matching the pattern at build
 * time — adding a new creature file needs no code change here, satisfying
 * the "zero TypeScript changes to add content" rule.
 */
const creatureModules = import.meta.glob<CreatureSpecies>(
  "../../../shared/content/creatures/*.json",
  { eager: true, import: "default" }
);
const moveModules = import.meta.glob<Move[]>("../../../shared/content/moves.json", {
  eager: true,
  import: "default",
});

export interface GameContent {
  speciesById: Record<string, CreatureSpecies>;
  movesById: Record<string, Move>;
}

export function loadContent(): GameContent {
  const species = Object.values(creatureModules);
  const moves = Object.values(moveModules)[0] ?? [];
  const speciesById = indexCreatures(species);
  const movesById = indexMoves(moves);
  validateContent(speciesById, movesById);
  return { speciesById, movesById };
}
