import type { CreatureSpecies } from "../types/creature.js";
import type { Move } from "../types/move.js";
import { getMultiplier } from "../types/type-chart.js";
import type { BattleAction, BattleParticipant, BattleState, BattleLogEntry } from "../types/battle.js";
import type { Rng } from "./rng.js";
import { attemptCatch } from "./catch.js";

export function createBattle(
  seed: number,
  player: BattleParticipant,
  opponent: BattleParticipant
): BattleState {
  return {
    seed,
    turn: 0,
    participants: [player, opponent],
    log: [],
    outcome: "ongoing",
  };
}

/**
 * Pure and deterministic: given the same state, actions and rng sequence, it
 * always returns the same new state. Never mutates its inputs, and never
 * touches Math.random, I/O or content lookups — everything it needs is
 * already denormalized onto the participants.
 */
export function resolveTurn(
  state: BattleState,
  actions: { playerId: string; action: BattleAction }[],
  rng: Rng
): BattleState {
  if (state.outcome !== "ongoing") return state;

  const turn = state.turn + 1;
  const log: BattleLogEntry[] = [];
  const participants: [BattleParticipant, BattleParticipant] = [
    cloneParticipant(state.participants[0]),
    cloneParticipant(state.participants[1]),
  ];

  const getAction = (playerId: string): BattleAction | undefined =>
    actions.find((a) => a.playerId === playerId)?.action;

  for (const participant of participants) {
    const action = getAction(participant.playerId);
    if (!action) continue;

    if (action.kind === "flee") {
      log.push({
        turn,
        kind: "flee",
        text: `${speciesName(participant)} løb væk!`,
        targetPlayerId: participant.playerId,
      });
      return { ...state, turn, log: [...state.log, ...log], outcome: "fled" };
    }

    if (action.kind === "catch") {
      const opponent = otherParticipant(participants, participant);
      const success = attemptCatch(opponent.active, opponent.species, rng);
      log.push({
        turn,
        kind: success ? "catch-success" : "catch-fail",
        text: success ? `${speciesName(opponent)} blev fanget!` : `${speciesName(opponent)} slap fri!`,
        targetPlayerId: opponent.playerId,
      });
      return {
        ...state,
        turn,
        log: [...state.log, ...log],
        outcome: success ? "caught" : "ongoing",
      };
    }
  }

  // Both sides chose a move: faster species acts first, ties broken by rng.
  const order = [...participants].sort((a, b) => {
    const speedDiff = b.species.baseStats.fart - a.species.baseStats.fart;
    if (speedDiff !== 0) return speedDiff;
    return rng.next() - 0.5;
  });

  for (const attacker of order) {
    if (attacker.active.currentHp <= 0) continue;
    const defender = otherParticipant(participants, attacker);
    if (defender.active.currentHp <= 0) continue;

    const action = getAction(attacker.playerId);
    if (!action || action.kind !== "move") continue;

    const move = attacker.moves[action.moveId];
    if (!move) continue;

    if (rng.next() > move.accuracy) {
      log.push({
        turn,
        kind: "miss",
        text: `${speciesName(attacker)}s ${move.navn} ramte ikke!`,
        targetPlayerId: defender.playerId,
      });
      continue;
    }

    const multiplier = getMultiplier(move.type, defender.species.type);
    const damage = calculateDamage(attacker.species, defender.species, move, multiplier);
    defender.active.currentHp = Math.max(0, defender.active.currentHp - damage);
    log.push({
      turn,
      kind: "damage",
      text: `${speciesName(attacker)} brugte ${move.navn} og gav ${damage} skade!`,
      targetPlayerId: defender.playerId,
      effectiveness: multiplier > 1 ? "strong" : multiplier < 1 ? "weak" : "neutral",
    });

    if (defender.active.currentHp === 0) {
      log.push({
        turn,
        kind: "faint",
        text: `${speciesName(defender)} besvimede!`,
        targetPlayerId: defender.playerId,
      });
    }
  }

  const [player, opponent] = participants;
  let outcome: BattleState["outcome"] = "ongoing";
  if (player.active.currentHp === 0) {
    outcome = "lost";
  } else if (opponent.active.currentHp === 0) {
    outcome = "won";
  }

  return { ...state, turn, participants, log: [...state.log, ...log], outcome };
}

function calculateDamage(attacker: CreatureSpecies, defender: CreatureSpecies, move: Move, multiplier: number): number {
  const raw = (move.power * (attacker.baseStats.angreb / defender.baseStats.forsvar)) / 5;
  return Math.max(1, Math.round(raw * multiplier));
}

function otherParticipant(
  participants: [BattleParticipant, BattleParticipant],
  p: BattleParticipant
): BattleParticipant {
  return participants[0].playerId === p.playerId ? participants[1] : participants[0];
}

function speciesName(p: BattleParticipant): string {
  return p.species.navn;
}

function cloneParticipant(p: BattleParticipant): BattleParticipant {
  return { ...p, active: { ...p.active } };
}
