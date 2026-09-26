import type { CreatureInstance } from "../types/creature.js";
import type { BattleParticipant, BattleState } from "../types/battle.js";
import type { DuelAction, DuelView } from "../duel/duel-session.js";
import type { WorldPosition } from "../world/adjacency.js";
import type { RaidView } from "../raid/raid.js";
import type { BeastView } from "../raid/beasts.js";
import type { CaveView, CaveVisit } from "../cave/caves.js";
import type { TeamView } from "../raid/team.js";
import type { FoodItem, FoodKind } from "../recovery/recovery.js";
import type { ScoreRow } from "../score/scoreboard.js";
import type { TradeDelivery, TradeSession } from "./trade-session.js";
import type { AreaTerrain } from "../world/terrain.js";
import type { DisasterKind } from "../world/disasters.js";

/** Someone in a game's lobby. No accounts — playerId is the id from their own save. */
export interface LobbyPlayer extends WorldPosition {
  playerId: string;
  navn: string;
  avatarId: string;
  farve: string;
  /** True while they are in a trade or a duel, so others can't invite them. */
  busy: boolean;
  /** True while they are somewhere they can't be approached, e.g. in a wild battle. */
  away: boolean;
  /** Their player level and earned badge ids (v13+; absent from older devices). */
  level?: number;
  badges?: string[];
}

/** Options a client passes when joining the lobby room. */
export interface LobbyJoinOptions extends Partial<WorldPosition> {
  playerId: string;
  navn: string;
  avatarId: string;
  farve: string;
  /** Which game to join (one server hosts several; each is its own world). Protocol v8+. */
  gameId?: string;
  /** The game's spilnøgle; the server refuses the join without the right one. Protocol v8+. */
  gameKey?: string;
  /** The same key under its pre-v8 name, so an older (single-game) server still lets the client in. */
  familyCode?: string;
  /** My player level and earned badges, for everyone to see (v13+). */
  level?: number;
  badges?: string[];
}

/**
 * ServerError code for a missing/wrong spilnøgle, or too many wrong guesses. Also the
 * close code when a parent changes the key or deletes the game while players are online.
 */
export const GAME_KEY_REJECTED = 4401;

/**
 * Close code when the same player joined again from somewhere else (another tab, the old
 * and the new address, a second iPad with the same player): the newest connection wins,
 * and the replaced one must not reconnect by itself — or the two would take turns throwing
 * each other out forever.
 */
export const PLAYER_ELSEWHERE = 4000;

/**
 * Bump when a message changes in a way older peers can't handle. v1 = trading
 * only, v2 = trading + duels, v3 = players have positions on a shared map and
 * invites need adjacency, v4 = the family dragon raid and the weekly scoreboard,
 * v5 = teaming up against the dragon, v6 = food growing on the map, v7 = save backups,
 * v8 = several games per server (gameId + gameKey), game names and renames by a parent,
 * v9 = natural disasters: the map changes (terrain), warnings and strikes, the UFO's alien,
 * v10 = a roaming dragon: it flies to new perches (RaidView.lair, dragonFlight),
 * v11 = visiting beasts (sand serpents, giant eagles): `beasts`, and `targetId` on
 * raidStart/teamCreate/raidBattle/TeamView (absent = the dragon),
 * v12 = caves that open in the mountains: `caves`, `caveEnter` → `caveVisit`,
 * v13 = player levels and badges: `level`/`badges` on join and in `profile`, shown on
 * LobbyPlayer and the scoreboard,
 * v14 = the minigames: `work {kind: cut|dig, x, y}` → `workDone`, shared stumps and holes. The server announces its version with the
 * "hello" message right after a client joins; an old server never sends one, so
 * a newer client can tell the *server* needs upgrading and hide the features it
 * can't do. (Old clients keep working against a newer server for what they know.)
 */
export const PROTOCOL_VERSION = 14;

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
  /** Start an attempt on the dragon — or on a visiting beast (`targetId`, v11+); I must stand next to it and not be resting. */
  raidStart: { seat: BattleParticipant; targetId?: string };
  raidAction: { action: DuelAction };
  /** Catches made on this device (possibly while offline), so they count on the scoreboard. */
  scoreReport: { events: Array<{ id: string; kind: "catch"; at: string }> };
  getScores: Record<string, never>;
  /** The reward has been added to my save and persisted; the server may forget it. */
  rewardAck: { rewardId: string };
  /** I felled the tree next to me, or dug where I stand (v14+): everyone sees the stump or hole. */
  work: { kind: "cut" | "dig"; x: number; y: number };
  /** My level or badges changed (v13+): everyone sees the new ones. */
  profile: { level: number; badges: string[] };
  /** Go into an open cave I'm standing next to (once per opening; v12+). */
  caveEnter: { caveId: string };
  /** Gather a team at the dragon — or at a visiting beast (`targetId`, v11+) — and lead it; others then see it and can join. */
  teamCreate: { seat: BattleParticipant; targetId?: string };
  teamJoin: { teamId: string; seat: BattleParticipant };
  /** Leave the team (the leader leaving before the start cancels it). */
  teamLeave: { teamId: string };
  /** Leader only: start the fight with whoever has joined. */
  teamStart: { teamId: string };
  teamAction: { teamId: string; action: DuelAction };
  /** I stepped onto this food and have room in my bag. */
  foodTake: { foodId: string };
  /** A copy of my whole save, kept on the server so a reinstalled device can restore it. */
  backup: { save: unknown };
  /** I stand next to a waiting monster (the UFO's alien) and want to battle it (v9+). */
  spawnClaim: { spawnId: string };
  /** My battle with it is over: caught (it's mine, gone for everyone) or not (it waits again). */
  spawnDone: { spawnId: string; caught: boolean };
}

/** A natural disaster: first a warning (run!), then the strike. */
export interface DisasterMessage {
  id: string;
  kind: DisasterKind;
  areaId: string;
  phase: "warning" | "strike";
  center: { x: number; y: number };
  /** Tiles ("x,y") where you pass out if you're still there when it strikes. */
  danger: string[];
  strikeAt: string;
  /** At the strike: who was caught (they pass out). */
  struck?: string[];
}

/** A disaster that happened, for the "while you were away" note. */
export interface DisasterNews {
  id: string;
  kind: DisasterKind;
  at: string;
}

/** A creature the server hands out (for beating the dragon or a visiting beast). Apply, persist, then send rewardAck. */
export interface RewardDelivery {
  rewardId: string;
  reason: "dragon" | "beast";
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
  raidBattle: { battle: BattleState; over?: "defeated" | "gone"; restUntil?: string; targetId?: string };
  scoreReportAck: { ids: string[] };
  scores: { rows: ScoreRow[]; days: number };
  reward: RewardDelivery;
  /** My team as I may see it, after every change. */
  team: TeamView;
  /**
   * The team is gone: "cancelled" (the leader left while gathering), "defeated" (someone
   * else beat the boss first) or "gone" (a visiting beast left before the fight began).
   */
  teamEnded: { teamId: string; reason: "cancelled" | "defeated" | "gone" };
  /** All food lying on the map right now (sent on join and whenever it changes). */
  food: FoodItem[];
  /** The food I took is mine: put it in the bag. */
  foodTaken: { foodId: string; kind: FoodKind };
  /** My backup is stored (or why not). */
  backupAck: { savedAt: string } | { error: string };
  /** The game I'm in, sent on join and when a parent renames it (v8+). */
  game: { gameId: string; navn: string };
  /** A parent renamed me in the admin portal: use this name from now on (v8+). */
  renamed: { navn: string };
  /** How an area looks now (all disaster changes, rare-monster zones, waiting monsters); on join and after every change (v9+). */
  terrain: { areaId: string; terrain: AreaTerrain; recent: DisasterNews[] };
  disaster: DisasterMessage;
  /** The dragon takes off and lands on a new perch: animate the flight (the raid view already has the new lair; v10+). */
  dragonFlight: { from: WorldPosition; to: WorldPosition; ms: number };
  /** My work is done on the shared map (the terrain update follows); otherwise a `problem`. */
  workDone: { kind: "cut" | "dig"; x: number; y: number };
  /** Every open cave (v12+): on join and whenever one opens, closes or someone goes in. */
  caves: CaveView[];
  /** I'm in: the monsters in there this time and my balls. The device runs the minigame. */
  caveVisit: CaveVisit;
  /** Every visiting beast on the maps (v11+): on join and whenever one comes, is hurt, is beaten or leaves. */
  beasts: BeastView[];
  /** My claim on a waiting monster was granted: battle it now. */
  spawnBattle: { spawnId: string; speciesId: string };
}
