import type { CreatureInstance, CreatureSpecies } from "./creature.js";
import type { Move } from "./move.js";

export interface BattleParticipant {
  playerId: string;
  active: CreatureInstance;
  /** Resolved once at battle creation so the engine itself does no content lookups. */
  species: CreatureSpecies;
  moves: Record<string, Move>;
}

/**
 * "wild": one human vs. an AI-driven wild creature (catching allowed). "pvp": two humans, no
 * catching, fleeing is a forfeit. "boss": one human vs. the family dragon — no catching, and
 * fleeing just ends the attempt ("fled").
 */
export type BattleMode = "wild" | "pvp" | "boss";

/**
 * participants[0] is "the player" and participants[1] is the opponent — that's
 * what "won"/"lost" below are relative to. That's fine for solo wild battles;
 * in PvP neither side is privileged, so read `winnerId` (or `outcomeFor`)
 * instead of `outcome`.
 */
export interface BattleState {
  seed: number;
  turn: number;
  mode: BattleMode;
  participants: [BattleParticipant, BattleParticipant];
  log: BattleLogEntry[];
  outcome: "ongoing" | "won" | "lost" | "fled" | "caught";
  /** playerId of the winner once a "won"/"lost" battle (or a PvP forfeit) is over. Absent for wild "fled"/"caught". */
  winnerId?: string;
}

export type BattleAction =
  | { kind: "move"; moveId: string }
  | { kind: "catch" }
  | { kind: "flee" };

export interface BattleLogEntry {
  turn: number;
  kind: "damage" | "miss" | "faint" | "catch-success" | "catch-fail" | "flee";
  text: string;
  /** playerId of the participant this entry happened to, so a UI can animate the right sprite. */
  targetPlayerId?: string;
  /** Set on "damage" entries so the UI can show type-advantage feedback. */
  effectiveness?: "strong" | "weak" | "neutral";
  /** Set on "damage" entries: how much HP it took. */
  amount?: number;
  /** Set on "damage" and "miss" entries: who attacked (in a team fight, which member). */
  actorPlayerId?: string;
}
