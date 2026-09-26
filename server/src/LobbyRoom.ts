import { randomInt, randomUUID } from "node:crypto";
import { Room, ServerError, type AuthContext, type Client } from "@colyseus/core";
import {
  GAME_KEY_REJECTED,
  PLAYER_ELSEWHERE,
  PROTOCOL_VERSION,
  acceptDuel,
  acceptInvite,
  cancelTrade,
  confirmTrade,
  createDuel,
  createTrade,
  deliveriesFor,
  duelInvolves,
  duelView,
  forfeitDuel,
  beastView,
  contributors,
  currentRaid,
  inWindow,
  raidTurn,
  raidView,
  scoreboard,
  startAttempt,
  weekIdFor,
  SCOREBOARD_DAYS,
  createTeam,
  emptyTerrain,
  joinTeam,
  leaveTeam,
  startTeam,
  submitTeamAction,
  teamInvolves,
  teamViewFor,
  timeoutTeamTurn,
  pickFoodKind,
  pickFoodSpot,
  involves,
  isAdjacent,
  sanitizeSeat,
  setOffer,
  submitAction,
  timeoutTurn,
} from "@monster-spil/shared";
import { clientAddress, type KeyGate } from "./key-gate.js";
import type { GameStore } from "./game-store.js";
import type { GameRegistry } from "./games.js";
import { bossForWeek } from "./bosses.js";
import type { ServerArea } from "./areas.js";
import { WorldEvents, type WorldPlayer } from "./world-events.js";
import { DragonRoam, FLIGHT_MS } from "./dragon-roam.js";
import { BeastVisits } from "./beast-visits.js";
import { CaveOpenings } from "./cave-openings.js";
import type { SaveBackups } from "./save-backups.js";
import type {
  ClientMessages,
  BattleState,
  BeastDefinition,
  BeastState,
  BeastView,
  BossDefinition,
  CaveConfig,
  FightBoss,
  MinigameConfig,
  FightState,
  CreatureInstance,
  DisasterConfigs,
  DuelResult,
  RaidState,
  RaidView,
  TeamSession,
  TeamView,
  FoodItem,
  DuelSession,
  LobbyJoinOptions,
  LobbyPlayer,
  ServerMessages,
  TradeDelivery,
  TradeResult,
  TradeSession,
  WorldPosition,
} from "@monster-spil/shared";

/** What every game's room gets from the server (see index.ts). */
export interface LobbyDeps {
  registry: GameRegistry;
  gate: KeyGate;
  bosses: BossDefinition[];
  /** Visiting beasts (shared/content/beasts); none in some tests. */
  beasts?: BeastDefinition[];
  /** What lives in the caves (shared/content/caves.json); without it no caves open. */
  caveConfig?: CaveConfig;
  /** How cutting and digging work (shared/content/minigames.json); without it, neither. */
  minigameConfig?: MinigameConfig;
  /** Every area: its food spots and, for disasters, its base map. */
  areas?: ServerArea[];
  disasterConfigs?: DisasterConfigs;
}

interface Online {
  client: Client;
  info: LobbyPlayer;
}

/**
 * How much food lies on a map at once — one piece per this many open tiles, so a big map
 * isn't bare (Startskoven's first 64×48 had 14) — and how long a picked one takes to grow back.
 */
const OPEN_TILES_PER_FOOD = 123;
const foodPerArea = (area: ServerArea) => Math.max(1, Math.round(area.spots.length / OPEN_TILES_PER_FOOD));
const FOOD_REGROW_MS = 3 * 60_000;

/** The key of the dragon's team (beasts' teams are keyed by the beast's id, a UUID). */
const DRAGON = "dragon";

/** A boss someone can fight: the weekly dragon, or a visiting beast. */
interface Foe {
  /** DRAGON, or the beast's id. */
  key: string;
  /** The beast's id; undefined for the dragon (as in the protocol). */
  targetId?: string;
  boss: FightBoss;
  state: FightState;
  /** Where it is: players must stand next to it. */
  at: WorldPosition;
}

const targetOf = (key: string): string | undefined => (key === DRAGON ? undefined : key);
/** `{ targetId }` for a beast, nothing for the dragon, so the dragon's messages look exactly as before v11. */
const targetField = (targetId: string | undefined): { targetId?: string } => (targetId ? { targetId } : {});
const cleanTarget = (raw: unknown): string | undefined => (typeof raw === "string" && raw.length > 0 && raw.length <= 80 ? raw : undefined);
const gatheringOf = (team: TeamSession) => ({ teamId: team.id, leaderId: team.leaderId, size: team.members.length });

/** How long a duel waits for both players to pick a move before skipping the silent one. */
const TURN_MS = 30_000;

const isText = (v: unknown, max = 40): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/** A tile position from a client: whole numbers in a sane range and a short area id, or nothing. */
function cleanPosition(raw: unknown): WorldPosition | undefined {
  const p = raw as Partial<WorldPosition> | null;
  if (!p || typeof p !== "object") return undefined;
  const whole = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 10_000;
  if (typeof p.areaId !== "string" || p.areaId.length > 40 || !whole(p.x) || !whole(p.y)) return undefined;
  return { areaId: p.areaId, x: p.x, y: p.y };
}

/** A level (1–100) and badge ids (short slugs, at most 64) from a client, or nothing. */
function cleanProfile(raw: unknown): { level?: number; badges?: string[] } {
  const p = raw as { level?: unknown; badges?: unknown } | null;
  if (!p || typeof p !== "object" || !Number.isInteger(p.level) || (p.level as number) < 1 || (p.level as number) > 100) return {};
  const badges = Array.isArray(p.badges) ? p.badges.filter((b): b is string => typeof b === "string" && /^[a-z0-9-]{1,40}$/.test(b)).slice(0, 64) : [];
  return { level: p.level as number, badges };
}

/** Rebuilds an offered creature from known fields only, so junk from a client never gets stored or forwarded. */
function cleanCreature(raw: unknown): CreatureInstance | undefined {
  const c = raw as Partial<CreatureInstance> | null;
  if (!c || typeof c !== "object") return undefined;
  if (!isText(c.instanceId, 80) || !isText(c.speciesId) || !isText(c.ownerId, 80) || !isText(c.caughtAt, 40)) return undefined;
  if (!isCount(c.niveau) || !isCount(c.currentHp)) return undefined;
  return {
    instanceId: c.instanceId,
    speciesId: c.speciesId,
    ownerId: c.ownerId,
    niveau: c.niveau,
    currentHp: c.currentHp,
    caughtAt: c.caughtAt,
  };
}

/**
 * One game's lobby (there is one room per game, matched by `gameId`): who is online, plus one-to-one creature trades and
 * duels. A duel is server-authoritative: clients only send a move choice, the
 * server calls the shared `resolveTurn` and pushes the result to both.
 *
 * The server never owns creatures — each device's save is the source of truth.
 * It only coordinates the swap, and holds a finished trade's deliveries until
 * each client acknowledges having applied it (re-sent on reconnect; applying
 * a delivery is idempotent). State is in memory only: a server restart drops
 * open trades and duels, which is fine because nothing has moved until
 * "tradeComplete", and a duel changes nobody's save.
 *
 * The game's dragon, its weekly scoreboard and unclaimed rewards are the
 * exception: they live in the game's GameStore (a JSON file on a volume) so they
 * survive restarts. Each player fights the dragon in their own server-run battle;
 * the damage comes off one shared HP pool (see shared/src/raid/raid.ts).
 */
export class LobbyRoom extends Room {
  // High enough that a game never spills into a second room (onCreate refuses a second one anyway).
  maxClients = 100;
  autoDispose = false;

  /** Each game's room, by gameId, so the admin portal can reach it. */
  static readonly byGame = new Map<string, LobbyRoom>();

  gameId = "";
  private registry!: GameRegistry;

  private online = new Map<string, Online>();
  private trades = new Map<string, TradeSession>();
  private pending = new Map<string, TradeDelivery[]>();
  private duels = new Map<string, DuelSession>();
  private duelTimers = new Map<string, { clear(): void }>();
  private gate!: KeyGate;
  private store!: GameStore;
  private bosses!: BossDefinition[];
  /** Each player's current attempt on a boss: the dragon, or a visiting beast (`targetId`). */
  private raidBattles = new Map<string, { battle: BattleState; targetId?: string }>();
  /** When each player may attack the dragon again (ms since epoch). */
  private restUntil = new Map<string, number>();
  private announcedWeek = "";
  /** Teams gathering at or fighting a boss, one per boss: keyed DRAGON or by the beast's id. */
  private teams = new Map<string, TeamSession>();
  private teamTimers = new Map<string, { clear(): void }>();
  /** Food lying on the maps, shared by everyone (in memory: it regrows anyway). */
  private food = new Map<string, FoodItem>();
  private areas: ServerArea[] = [];
  /** Food a disaster scattered: it doesn't grow back when picked. */
  private extraFood = new Set<string>();
  /** Natural disasters in this game (undefined without disaster config, e.g. in some tests). */
  world?: WorldEvents;
  /** The dragon flying to new perches. */
  roam?: DragonRoam;
  /** Sand serpents and giant eagles coming and going (undefined without beast files). */
  visits?: BeastVisits;
  /** Caves opening in the mountains (undefined without caves.json). */
  caves?: CaveOpenings;
  private backups?: SaveBackups;

  /** Runs before a seat is reserved, so outsiders never become part of the room. Only this game's key lets you in. */
  onAuth(_client: Client, options: LobbyJoinOptions, context: AuthContext): boolean {
    const given = options?.gameKey ?? options?.familyCode;
    const ok = this.gate.attempt(clientAddress(context.headers, context.ip), () => (this.registry.byKey(given)?.id === this.gameId ? true : undefined));
    if (!ok) throw new ServerError(GAME_KEY_REJECTED, "spilnøgle");
    return true;
  }

  /**
   * `gameId` comes from the joining client; everything else from the server (Colyseus lets
   * the server's options win). A game that doesn't exist gets no room — the same answer as a
   * wrong key, so ids can't be probed.
   */
  async onCreate(options: LobbyDeps & { gameId?: unknown }): Promise<void> {
    this.registry = options.registry;
    const game = this.registry.get(options.gameId);
    if (!game) throw new ServerError(GAME_KEY_REJECTED, "spilnøgle");
    if (LobbyRoom.byGame.has(game.id)) throw new ServerError(GAME_KEY_REJECTED, "game already has a room");
    this.gameId = game.id;
    LobbyRoom.byGame.set(game.id, this);
    this.store = await this.registry.store(game.id);
    this.backups = this.registry.backups(game.id);
    this.gate = options.gate;
    this.bosses = options.bosses;
    this.areas = options.areas ?? [];
    if (options.disasterConfigs) this.startWorld(options.disasterConfigs);
    this.startRoam();
    if (options.beasts?.length) this.startVisits(options.beasts);
    if (options.caveConfig) this.startCaves(options.caveConfig);
    this.minigameConfig = options.minigameConfig;
    for (const area of this.areas) for (let i = 0; i < foodPerArea(area); i++) this.growFood(area);
    this.announcedWeek = this.raid().weekId;
    // A fresh dragon wakes every Monday; tell everyone who is connected across midnight.
    this.clock.setInterval(() => {
      const raid = this.raid();
      if (raid.weekId !== this.announcedWeek) {
        this.announcedWeek = raid.weekId;
        this.broadcastRaid();
      }
    }, 60_000);

    this.onMessage("move", (client, msg: ClientMessages["move"]) => {
      const me = this.playerOf(client);
      const position = cleanPosition(msg);
      if (!me || !position) return;
      Object.assign(me.info, position);
      for (const other of this.online.values()) {
        if (other !== me) this.tell(other.client, "playerMoved", { playerId: me.info.playerId, ...position });
      }
    });

    this.onMessage("away", (client, msg: ClientMessages["away"]) => {
      const me = this.playerOf(client);
      if (!me || typeof msg?.away !== "boolean") return;
      me.info.away = msg.away;
      this.broadcastPlayers();
    });

    this.onMessage("invite", (client, msg: ClientMessages["invite"]) => {
      const me = this.playerOf(client);
      const target = this.online.get(msg?.toPlayerId);
      const refusal = this.inviteRefusal(me, target);
      if (refusal) return this.problem(client, refusal);
      if (!me || !target) return;
      const created = createTrade(randomUUID(), me.info.playerId, target.info.playerId);
      if (!created.ok) return this.problem(client, created.reason);
      this.trades.set(created.session.id, created.session);
      this.pushTrade(created.session);
      this.broadcastPlayers();
    });

    this.onMessage("accept", (client, msg: ClientMessages["accept"]) =>
      this.step(client, msg?.tradeId, (s, playerId) => acceptInvite(s, playerId))
    );

    this.onMessage("offer", (client, msg: ClientMessages["offer"]) => {
      const creature = cleanCreature(msg?.creature);
      if (!creature) return this.problem(client, "invalid creature");
      this.step(client, msg.tradeId, (s, playerId) => setOffer(s, playerId, creature));
    });

    this.onMessage("confirm", (client, msg: ClientMessages["confirm"]) =>
      this.step(client, msg?.tradeId, (s, playerId) => confirmTrade(s, playerId))
    );

    this.onMessage("cancel", (client, msg: ClientMessages["cancel"]) => {
      const session = this.sessionFor(client, msg?.tradeId);
      if (session) this.endTrade(session, "cancelled");
    });

    this.onMessage("duelInvite", (client, msg: ClientMessages["duelInvite"]) => {
      const me = this.playerOf(client);
      const target = this.online.get(msg?.toPlayerId);
      const refusal = this.inviteRefusal(me, target);
      if (refusal) return this.problem(client, refusal);
      if (!me || !target) return;
      const seat = sanitizeSeat(msg.seat, me.info.playerId);
      if (!seat) return this.problem(client, "invalid creature");
      const created = createDuel(randomUUID(), me.info.playerId, target.info.playerId, seat);
      if (!created.ok) return this.problem(client, created.reason);
      this.duels.set(created.session.id, created.session);
      this.pushDuel(created.session);
      this.broadcastPlayers();
    });

    this.onMessage("duelAccept", (client, msg: ClientMessages["duelAccept"]) => {
      const seat = sanitizeSeat(msg?.seat, this.playerOf(client)?.info.playerId ?? "");
      if (!seat) return this.problem(client, "invalid creature");
      this.stepDuel(client, msg.duelId, (s, playerId) => acceptDuel(s, playerId, seat, randomInt(0, 2 ** 31)));
    });

    this.onMessage("duelAction", (client, msg: ClientMessages["duelAction"]) => {
      const action = msg?.action;
      if (!action || (action.kind !== "move" && action.kind !== "flee")) return this.problem(client, "unknown action");
      this.stepDuel(client, msg.duelId, (s, playerId) =>
        submitAction(s, playerId, action.kind === "move" ? { kind: "move", moveId: String(action.moveId) } : { kind: "flee" })
      );
    });

    this.onMessage("duelCancel", (client, msg: ClientMessages["duelCancel"]) => {
      const session = this.duelFor(client, msg?.duelId);
      const me = this.playerOf(client);
      if (session && me) this.settleDuel(forfeitDuel(session, me.info.playerId), "cancelled");
    });

    this.onMessage("raidStart", (client, msg: ClientMessages["raidStart"]) => {
      const me = this.playerOf(client);
      if (!me) return;
      const id = me.info.playerId;
      const current = this.raidBattles.get(id);
      if (current) return this.tell(client, "raidBattle", { battle: current.battle, ...targetField(current.targetId) });
      const targetId = cleanTarget(msg?.targetId);
      const refusal = this.foeRefusal(me, targetId);
      if (refusal) return this.problem(client, refusal);
      const foe = this.foe(targetId)!;
      const seat = sanitizeSeat(msg?.seat, id);
      if (!seat) return this.problem(client, "invalid creature");
      const battle = startAttempt(foe.state, foe.boss, seat, randomInt(0, 2 ** 31));
      this.raidBattles.set(id, { battle, ...targetField(targetId) });
      this.tell(client, "raidBattle", { battle, ...targetField(targetId) });
      this.broadcastPlayers();
    });

    this.onMessage("raidAction", (client, msg: ClientMessages["raidAction"]) => {
      const me = this.playerOf(client);
      const attempt = me && this.raidBattles.get(me.info.playerId);
      if (!me || !attempt) return this.problem(client, "no raid");
      const { battle, targetId } = attempt;
      const foe = this.foe(targetId);
      if (!foe) {
        // The beast is gone (sent away by a parent): the attempt just ends.
        this.raidBattles.delete(me.info.playerId);
        this.broadcastPlayers();
        return this.tell(client, "raidBattle", { battle, over: "gone", ...targetField(targetId) });
      }
      const action = msg?.action;
      if (action?.kind === "move" && !battle.participants[0].moves[String(action.moveId)]) return this.problem(client, "unknown move");
      if (action?.kind !== "move" && action?.kind !== "flee") return this.problem(client, "unknown action");
      const result = raidTurn(
        foe.state,
        battle,
        me.info.playerId,
        action.kind === "move" ? { kind: "move", moveId: String(action.moveId) } : { kind: "flee" },
        new Date()
      );
      this.storeFoe(foe, result.raid);
      if (result.battle.outcome === "ongoing") {
        this.raidBattles.set(me.info.playerId, { battle: result.battle, ...targetField(targetId) });
        this.tell(client, "raidBattle", { battle: result.battle, ...targetField(targetId) });
      } else {
        this.endAttempt(me.info.playerId, result.battle.outcome === "lost", foe.boss.restSeconds);
        this.tell(client, "raidBattle", { battle: result.battle, restUntil: this.restIso(me.info.playerId), ...targetField(targetId) });
      }
      if (result.damage > 0) this.broadcastFoe(foe.key);
      if (result.defeatedNow) this.foeDefeated(foe, result.raid);
    });

    // ---- teaming up against the dragon or a visiting beast

    this.onMessage("teamCreate", (client, msg: ClientMessages["teamCreate"]) => {
      const me = this.playerOf(client);
      if (!me) return;
      const targetId = cleanTarget(msg?.targetId);
      const key = targetId ?? DRAGON;
      if (this.teams.has(key)) return this.problem(client, targetId ? "a team is already there" : "a team is already at the dragon");
      const refusal = this.foeRefusal(me, targetId);
      if (refusal) return this.problem(client, refusal);
      const seat = sanitizeSeat(msg?.seat, me.info.playerId);
      if (!seat) return this.problem(client, "invalid creature");
      const created = createTeam(randomUUID(), me.info.playerId, seat);
      if (!created.ok) return this.problem(client, created.reason);
      this.setTeam(key, created.session);
    });

    this.onMessage("teamJoin", (client, msg: ClientMessages["teamJoin"]) => {
      const me = this.playerOf(client);
      const found = this.teamById(msg?.teamId);
      if (!me || !found) return this.problem(client, "no such team");
      const [key, team] = found;
      const refusal = this.foeRefusal(me, targetOf(key));
      if (refusal) return this.problem(client, refusal);
      const seat = sanitizeSeat(msg.seat, me.info.playerId);
      if (!seat) return this.problem(client, "invalid creature");
      const joined = joinTeam(team, me.info.playerId, seat);
      if (!joined.ok) return this.problem(client, joined.reason);
      this.setTeam(key, joined.session);
    });

    this.onMessage("teamLeave", (client, msg: ClientMessages["teamLeave"]) => {
      const me = this.playerOf(client);
      const found = this.teamById(msg?.teamId);
      if (me && found) this.leaveTeamAs(found[0], me.info.playerId);
    });

    this.onMessage("teamStart", (client, msg: ClientMessages["teamStart"]) => {
      const me = this.playerOf(client);
      const found = this.teamById(msg?.teamId);
      if (!me || !found) return this.problem(client, "no such team");
      const [key, team] = found;
      const foe = this.foe(targetOf(key));
      if (!foe || foe.state.hp <= 0) return this.problem(client, key === DRAGON ? "dragon sleeping" : "beast gone");
      const started = startTeam(team, me.info.playerId, randomInt(0, 2 ** 31));
      if (!started.ok) return this.problem(client, started.reason);
      this.setTeam(key, started.session);
      this.armTeamTimer(key);
    });

    this.onMessage("teamAction", (client, msg: ClientMessages["teamAction"]) => {
      const me = this.playerOf(client);
      const found = this.teamById(msg?.teamId);
      if (!me || !found) return this.problem(client, "no such team");
      const [key, team] = found;
      const foe = this.foe(targetOf(key));
      if (!foe) return this.problem(client, "beast gone");
      const action = msg.action;
      if (action?.kind !== "move" && action?.kind !== "flee") return this.problem(client, "unknown action");
      const clean = action.kind === "move" ? { kind: "move" as const, moveId: String(action.moveId) } : { kind: "flee" as const };
      const result = submitTeamAction(team, me.info.playerId, clean, foe.state, foe.boss, new Date());
      if (!result.ok) return this.problem(client, result.reason);
      this.afterTeamTurn(key, team, result);
    });

    this.onMessage("work", (client, msg: ClientMessages["work"]) => {
      const me = this.playerOf(client);
      if (!me || !this.world || !this.minigameConfig) return;
      if (me.info.busy || me.info.away) return this.problem(client, "player is busy");
      const kind = msg?.kind === "cut" || msg?.kind === "dig" ? msg.kind : undefined;
      const x = Number(msg?.x);
      const y = Number(msg?.y);
      if (!kind || !Number.isInteger(x) || !Number.isInteger(y)) return this.problem(client, "cannot work here");
      const refusal = this.world.work(kind, this.worldPlayer(me), x, y, this.minigameConfig);
      if (refusal) return this.problem(client, refusal);
      this.tell(client, "workDone", { kind, x, y });
    });

    this.onMessage("profile", (client, msg: ClientMessages["profile"]) => {
      const me = this.playerOf(client);
      const profile = cleanProfile(msg);
      if (!me || !profile.level) return;
      Object.assign(me.info, profile);
      const stored = this.store.data.players[me.info.playerId];
      if (stored) stored.level = profile.level;
      this.store.changed();
      this.broadcastPlayers();
    });

    this.onMessage("caveEnter", (client, msg: ClientMessages["caveEnter"]) => {
      const me = this.playerOf(client);
      if (!me || !this.caves) return;
      const cave = this.caves.get(String(msg?.caveId));
      if (!cave) return this.problem(client, "cave closed");
      if (me.info.busy || me.info.away) return this.problem(client, "player is busy");
      if (!isAdjacent(me.info, cave)) return this.problem(client, "too far away");
      const visit = this.caves.enter(cave.id, me.info.playerId);
      if (typeof visit === "string") return this.problem(client, visit);
      this.tell(client, "caveVisit", visit);
    });

    this.onMessage("foodTake", (client, msg: ClientMessages["foodTake"]) => {
      const me = this.playerOf(client);
      const item = this.food.get(String(msg?.foodId));
      // Gone already (someone was quicker), or not where I am: nothing happens.
      if (!me || !item || !isAdjacent(me.info, item)) return;
      this.food.delete(item.id);
      this.tell(client, "foodTaken", { foodId: item.id, kind: item.kind });
      this.broadcastFood();
      const area = this.areas.find((a) => a.areaId === item.areaId);
      if (this.extraFood.delete(item.id)) return; // scattered by a disaster: gone for good
      if (area) {
        this.clock.setTimeout(() => {
          this.growFood(area);
          this.broadcastFood();
        }, FOOD_REGROW_MS);
      }
    });

    this.onMessage("spawnClaim", (client, msg: ClientMessages["spawnClaim"]) => {
      const me = this.playerOf(client);
      if (!me || !this.world) return;
      if (me.info.busy || me.info.away) return this.problem(client, "player is busy");
      const refusal = this.world.claim(this.worldPlayer(me), String(msg?.spawnId));
      if (refusal) this.problem(client, refusal);
    });

    this.onMessage("spawnDone", (client, msg: ClientMessages["spawnDone"]) => {
      const me = this.playerOf(client);
      if (me && this.world) this.world.done(me.info.playerId, String(msg?.spawnId), msg?.caught === true);
    });

    this.onMessage("backup", (client, msg: ClientMessages["backup"]) => {
      const me = this.playerOf(client);
      if (!me || !this.backups) return;
      const now = new Date();
      void this.backups.put(me.info.playerId, msg?.save, now).then(
        (error) => this.tell(client, "backupAck", error ? { error } : { savedAt: now.toISOString() }),
        (error: unknown) => {
          console.error("Could not store a backup:", error);
          this.tell(client, "backupAck", { error: "could not store" });
        }
      );
    });

    this.onMessage("scoreReport", (client, msg: ClientMessages["scoreReport"]) => {
      const me = this.playerOf(client);
      if (!me || !Array.isArray(msg?.events)) return;
      const known = new Set(this.store.data.events.map((e) => e.id));
      const ids: string[] = [];
      const now = new Date();
      for (const raw of msg.events.slice(0, 100)) {
        if (!isText(raw?.id, 80)) continue;
        // Acknowledge anything well-formed (even duplicates or stale ones), so the device stops re-sending it.
        ids.push(raw.id);
        if (raw.kind !== "catch" || typeof raw.at !== "string" || !inWindow(raw.at, now) || known.has(raw.id)) continue;
        known.add(raw.id);
        this.store.data.events.push({ id: raw.id, playerId: me.info.playerId, kind: "catch", at: new Date(raw.at).toISOString() });
      }
      this.store.changed();
      this.tell(client, "scoreReportAck", { ids });
    });

    this.onMessage("getScores", (client) => {
      const rows = scoreboard(this.store.data.events, this.store.data.players, new Date());
      this.tell(client, "scores", { rows, days: SCOREBOARD_DAYS });
    });

    this.onMessage("rewardAck", (client, msg: ClientMessages["rewardAck"]) => {
      const me = this.playerOf(client);
      if (!me) return;
      const left = (this.store.data.rewards[me.info.playerId] ?? []).filter((r) => r.rewardId !== msg?.rewardId);
      if (left.length) this.store.data.rewards[me.info.playerId] = left;
      else delete this.store.data.rewards[me.info.playerId];
      this.store.changed();
    });

    this.onMessage("ack", (client, msg: ClientMessages["ack"]) => {
      const me = this.playerOf(client);
      if (!me) return;
      const left = (this.pending.get(me.info.playerId) ?? []).filter((d) => d.tradeId !== msg?.tradeId);
      if (left.length) this.pending.set(me.info.playerId, left);
      else this.pending.delete(me.info.playerId);
    });
  }

  onDispose(): void {
    if (LobbyRoom.byGame.get(this.gameId) === this) LobbyRoom.byGame.delete(this.gameId);
  }

  onJoin(client: Client, options: LobbyJoinOptions): void {
    if (!isText(options?.playerId, 80) || !isText(options.navn, 30) || !isText(options.avatarId) || !isText(options.farve)) {
      throw new Error("invalid player");
    }
    // The same player joining again (reconnect, second tab, another iPad) replaces the old
    // connection; that one is told why, so it doesn't reconnect and throw this one out again.
    const previous = this.online.get(options.playerId);
    if (previous) previous.client.leave(PLAYER_ELSEWHERE);

    client.userData = { playerId: options.playerId };
    // A parent renamed this player: the device takes the new name (and joins with it next time).
    const renamed = this.store.data.renames[options.playerId];
    if (renamed && renamed === options.navn) delete this.store.data.renames[options.playerId];
    const info: LobbyPlayer = {
      playerId: options.playerId,
      navn: renamed ?? options.navn,
      avatarId: options.avatarId,
      farve: options.farve,
      busy: false,
      away: false,
      // Without a valid position (an older client) you are nowhere, so never adjacent to anyone.
      ...(cleanPosition(options) ?? { areaId: "", x: 0, y: 0 }),
      ...cleanProfile(options),
    };
    this.online.set(info.playerId, { client, info });

    // Remember every player, so the scoreboard lists them even while they are offline.
    this.store.data.players[info.playerId] = { navn: info.navn, farve: info.farve, avatarId: info.avatarId, ...(info.level ? { level: info.level } : {}), lastSeen: new Date().toISOString() };
    this.store.changed();

    this.tell(client, "hello", { protocolVersion: PROTOCOL_VERSION });
    this.tell(client, "game", { gameId: this.gameId, navn: this.registry.get(this.gameId)?.navn ?? "" });
    if (renamed && renamed !== options.navn) this.tell(client, "renamed", { navn: renamed });
    this.tell(client, "raid", this.raidViewNow());
    this.tell(client, "beasts", this.beastViewsNow());
    this.tell(client, "caves", [...(this.caves?.active ?? [])]);
    this.tell(client, "food", [...this.food.values()]);
    this.world?.welcome(info.playerId);
    // Rejoining mid-team: show the team again (e.g. after a short drop-out).
    const inTeam = this.teamOf(info.playerId);
    const teamFoe = inTeam && this.foe(targetOf(inTeam[0]));
    if (inTeam && teamFoe) this.tell(client, "team", this.teamView(inTeam[0], inTeam[1], info.playerId, teamFoe));
    for (const delivery of this.pending.get(info.playerId) ?? []) this.tell(client, "tradeComplete", delivery);
    for (const reward of this.store.data.rewards[info.playerId] ?? []) this.tell(client, "reward", reward);
    this.broadcastPlayers();
  }

  onLeave(client: Client): void {
    const me = this.playerOf(client);
    // A replaced connection also lands here; only tear down if this client is still the current one.
    if (!me || me.client.sessionId !== client.sessionId) return;
    this.online.delete(me.info.playerId);
    for (const session of this.trades.values()) {
      if (involves(session, me.info.playerId)) this.endTrade(session, "left");
    }
    // Leaving mid-duel is a forfeit; the opponent is told they won.
    for (const session of [...this.duels.values()]) {
      if (duelInvolves(session, me.info.playerId)) this.settleDuel(forfeitDuel(session, me.info.playerId), "left");
    }
    // Leaving mid-attempt just ends it; damage already dealt stays on the boss.
    const attempt = this.raidBattles.get(me.info.playerId);
    if (attempt) this.endAttempt(me.info.playerId, false, this.foe(attempt.targetId)?.boss.restSeconds);
    const inTeam = this.teamOf(me.info.playerId);
    if (inTeam) this.leaveTeamAs(inTeam[0], me.info.playerId);
    this.world?.playerLeft(me.info.playerId);
    this.broadcastPlayers();
  }

  // ------------------------------------------------------------ natural disasters

  private startWorld(configs: DisasterConfigs): void {
    this.world = new WorldEvents({
      store: this.store,
      areas: this.areas,
      configs,
      lair: () => this.lairNow(),
      players: () => [...this.online.values()].map((o) => this.worldPlayer(o)),
      send: (playerId, type, payload) => {
        if (playerId === undefined) for (const o of this.online.values()) this.tell(o.client, type, payload);
        else {
          const target = this.online.get(playerId);
          if (target) this.tell(target.client, type, payload);
        }
      },
      later: (fn, ms) => this.clock.setTimeout(fn, ms),
      terrainChanged: (areaId) => {
        // Food on a tile that is now blocked or overgrown is gone.
        let gone = false;
        for (const f of [...this.food.values()]) {
          if (f.areaId === areaId && !this.world!.foodSpot(areaId, f.x, f.y)) {
            this.food.delete(f.id);
            this.extraFood.delete(f.id);
            gone = true;
          }
        }
        if (gone) this.broadcastFood();
      },
      scatterFood: (areaId, spots) => {
        for (const spot of spots) {
          const item: FoodItem = { id: randomUUID(), areaId, x: spot.x, y: spot.y, kind: pickFoodKind(Math.random) };
          this.food.set(item.id, item);
          this.extraFood.add(item.id);
        }
        this.broadcastFood();
      },
      rand: Math.random,
    });
    this.clock.setInterval(() => this.world?.tick(), 5_000);
  }

  // ------------------------------------------------------------ the roaming dragon

  /** Where the dragon sits now: its perch after flying off, or its home lair. */
  private lairNow(): WorldPosition {
    return this.raid().lair ?? this.boss().lair;
  }

  private startRoam(): void {
    this.roam = new DragonRoam({
      store: this.store,
      areas: this.areas,
      terrain: (areaId) => this.world?.terrain(areaId) ?? emptyTerrain(),
      boss: () => this.boss(),
      raid: () => this.raid(),
      lair: () => this.lairNow(),
      busy: () => [...this.raidBattles.values()].some((a) => !a.targetId) || this.teams.has(DRAGON) || Boolean(this.world?.activeView),
      // Never landing on a player or a visiting beast.
      players: () => [
        ...[...this.online.values()].map((o) => ({ areaId: o.info.areaId, x: o.info.x, y: o.info.y })),
        ...(this.visits?.active ?? []).map((b) => ({ areaId: b.areaId, x: b.x, y: b.y })),
      ],
      flew: (from, to) => this.dragonFlew(from, to),
      rand: Math.random,
    });
    this.clock.setInterval(() => this.roam?.tick(), 5_000);
  }

  /** The dragon takes off: everyone sees it fly, its new perch is stored, and food is cleared from where it lands. */
  private dragonFlew(from: WorldPosition, to: WorldPosition): void {
    this.store.data.raid = { ...this.raid(), lair: to };
    this.store.changed();
    let gone = false;
    for (const f of [...this.food.values()]) {
      if (f.areaId === to.areaId && f.x === to.x && f.y === to.y) {
        this.food.delete(f.id);
        this.extraFood.delete(f.id);
        gone = true;
      }
    }
    if (gone) this.broadcastFood();
    for (const o of this.online.values()) this.tell(o.client, "dragonFlight", { from, to, ms: FLIGHT_MS });
    this.broadcastRaid();
  }

  private worldPlayer(o: Online): WorldPlayer {
    const id = o.info.playerId;
    const unavailable = o.info.busy || o.info.away || this.raidBattles.has(id) || Boolean(this.teamOf(id));
    return { playerId: id, areaId: o.info.areaId, x: o.info.x, y: o.info.y, unavailable };
  }

  // ------------------------------------------------------------ dragon and scoreboard

  private boss(): BossDefinition {
    return bossForWeek(this.bosses, weekIdFor(new Date()));
  }

  /** This week's dragon, waking a fresh one (and saving it) when a new week has begun. */
  private raid(): RaidState {
    const stored = this.store.data.raid;
    const raid = currentRaid(stored, this.boss(), new Date());
    if (raid !== stored) {
      this.store.data.raid = raid;
      this.store.changed();
    }
    return raid;
  }

  /** One new piece of food on a random free spot of the area. */
  private growFood(area: ServerArea): void {
    const taken = [...this.food.values()].filter((f) => f.areaId === area.areaId);
    // Not where a disaster has blocked the ground or made tall grass grow.
    const lair = this.lairNow(); // once, not per spot: it works out this week's dragon
    const blocked = new Set([lair, ...(this.visits?.active ?? [])].filter((p) => p.areaId === area.areaId).map((p) => `${p.x},${p.y}`));
    const onLair = (p: { x: number; y: number }) => blocked.has(`${p.x},${p.y}`);
    const open = (this.world ? area.spots.filter((p) => this.world!.foodSpot(area.areaId, p.x, p.y)) : area.spots).filter((p) => !onLair(p));
    const spot = pickFoodSpot(open, taken, Math.random);
    if (!spot) return;
    const item: FoodItem = { id: randomUUID(), areaId: area.areaId, x: spot.x, y: spot.y, kind: pickFoodKind(Math.random) };
    this.food.set(item.id, item);
  }

  private broadcastFood(): void {
    const all = [...this.food.values()];
    for (const entry of this.online.values()) this.tell(entry.client, "food", all);
  }

  /** Players connected right now (for the admin portal). */
  onlineIds(): Set<string> {
    return new Set(this.online.keys());
  }

  /** The admin portal changed the dragon or removed a player: tell everyone connected. */
  adminChanged(): void {
    this.broadcastRaid();
    this.broadcastBeasts();
    this.broadcastCaves();
    this.broadcastPlayers();
  }

  /** The admin portal renamed the game: connected devices update their game list. */
  adminRenamedGame(navn: string): void {
    for (const entry of this.online.values()) this.tell(entry.client, "game", { gameId: this.gameId, navn });
  }

  /** The admin portal renamed a player (the name is already stored): tell their device and everyone else. */
  adminRenamedPlayer(playerId: string, navn: string): void {
    const target = this.online.get(playerId);
    if (!target) return;
    target.info.navn = navn;
    this.tell(target.client, "renamed", { navn });
    this.broadcastPlayers();
  }

  /**
   * The key was changed or the game deleted: everyone is sent away with the "wrong key"
   * code, so their device asks for the new key. A deleted game's room is closed for good.
   */
  adminKickAll(closeRoom: boolean): void {
    for (const entry of [...this.online.values()]) entry.client.leave(GAME_KEY_REJECTED);
    if (closeRoom) {
      LobbyRoom.byGame.delete(this.gameId);
      void this.disconnect();
    }
  }

  // ------------------------------------------------------------ fights: the dragon and visiting beasts

  /** The boss behind a target: the dragon (no targetId) or a visiting beast on the map now. */
  private foe(targetId: string | undefined): Foe | undefined {
    if (!targetId) return { key: DRAGON, boss: this.boss(), state: this.raid(), at: this.lairNow() };
    const beast = this.visits?.get(targetId);
    const def = beast && this.visits!.definition(beast.beastId);
    return beast && def ? { key: beast.id, targetId: beast.id, boss: def, state: beast, at: beast } : undefined;
  }

  /** Stores a boss's HP after a turn. */
  private storeFoe(foe: Foe, state: FightState): void {
    if (foe.targetId) return this.visits?.update(state as BeastState);
    this.store.data.raid = state as RaidState;
    this.store.changed();
  }

  /** Why this player can't fight this boss right now (solo or in a team), or undefined. */
  private foeRefusal(me: Online, targetId: string | undefined): string | undefined {
    const id = me.info.playerId;
    if (me.info.busy || me.info.away || this.raidBattles.has(id) || this.teamOf(id)) return "player is busy";
    const foe = this.foe(targetId);
    if (!foe) return "beast gone";
    if (!targetId && this.roam?.isFlying()) return "dragon flying";
    if (!isAdjacent(me.info, foe.at)) return "too far away";
    if (foe.state.hp <= 0) return targetId ? "beast gone" : "dragon sleeping";
    if ((this.restUntil.get(id) ?? 0) > Date.now()) return "resting";
    return undefined;
  }

  /** The dragon as everyone sees it, including a team gathering at the lair that can be joined. */
  private raidViewNow(): RaidView {
    const view = { ...raidView(this.raid()), lair: this.lairNow() };
    const team = this.teams.get(DRAGON);
    return team?.phase === "gathering" ? { ...view, gathering: gatheringOf(team) } : view;
  }

  /** The visiting beasts as everyone sees them, each with a team gathering at it. */
  private beastViewsNow(): BeastView[] {
    return (this.visits?.active ?? []).map((b) => {
      const team = this.teams.get(b.id);
      return team?.phase === "gathering" ? { ...beastView(b), gathering: gatheringOf(team) } : beastView(b);
    });
  }

  private broadcastBeasts(): void {
    const views = this.beastViewsNow();
    for (const entry of this.online.values()) this.tell(entry.client, "beasts", views);
  }

  private broadcastFoe(key: string): void {
    if (key === DRAGON) this.broadcastRaid();
    else this.broadcastBeasts();
  }

  /** The team a player is in (gathering or fighting), with its target key. */
  private teamOf(playerId: string): [string, TeamSession] | undefined {
    for (const entry of this.teams) if (teamInvolves(entry[1], playerId)) return entry;
    return undefined;
  }

  private teamById(teamId: unknown): [string, TeamSession] | undefined {
    for (const entry of this.teams) if (entry[1].id === teamId) return entry;
    return undefined;
  }

  private teamView(key: string, team: TeamSession, viewerId: string, foe: Foe): TeamView {
    return { ...teamViewFor(team, viewerId, foe.state, foe.boss), ...targetField(targetOf(key)) };
  }

  /** Stores a team after any change and tells its members (and, while it gathers, everyone). */
  private setTeam(key: string, team: TeamSession): void {
    this.teams.set(key, team);
    this.pushTeam(key, team);
    this.broadcastFoe(key);
    this.broadcastPlayers();
  }

  private pushTeam(key: string, team: TeamSession): void {
    const foe = this.foe(targetOf(key));
    if (!foe) return;
    for (const m of team.members) {
      const target = this.online.get(m.playerId);
      if (target) this.tell(target.client, "team", this.teamView(key, team, m.playerId, foe));
    }
  }

  private leaveTeamAs(key: string, playerId: string): void {
    const team = this.teams.get(key);
    const foe = this.foe(targetOf(key));
    if (!team) return;
    if (!foe) return this.endTeam(key, team, "gone");
    const next = leaveTeam(team, playerId);
    if (next.phase === "cancelled") return this.endTeam(key, team, "cancelled");
    if (team.phase === "active") this.restUntil.set(playerId, Date.now() + foe.boss.restSeconds * 1000);
    if (next.phase === "done") return this.finishTeam(key, next);
    // A member who dropped out of the gathering no longer sees the team.
    if (next.phase === "gathering") {
      const target = this.online.get(playerId);
      if (target) this.tell(target.client, "teamEnded", { teamId: team.id, reason: "cancelled" });
    }
    this.setTeam(key, next);
    // Everyone still fighting may now have answered: the turn can resolve.
    if (next.phase === "active" && next.members.filter((m) => m.status === "in").every((m) => next.pending[m.playerId])) {
      this.afterTeamTurn(key, next, timeoutTeamTurn(next, foe.state, foe.boss, new Date()));
    }
  }

  /** After a move (or a timeout): store the boss's HP, tell everyone, and settle a finished fight. */
  private afterTeamTurn(key: string, before: TeamSession, result: { session: TeamSession; raid: FightState; defeatedNow: boolean }): void {
    const foe = this.foe(targetOf(key));
    if (!foe) return this.endTeam(key, before, "gone");
    this.storeFoe(foe, result.raid);
    if (result.session.turn !== before.turn) this.armTeamTimer(key);
    if (result.session.phase === "done") this.finishTeam(key, result.session);
    else this.setTeam(key, result.session);
    if (result.defeatedNow) this.foeDefeated({ ...foe, state: result.raid }, result.raid);
  }

  /** The fight is over: everyone sees the result, then rests like after a solo attempt. */
  private finishTeam(key: string, team: TeamSession): void {
    this.teamTimers.get(key)?.clear();
    this.teamTimers.delete(key);
    this.pushTeam(key, team);
    const restUntil = Date.now() + (this.foe(targetOf(key))?.boss.restSeconds ?? this.boss().restSeconds) * 1000;
    // Members whose monster fainted pass out on their device instead.
    for (const m of team.members) {
      if (m.status !== "fainted") this.restUntil.set(m.playerId, Math.max(this.restUntil.get(m.playerId) ?? 0, restUntil));
    }
    this.teams.delete(key);
    this.broadcastFoe(key);
    this.broadcastPlayers();
  }

  private endTeam(key: string, team: TeamSession, reason: ServerMessages["teamEnded"]["reason"]): void {
    this.teamTimers.get(key)?.clear();
    this.teamTimers.delete(key);
    this.teams.delete(key);
    for (const m of team.members) {
      const target = this.online.get(m.playerId);
      if (target) this.tell(target.client, "teamEnded", { teamId: team.id, reason });
    }
    this.broadcastFoe(key);
    this.broadcastPlayers();
  }

  /** The turn clock restarts after each resolved turn; silent members then skip. */
  private armTeamTimer(key: string): void {
    this.teamTimers.get(key)?.clear();
    this.teamTimers.set(
      key,
      this.clock.setTimeout(() => {
        this.teamTimers.delete(key);
        const team = this.teams.get(key);
        const foe = this.foe(targetOf(key));
        if (team?.phase !== "active") return;
        if (!foe) return this.endTeam(key, team, "gone");
        this.afterTeamTurn(key, team, timeoutTeamTurn(team, foe.state, foe.boss, new Date()));
      }, TURN_MS)
    );
  }

  private broadcastRaid(): void {
    const view = this.raidViewNow();
    for (const entry of this.online.values()) this.tell(entry.client, "raid", view);
  }

  /** Ends a solo attempt. A monster that fainted passes out on the device instead of resting here. */
  private endAttempt(playerId: string, fainted = false, restSeconds = this.boss().restSeconds): void {
    this.raidBattles.delete(playerId);
    if (!fainted) this.restUntil.set(playerId, Date.now() + restSeconds * 1000);
    this.broadcastPlayers();
  }

  private restIso(playerId: string): string | undefined {
    const until = this.restUntil.get(playerId);
    return until ? new Date(until).toISOString() : undefined;
  }

  /**
   * Everyone who hurt the boss shares the win: a scoreboard event and a baby of its kind
   * each. A beaten beast is gone at once; a beaten dragon sleeps until Monday.
   */
  private foeDefeated(foe: Foe, state: FightState): void {
    const at = new Date().toISOString();
    const kind = foe.targetId ? ("beast" as const) : ("dragon" as const);
    for (const playerId of contributors(state)) {
      this.store.data.events.push({ id: randomUUID(), playerId, kind, at, ...(playerId === state.finalBlowBy ? { finalBlow: true } : {}) });
      const reward = {
        rewardId: randomUUID(),
        reason: kind,
        // HP is set to the species' full HP by the device, which knows the species' stats.
        creature: { instanceId: randomUUID(), speciesId: foe.boss.rewardSpeciesId, ownerId: playerId, niveau: 1, currentHp: 1, caughtAt: at },
      };
      this.store.data.rewards[playerId] = [...(this.store.data.rewards[playerId] ?? []), reward];
      const target = this.online.get(playerId);
      if (target) this.tell(target.client, "reward", reward);
    }
    // A team still gathering (or fighting, if a solo attempt beat it) has nothing left to fight.
    const team = this.teams.get(foe.key);
    if (team?.phase === "gathering") this.endTeam(foe.key, team, "defeated");
    else if (team?.phase === "active") this.finishTeam(foe.key, { ...team, phase: "done", outcome: "won" });
    // Anyone else mid-attempt on it: it is beaten, so their attempt ends too.
    for (const [playerId, attempt] of [...this.raidBattles]) {
      if ((attempt.targetId ?? DRAGON) !== foe.key) continue;
      this.raidBattles.delete(playerId);
      const target = this.online.get(playerId);
      if (target) this.tell(target.client, "raidBattle", { battle: attempt.battle, over: "defeated", ...targetField(attempt.targetId) });
    }
    if (foe.targetId) this.visits?.beaten(foe.targetId);
    this.store.changed();
    this.broadcastFoe(foe.key);
    this.broadcastPlayers();
  }

  // ------------------------------------------------------------ visiting beasts

  private startVisits(beasts: BeastDefinition[]): void {
    this.visits = new BeastVisits({
      store: this.store,
      areas: this.areas,
      beasts,
      terrain: (areaId) => this.world?.terrain(areaId) ?? emptyTerrain(),
      occupied: (areaId) => {
        const lair = this.lairNow();
        const players = [...this.online.values()].filter((o) => o.info.areaId === areaId).map((o) => o.info);
        return lair.areaId === areaId ? [...players, lair] : players;
      },
      // Only a fight going on keeps it; a team still gathering is sent home when it leaves.
      busy: (id) => this.teams.get(id)?.phase === "active" || [...this.raidBattles.values()].some((a) => a.targetId === id),
      changed: () => {
        this.clearFoodUnderBeasts();
        this.broadcastBeasts();
      },
      leaving: (beast) => {
        const team = this.teams.get(beast.id);
        if (team) this.endTeam(beast.id, team, "gone");
      },
      rand: Math.random,
    });
    this.clock.setInterval(() => this.visits?.tick(), 5_000);
  }

  // ------------------------------------------------------------ caves

  private caveConfig?: CaveConfig;
  private minigameConfig?: MinigameConfig;

  private startCaves(config: CaveConfig): void {
    this.caveConfig = config;
    this.caves = new CaveOpenings({
      store: this.store,
      areas: this.areas,
      config,
      terrain: (areaId) => this.world?.terrain(areaId) ?? emptyTerrain(),
      occupied: (areaId) => {
        const lair = this.lairNow();
        const here = [...this.online.values()].filter((o) => o.info.areaId === areaId).map((o) => o.info as WorldPosition);
        const beasts = (this.visits?.active ?? []).filter((b) => b.areaId === areaId);
        return [...here, ...beasts, ...(lair.areaId === areaId ? [lair] : [])];
      },
      changed: () => this.broadcastCaves(),
      rand: Math.random,
    });
    this.clock.setInterval(() => this.caves?.tick(), 5_000);
  }

  /** The kinds of caves there are (for the admin portal). */
  caveKinds(): Array<{ id: string; navn: string }> {
    return (this.caveConfig?.kinds ?? []).map((k) => ({ id: k.id, navn: k.navn }));
  }

  private broadcastCaves(): void {
    const caves = [...(this.caves?.active ?? [])];
    for (const entry of this.online.values()) this.tell(entry.client, "caves", caves);
  }

  /** Food doesn't lie where a beast has come up. */
  private clearFoodUnderBeasts(): void {
    let gone = false;
    for (const b of this.visits?.active ?? []) {
      for (const f of [...this.food.values()]) {
        if (f.areaId === b.areaId && f.x === b.x && f.y === b.y) {
          this.food.delete(f.id);
          this.extraFood.delete(f.id);
          gone = true;
        }
      }
    }
    if (gone) this.broadcastFood();
  }

  /** Why an invite from `me` to `target` must be refused, or undefined if it is fine. Shared by trades and duels. */
  private inviteRefusal(me: Online | undefined, target: Online | undefined): string | undefined {
    if (!me || !target) return "player not online";
    if (me.info.busy || target.info.busy || me.info.away || target.info.away) return "player is busy";
    if (!isAdjacent(me.info, target.info)) return "too far away";
    return undefined;
  }

  private duelFor(client: Client, duelId: string | undefined): DuelSession | undefined {
    const me = this.playerOf(client);
    const session = duelId ? this.duels.get(duelId) : undefined;
    if (!me || !session || !duelInvolves(session, me.info.playerId)) {
      this.problem(client, "no such duel");
      return undefined;
    }
    return session;
  }

  private stepDuel(client: Client, duelId: string | undefined, apply: (s: DuelSession, playerId: string) => DuelResult): void {
    const session = this.duelFor(client, duelId);
    const me = this.playerOf(client);
    if (!session || !me) return;
    const result = apply(session, me.info.playerId);
    if (!result.ok) return this.problem(client, result.reason);
    this.settleDuel(result.session, "cancelled");
  }

  /** Stores or retires a duel after a transition and tells both players. */
  private settleDuel(session: DuelSession, endReason: ServerMessages["duelEnded"]["reason"]): void {
    if (session.phase === "done" || session.phase === "cancelled") this.clearDuelTimer(session.id);
    if (session.phase === "done") {
      this.pushDuel(session);
      this.duels.delete(session.id);
      const winnerId = session.battle?.winnerId;
      if (winnerId) {
        this.store.data.events.push({ id: randomUUID(), playerId: winnerId, kind: "duel", at: new Date().toISOString() });
        this.store.changed();
      }
    } else if (session.phase === "cancelled") {
      this.duels.delete(session.id);
      for (const playerId of [session.inviterId, session.inviteeId]) {
        const target = this.online.get(playerId);
        if (target) this.tell(target.client, "duelEnded", { duelId: session.id, reason: endReason });
      }
    } else {
      this.duels.set(session.id, session);
      this.pushDuel(session);
      // The clock restarts when the duel begins and after each resolved turn — not on the first answer.
      if (session.phase === "active" && Object.keys(session.pending).length === 0) this.armDuelTimer(session.id);
    }
    this.broadcastPlayers();
  }

  private armDuelTimer(duelId: string): void {
    this.clearDuelTimer(duelId);
    this.duelTimers.set(
      duelId,
      this.clock.setTimeout(() => {
        this.duelTimers.delete(duelId);
        const session = this.duels.get(duelId);
        if (!session) return;
        const result = timeoutTurn(session);
        if (result.ok) this.settleDuel(result.session, "cancelled");
      }, TURN_MS)
    );
  }

  private clearDuelTimer(duelId: string): void {
    this.duelTimers.get(duelId)?.clear();
    this.duelTimers.delete(duelId);
  }

  private pushDuel(session: DuelSession): void {
    for (const playerId of [session.inviterId, session.inviteeId]) {
      const target = this.online.get(playerId);
      if (target) this.tell(target.client, "duel", duelView(session));
    }
  }

  private playerOf(client: Client): Online | undefined {
    const playerId = (client.userData as { playerId?: string } | undefined)?.playerId;
    return playerId ? this.online.get(playerId) : undefined;
  }

  private sessionFor(client: Client, tradeId: string | undefined): TradeSession | undefined {
    const me = this.playerOf(client);
    const session = tradeId ? this.trades.get(tradeId) : undefined;
    if (!me || !session || !involves(session, me.info.playerId)) {
      this.problem(client, "no such trade");
      return undefined;
    }
    return session;
  }

  /** Runs one state-machine transition, then pushes the result to both players. */
  private step(client: Client, tradeId: string | undefined, apply: (s: TradeSession, playerId: string) => TradeResult): void {
    const session = this.sessionFor(client, tradeId);
    const me = this.playerOf(client);
    if (!session || !me) return;
    const result = apply(session, me.info.playerId);
    if (!result.ok) return this.problem(client, result.reason);
    if (result.session.phase === "done") return this.finishTrade(result.session);
    this.trades.set(result.session.id, result.session);
    this.pushTrade(result.session);
  }

  private finishTrade(session: TradeSession): void {
    this.trades.delete(session.id);
    // Queue first, then send: a client that drops mid-send still gets it on rejoin.
    const deliveries = deliveriesFor(session);
    const players = [session.inviter.playerId, session.invitee.playerId];
    players.forEach((playerId, i) => {
      const delivery = deliveries[i]!;
      this.pending.set(playerId, [...(this.pending.get(playerId) ?? []), delivery]);
      const target = this.online.get(playerId);
      if (target) this.tell(target.client, "tradeComplete", delivery);
    });
    this.broadcastPlayers();
  }

  private endTrade(session: TradeSession, reason: ServerMessages["tradeEnded"]["reason"]): void {
    this.trades.delete(cancelTrade(session).id);
    for (const playerId of [session.inviter.playerId, session.invitee.playerId]) {
      const target = this.online.get(playerId);
      if (target) this.tell(target.client, "tradeEnded", { tradeId: session.id, reason });
    }
    this.broadcastPlayers();
  }

  private pushTrade(session: TradeSession): void {
    for (const playerId of [session.inviter.playerId, session.invitee.playerId]) {
      const target = this.online.get(playerId);
      if (target) this.tell(target.client, "trade", session);
    }
  }

  private broadcastPlayers(): void {
    const busy = new Set<string>();
    for (const s of this.trades.values()) {
      busy.add(s.inviter.playerId);
      busy.add(s.invitee.playerId);
    }
    for (const s of this.duels.values()) {
      busy.add(s.inviterId);
      busy.add(s.inviteeId);
    }
    for (const playerId of this.raidBattles.keys()) busy.add(playerId);
    for (const team of this.teams.values()) for (const m of team.members) if (m.status === "in") busy.add(m.playerId);
    const players = [...this.online.values()].map(({ info }) => ({ ...info, busy: busy.has(info.playerId) }));
    for (const entry of this.online.values()) {
      entry.info.busy = busy.has(entry.info.playerId);
      this.tell(entry.client, "players", players);
    }
  }

  private problem(client: Client, reason: string): void {
    this.tell(client, "problem", { reason });
  }

  /** Typed wrapper so message names and payloads can't drift from the shared protocol. */
  private tell<K extends keyof ServerMessages>(client: Client, type: K, payload: ServerMessages[K]): void {
    client.send(type, payload);
  }
}
