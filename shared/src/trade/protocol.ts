import type { CreatureInstance } from "../types/creature.js";
import type { BattleParticipant } from "../types/battle.js";
import type { DuelAction, DuelView } from "../duel/duel-session.js";
import type { TradeDelivery, TradeSession } from "./trade-session.js";

/** Someone in the family lobby. No accounts — playerId is the id from their own save. */
export interface LobbyPlayer {
  playerId: string;
  navn: string;
  avatarId: string;
  farve: string;
  /** True while they are in a trade or a duel, so others can't invite them. */
  busy: boolean;
}

/** Options a client passes when joining the lobby room. */
export interface LobbyJoinOptions {
  playerId: string;
  navn: string;
  avatarId: string;
  farve: string;
  /** The shared family code; the server refuses the join without the right one. */
  familyCode?: string;
}

/** ServerError code for a missing/wrong family code, or too many wrong guesses. */
export const FAMILY_CODE_REJECTED = 4401;

/**
 * Bump when a message changes in a way older peers can't handle. v1 = trading
 * only, v2 = trading + duels. The server announces its version with the
 * "hello" message right after a client joins; an old server never sends one, so
 * a newer client can tell the *server* needs upgrading and hide the features it
 * can't do. (Old clients keep working against a newer server for what they know.)
 */
export const PROTOCOL_VERSION = 2;

export const LOBBY_ROOM = "lobby";

/** Client -> server message names and payloads. */
export interface ClientMessages {
  invite: { toPlayerId: string };
  accept: { tradeId: string };
  offer: { tradeId: string; creature: CreatureInstance };
  confirm: { tradeId: string };
  cancel: { tradeId: string };
  /** The client has applied a tradeComplete to its save and persisted it. */
  ack: { tradeId: string };
  /** Challenge someone; `seat` is your own creature + its species/moves, sanitized by the server. */
  duelInvite: { toPlayerId: string; seat: BattleParticipant };
  duelAccept: { duelId: string; seat: BattleParticipant };
  duelAction: { duelId: string; action: DuelAction };
  duelCancel: { duelId: string };
}

/** Server -> client message names and payloads. */
export interface ServerMessages {
  players: LobbyPlayer[];
  /** The full current session, sent to both sides after every change. */
  trade: TradeSession;
  tradeEnded: { tradeId: string; reason: "cancelled" | "left" };
  /** Apply to your save, persist, then send "ack". Safe to receive more than once. */
  tradeComplete: TradeDelivery;
  problem: { reason: string };
  /** Sent right after joining. Its absence means the server predates duels. */
  hello: { protocolVersion: number };
  /** The duel as this player may see it, sent to both sides after every change. */
  duel: DuelView;
  duelEnded: { duelId: string; reason: "cancelled" | "left" };
}
