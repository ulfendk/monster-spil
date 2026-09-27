import { boostStats, stageName, stageOf, stageStats, type BattleParticipant, type CreatureInstance, type CreatureSpecies, type Move } from "@shared";
import { levelConfig, levelOf } from "./content/load-progress";
import type { GameContent } from "./content/load-content";
import type { SaveData } from "./save/schema";
import { nurtureConfig } from "./content/load-nurture";

/** The moves a species knows, resolved against the flat move table (unknown ids are skipped). */
export function resolveMoves(species: CreatureSpecies, movesById: Record<string, Move>): Record<string, Move> {
  const result: Record<string, Move> = {};
  for (const id of species.moveIds) {
    const move = movesById[id];
    if (move) result[id] = move;
  }
  return result;
}

/**
 * Everything the battle engine needs about one side, so it does no content lookups itself —
 * as the monster is now: an evolved one fights under its stage's name, stronger all round.
 */
export function makeParticipant(playerId: string, creature: CreatureInstance, species: CreatureSpecies, content: GameContent): BattleParticipant {
  const stage = stageOf(creature, species);
  const staged = stage > 1 ? { ...species, navn: stageName(species, stage), baseStats: stageStats(species.baseStats, stage, nurtureConfig) } : species;
  const active = { ...creature, currentHp: Math.min(creature.currentHp, staged.baseStats.hp) };
  return { playerId, active, species: staged, moves: resolveMoves(species, content.movesById) };
}

/**
 * My monster's species as it fights for me: attack and defence grow a little with my player
 * level (levels.json: monsterBonusPerLevel, up to monsterBonusMax). HP stays as it is.
 */
export function mySpecies(save: SaveData, species: CreatureSpecies): CreatureSpecies {
  return { ...species, baseStats: boostStats(species.baseStats, levelOf(save.progress), levelConfig) };
}

/** My own first creature as a duel seat, including its species and moves (the server has no content files). */
export function seatFor(save: SaveData, content: GameContent): BattleParticipant {
  const creature = save.creatures[0]!;
  return makeParticipant(save.player.id, creature, mySpecies(save, content.speciesById[creature.speciesId]!), content);
}
