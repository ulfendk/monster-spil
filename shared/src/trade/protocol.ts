import type { CreatureInstance } from "../types/creature.js";
import type { BattleParticipant, BattleState } from "../types/battle.js";
import type { DuelAction, DuelView } from "../duel/duel-session.js";
import type { WorldPosition } from "../world/adjacency.js";
import type { RaidView } from "../raid/raid.js";
import type { TeamView } from "../raid/team.js";
import type { ScoreRow } from "../score/scoreboard.js";
import type { TradeDelivery, TradeSession } from "./trade-session.js";

/** Someone in the family lobby. No accounts — playerId is the id from their own save. */
export interface LobbyPlayer extends WorldPosition {
  playerId: string;
  navn: string;
  avatarId: string;
  farve: string;
  /** True while they are in a trade or a duel, so others can't invite them. */
  busy: boolean;
  /** True while they are somewhere they can't be approached, e.g. in a wild battle. */
  away: boolean;
}

/** Options a client passes when joining the lobby room. */
export interface LobbyJoinOptions extends Partial<WorldPosition> {
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
 * only, v2 = trading + duels, v3 = players have positions on a shared map and
 * invites need adjacency, v4 = the family dragon raid and the weekly scoreboard,
 * v5 = teaming up against the dragon. The server announces its version with the
 * "hello" message right after a client joins; an old server never sends one, so
 * a newer client can tell the *server* needs upgrading and hide the features it
 * can't do. (Old clients keep working against a newer server for what they know.)
 */
export const PROTOCOL_VERSION = 5;

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
  /** Where I now stand. Sent as each step of a walk starts, so others can glide there. */
  move: WorldPosition;
  /** True while I can't be approached (e.g. in a wild battle); false when I'm back on the map. */
  away: { away: boolean };
  /** Start an attempt on the dragon; I must stand next to its lair and not be resting. */
  raidStart: { seat: BattleParticipant };
  raidAction: { action: DuelAction };
  /** Catches made on this device (possibly while offline), so they count on the scoreboard. */
  scoreReport: { events: Array<{ id: string; kind: "catch"; at: string }> };
  getScores: Record<string, never>;
  /** The reward has been added to my save and persisted; the server may forget it. */
  rewardAck: { rewardId: string };
  /** Gather a team at the lair (I become its leader); others then see it and can join. */
  teamCreate: { seat: BattleParticipant };
  teamJoin: { teamId: string; seat: BattleParticipant };
  /** Leave the team (the leader leaving before the start cancels it). */
  teamLeave: { teamId: string };
  /** Leader only: start the fight with whoever has joined. */
  teamStart: { teamId: string };
  teamAction: { teamId: string; action: DuelAction };
}

/** A creature the server hands out (e.g. for beating the dragon). Apply, persist, then send rewardAck. */
export interface RewardDelivery {
  rewardId: string;
  reason: "dragon";
  creature: CreatureInstance;
}

/** Server -> client message names and payloads. */
export interface ServerMessages {
  players: LobbyPlayer[];
  /** One player took a step; sent to everyone else so the full list needn't be resent. */
  playerMoved: { playerId: string } & WorldPosition;
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
  /** The family dragon, sent on join and whenever its HP changes. */
  raid: RaidView;
  /**
   * My own attempt on the dragon after each turn. `over` is set when the attempt
   * has ended for a reason other than the battle outcome ("defeated": someone else
   * beat it meanwhile). `restUntil` is when I may try again.
   */
  raidBattle: { battle: BattleState; over?: "defeated"; restUntil?: string };
  scoreReportAck: { ids: string[] };
  scores: { rows: ScoreRow[]; days: number };
  reward: RewardDelivery;
  /** My team as I may see it, after every change. */
  team: TeamView;
  /** The team is gone: "cancelled" (the leader left while gathering) or "defeated" (someone else beat the dragon first). */
  teamEnded: { teamId: string; reason: "cancelled" | "defeated" };
}
