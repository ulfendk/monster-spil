import type { BattleParticipant, CreatureInstance, CreatureSpecies, Move } from "@shared";
import type { GameContent } from "./content/load-content";
import type { SaveData } from "./save/schema";

/** The moves a species knows, resolved against the flat move table (unknown ids are skipped). */
export function resolveMoves(species: CreatureSpecies, movesById: Record<string, Move>): Record<string, Move> {
  const result: Record<string, Move> = {};
  for (const id of species.moveIds) {
    const move = movesById[id];
    if (move) result[id] = move;
  }
  return result;
}

/** Everything the battle engine needs about one side, so it does no content lookups itself. */
export function makeParticipant(playerId: string, creature: CreatureInstance, species: CreatureSpecies, content: GameContent): BattleParticipant {
  return { playerId, active: { ...creature }, species, moves: resolveMoves(species, content.movesById) };
}

/** My own first creature as a duel seat, including its species and moves (the server has no content files). */
export function seatFor(save: SaveData, content: GameContent): BattleParticipant {
  const creature = save.creatures[0]!;
  return makeParticipant(save.player.id, creature, content.speciesById[creature.speciesId]!, content);
}
