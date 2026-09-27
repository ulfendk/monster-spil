import type { CreatureInstance, CreatureSpecies } from "./creature.js";
import type { Move } from "./move.js";

export interface BattleParticipant {
  playerId: string;
  active: CreatureInstance;
  /** Resolved once at battle creation so the engine itself does no content lookups. */
  species: CreatureSpecies;
  moves: Record<string, Move>;
  /** An item's effect still working (a potion, a feather…): stronger or surer moves for a few more moves. */
  boost?: { power: number; accuracy: number; moves: number };
}

/** What an item does when used in a battle (shared/content/items.json; the engine needs no content). */
export interface ItemEffect {
  /** Moves do this many times the damage (1 = unchanged)… */
  power?: number;
  /** …and hit this much more surely (added to the move's accuracy; 1 = never miss)… */
  accuracy?: number;
  /** …for this many of the monster's moves. */
  moves?: number;
  /** Heals this share of the monster's full HP at once. */
  heal?: number;
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
  /**
   * Throw a ball. `throw` says how a 3D throw went (the client's catching scene): a miss
   * uses up the turn with no roll; a hit rolls as usual, better the nearer the middle
   * (precision 1). Without it, the ball simply reaches the monster (as before 3D).
   */
  | { kind: "catch"; throw?: { hit: false } | { hit: true; precision: number } }
  | { kind: "flee" }
  /** Use an item (it takes the turn). `navn` is for the message. */
  | { kind: "item"; navn: string; effect: ItemEffect };

export interface BattleLogEntry {
  turn: number;
  kind: "damage" | "miss" | "faint" | "catch-success" | "catch-fail" | "catch-miss" | "flee" | "item";
  text: string;
  /** playerId of the participant this entry happened to, so a UI can animate the right sprite. */
  targetPlayerId?: string;
  /** Set on "damage" entries so the UI can show type-advantage feedback. */
  effectiveness?: "strong" | "weak" | "neutral";
  /** Set on "damage" entries: how much HP it took. */
  amount?: number;
  /** Set on "damage" and "miss" entries: who attacked (in a team fight, which member). */
  actorPlayerId?: string;
  /** Set on "damage" and "miss" entries: which move, so a UI can show it (fire, water, …). */
  moveId?: string;
}
