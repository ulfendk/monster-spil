import type { CreatureSpecies } from "../types/creature.js";
import type { Move } from "../types/move.js";
import { getMultiplier } from "../types/type-chart.js";
import type { BattleAction, BattleMode, BattleParticipant, BattleState, BattleLogEntry } from "../types/battle.js";
import type { Rng } from "./rng.js";
import { attemptCatch, catchBonus } from "./catch.js";

export function createBattle(
  seed: number,
  player: BattleParticipant,
  opponent: BattleParticipant,
  mode: BattleMode = "wild"
): BattleState {
  return {
    seed,
    turn: 0,
    mode,
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
      if (state.mode === "pvp") {
        // Fleeing a duel is a forfeit. If both flee in one turn, the first
        // in participants order forfeits (deterministic, no rng needed).
        const winner = otherParticipant(participants, participant);
        return finish(state, turn, log, participants, winner.playerId);
      }
      return { ...state, turn, log: [...state.log, ...log], outcome: "fled" };
    }

    // An item: it works at once (healing) or on the next moves (stronger, surer), and takes the turn.
    if (action.kind === "item") {
      const e = action.effect;
      if (e.heal) participant.active.currentHp = Math.min(participant.species.baseStats.hp, participant.active.currentHp + Math.round(participant.species.baseStats.hp * Math.max(0, e.heal)));
      if ((e.power ?? 1) !== 1 || e.accuracy) participant.boost = { power: Math.max(0.1, e.power ?? 1), accuracy: Math.max(0, e.accuracy ?? 0), moves: Math.max(1, Math.round(e.moves ?? 1)) };
      log.push({ turn, kind: "item", text: `${speciesName(participant)} fik ${action.navn}!`, targetPlayerId: participant.playerId, actorPlayerId: participant.playerId });
      continue;
    }

    // You can't catch another player's creature.
    if (action.kind === "catch" && state.mode === "wild") {
      const opponent = otherParticipant(participants, participant);
      if (action.throw && !action.throw.hit) {
        // The ball missed: no roll. Like a failed catch, that's the turn.
        log.push({ turn, kind: "catch-miss", text: "Lassoen ramte ikke!", targetPlayerId: opponent.playerId });
        return { ...state, turn, log: [...state.log, ...log], outcome: "ongoing" };
      }
      const precision = action.throw?.hit ? Math.max(0, Math.min(1, action.throw.precision)) : 0.5;
      const success = attemptCatch(opponent.active, opponent.species, rng, catchBonus(precision));
      log.push({
        turn,
        kind: success ? "catch-success" : "catch-fail",
        text: success ? `${speciesName(opponent)} blev fanget!` : `${speciesName(opponent)} undveg!`,
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

    // An item's effect works on this move (and wears off after its moves).
    const boost = attacker.boost;
    if (boost) {
      boost.moves -= 1;
      if (boost.moves <= 0) delete attacker.boost;
    }
    if (rng.next() > move.accuracy + (boost?.accuracy ?? 0)) {
      log.push({
        turn,
        kind: "miss",
        text: `${genitive(speciesName(attacker))} ${move.navn} ramte ikke!`,
        targetPlayerId: defender.playerId,
        actorPlayerId: attacker.playerId,
        moveId: move.id,
      });
      continue;
    }

    const multiplier = getMultiplier(move.type, defender.species.type);
    const damage = Math.max(1, Math.round(calculateDamage(attacker.species, defender.species, move, multiplier) * (boost?.power ?? 1)));
    defender.active.currentHp = Math.max(0, defender.active.currentHp - damage);
    log.push({
      turn,
      kind: "damage",
      text: `${speciesName(attacker)} brugte ${move.navn} og gjorde ${damage} i skade!`,
      targetPlayerId: defender.playerId,
      effectiveness: multiplier > 1 ? "strong" : multiplier < 1 ? "weak" : "neutral",
      amount: damage,
      actorPlayerId: attacker.playerId,
      moveId: move.id,
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
  if (player.active.currentHp === 0) return finish(state, turn, log, participants, opponent.playerId);
  if (opponent.active.currentHp === 0) return finish(state, turn, log, participants, player.playerId);

  return { ...state, turn, participants, log: [...state.log, ...log], outcome: "ongoing" };
}

/** The battle's result from one participant's point of view (PvP-safe; `outcome` alone is slot-0 relative). */
export function outcomeFor(state: BattleState, playerId: string): BattleState["outcome"] {
  if (state.outcome === "ongoing" || state.outcome === "caught" || state.outcome === "fled") return state.outcome;
  return state.winnerId === playerId ? "won" : "lost";
}

function finish(
  state: BattleState,
  turn: number,
  log: BattleLogEntry[],
  participants: [BattleParticipant, BattleParticipant],
  winnerId: string
): BattleState {
  return {
    ...state,
    turn,
    participants,
    log: [...state.log, ...log],
    outcome: winnerId === participants[0].playerId ? "won" : "lost",
    winnerId,
  };
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

/** Danish possessive: "Dryppels", but "Flammepels'" for names already ending in s, x or z. */
export function genitive(name: string): string {
  return /[sxz]$/i.test(name) ? `${name}'` : `${name}s`;
}

function speciesName(p: BattleParticipant): string {
  return p.species.navn;
}

function cloneParticipant(p: BattleParticipant): BattleParticipant {
  return { ...p, active: { ...p.active }, ...(p.boost ? { boost: { ...p.boost } } : {}) };
}
