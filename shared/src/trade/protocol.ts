import type { CreatureInstance } from "../types/creature.js";
import type { TradeDelivery, TradeSession } from "./trade-session.js";

/** Someone in the family lobby. No accounts — playerId is the id from their own save. */
export interface LobbyPlayer {
  playerId: string;
  navn: string;
  avatarId: string;
  farve: string;
  /** True while they are in a trade, so others can't invite them. */
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
}
