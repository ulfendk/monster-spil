import type { CreatureSpecies } from "../../types/creature.js";
import type { Move as MoveType } from "../../types/move.js";
import type { BattleParticipant } from "../../types/battle.js";

export function makeSpecies(overrides: Partial<CreatureSpecies> = {}): CreatureSpecies {
  return {
    id: "test-species",
    navn: "Testvæsen",
    type: "ild",
    baseStats: { hp: 40, angreb: 10, forsvar: 10, fart: 10 },
    moveIds: ["testangreb"],
    spriteFront: "x_front.png",
    spriteBack: "x_back.png",
    catchRate: 0.5,
    ...overrides,
  };
}

export function makeMove(overrides: Partial<MoveType> = {}): MoveType {
  return {
    id: "testangreb",
    navn: "Testangreb",
    type: "ild",
    power: 40,
    accuracy: 1,
    ...overrides,
  };
}

export function makeParticipant(
  playerId: string,
  species: CreatureSpecies,
  moves: MoveType[],
  currentHp = species.baseStats.hp
): BattleParticipant {
  return {
    playerId,
    species,
    moves: Object.fromEntries(moves.map((m) => [m.id, m])),
    active: {
      instanceId: `${playerId}-instance`,
      speciesId: species.id,
      ownerId: playerId,
      niveau: 1,
      currentHp,
      caughtAt: new Date(0).toISOString(),
    },
  };
}
