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
 * By convention participants[0] is "the player" and participants[1] is the
 * opponent — that's what "won"/"lost" below are relative to. Milestone 1 is
 * solo-only (wild encounters), so this asymmetry is fine; PvP in Milestone 3
 * will need its own per-client interpretation of outcome.
 */
export interface BattleState {
  seed: number;
  turn: number;
  participants: [BattleParticipant, BattleParticipant];
  log: BattleLogEntry[];
  outcome: "ongoing" | "won" | "lost" | "fled" | "caught";
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
}
