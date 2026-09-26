import { randomUUID } from "node:crypto";
import {
  applyCut,
  applyDig,
  applyDisaster,
  blocks,
  canCut,
  canDig,
  emptyTerrain,
  healAllNow,
  healTerrain,
  isAdjacent,
  nextDisasterAt,
  pickDisasterKind,
  planDisaster,
  possibleKinds,
  tileKey,
  tileNow,
  walkableNow,
  type AreaTerrain,
  type DisasterConfigs,
  type DisasterKind,
  type DisasterMessage,
  type DisasterNews,
  type DisasterPlan,
  type MinigameConfig,
  type ServerMessages,
  type WorkKind,
} from "@monster-spil/shared";
import { HISTORY_MAX, type GameStore } from "./game-store.js";
import type { ServerArea } from "./areas.js";

/** Someone on the map, as the disasters need to know them. */
export interface WorldPlayer {
  playerId: string;
  areaId: string;
  x: number;
  y: number;
  /** In a trade, duel or dragon fight, or away (a wild battle): a disaster passes them by. */
  unavailable: boolean;
}

/** What the game's room gives the disasters. */
export interface WorldHost {
  store: GameStore;
  areas: ServerArea[];
  configs: DisasterConfigs;
  /** This week's dragon lair (dragon fire comes from there). */
  lair(): { areaId: string; x: number; y: number } | undefined;
  players(): WorldPlayer[];
  /** To one player, or everyone when `playerId` is undefined. */
  send<K extends keyof ServerMessages>(playerId: string | undefined, type: K, payload: ServerMessages[K]): void;
  later(fn: () => void, ms: number): { clear(): void };
  /** The terrain of an area changed: food on tiles that are now blocked must go. */
  terrainChanged(areaId: string): void;
  /** Extra food (the hurricane's fruit) that doesn't grow back. */
  scatterFood(areaId: string, spots: Array<{ x: number; y: number }>): void;
  rand(): number;
}

/** How long a claim on a waiting monster holds while its battle runs. */
const CLAIM_MS = 3 * 60_000;
/** How far from a player a disaster aimed near them lands (so they see it, with room to run). */
const NEAR_MIN = 3;
const NEAR_MAX = 7;
/** How often a disaster is aimed near someone who is playing, rather than anywhere. */
const AIM_NEAR_PLAYER = 0.6;
const NEWS_HOURS = 24;

/**
 * Natural disasters for one game: when the next one comes, the warning, the strike (who
 * passes out, how the map changes), healing over time, and the monsters they leave.
 * All rules are the pure ones in shared/src/world; this class only keeps time and state.
 */
export class WorldEvents {
  private active?: { plan: DisasterPlan; strikeAt: Date; timer: { clear(): void } };

  constructor(private readonly host: WorldHost) {
    const w = host.store.data.world;
    for (const a of this.disasterAreas()) w.areas[a.areaId] ??= emptyTerrain();
    if (!w.nextAt) this.schedule(new Date());
  }

  /** Areas that can have disasters (their meta has a `terrain` block). */
  private disasterAreas(): Array<ServerArea & { base: NonNullable<ServerArea["base"]> }> {
    return this.host.areas.filter((a): a is ServerArea & { base: NonNullable<ServerArea["base"]> } => Boolean(a.base));
  }

  terrain(areaId: string): AreaTerrain {
    return (this.host.store.data.world.areas[areaId] ??= emptyTerrain());
  }

  /** Can someone stand here now (for food, and for checking positions)? Areas without disasters use only the base map. */
  walkable(areaId: string, x: number, y: number): boolean {
    const area = this.host.areas.find((a) => a.areaId === areaId);
    if (!area?.base) return true;
    return walkableNow(area.base, this.terrain(areaId), x, y);
  }

  /** Food doesn't grow in tall grass or on blocked tiles. */
  foodSpot(areaId: string, x: number, y: number): boolean {
    const area = this.host.areas.find((a) => a.areaId === areaId);
    if (!area?.base) return true;
    const t = tileNow(area.base, this.terrain(areaId), x, y);
    return !blocks(area.base, t) && !t.grass;
  }

  /**
   * A player's work on the land (shared/src/world/work.ts): felling a tree next to them, or
   * digging where they stand. Returns why not, or undefined when done (everyone sees it).
   */
  work(kind: WorkKind, player: WorldPlayer, x: number, y: number, config: MinigameConfig, now = new Date()): string | undefined {
    const area = this.host.areas.find((a) => a.areaId === player.areaId);
    if (!area?.base) return "no work here";
    const terrain = this.terrain(area.areaId);
    if (kind === "cut") {
      if (!isAdjacent(player, { areaId: player.areaId, x, y }) || !canCut(area.base, terrain, x, y)) return "cannot work here";
      applyCut(area.base, terrain, x, y, now, config);
    } else {
      if (player.x !== x || player.y !== y || !canDig(area.base, terrain, x, y)) return "cannot work here";
      applyDig(area.base, terrain, x, y, now, config);
    }
    this.changed(area.areaId);
    return undefined;
  }

  /** Called every few seconds: heal what is due, and start the next disaster when it's time. */
  tick(now = new Date()): void {
    for (const area of this.disasterAreas()) {
      // Nothing grows back under anyone's feet.
      const occupied = new Set(this.host.players().filter((p) => p.areaId === area.areaId).map((p) => tileKey(p.x, p.y)));
      if (healTerrain(area.base, this.terrain(area.areaId), now, occupied)) this.changed(area.areaId);
    }
    const w = this.host.store.data.world;
    if (!w.settings.enabled || this.active) return;
    if (w.nextAt && Date.parse(w.nextAt) <= now.getTime()) {
      this.start(undefined, now);
      this.schedule(now);
    }
  }

  /** Picks when the next disaster comes (after a settings change, or after one has started). */
  schedule(now = new Date()): void {
    const w = this.host.store.data.world;
    w.nextAt = nextDisasterAt(now, w.settings, () => this.host.rand()).toISOString();
    this.host.store.changed();
  }

  get nextAt(): string | undefined {
    return this.host.store.data.world.settings.enabled ? this.host.store.data.world.nextAt : undefined;
  }

  get activeView(): { kind: DisasterKind; strikeAt: string } | undefined {
    return this.active ? { kind: this.active.plan.kind, strikeAt: this.active.strikeAt.toISOString() } : undefined;
  }

  /**
   * Starts a disaster now: the warning goes out, the strike follows. Returns why not, if
   * it can't. `target` (a walkable tile) aims it; otherwise it lands near someone playing,
   * or anywhere.
   */
  start(kind?: DisasterKind, now = new Date(), target?: { x: number; y: number }): string | undefined {
    if (this.active) return "en katastrofe er allerede på vej";
    const areas = this.disasterAreas();
    if (!areas.length) return "ingen kort kan have katastrofer";
    const players = this.host.players();
    // Somewhere people are playing, if anyone is.
    const busyAreas = areas.filter((a) => players.some((p) => p.areaId === a.areaId));
    const pool = busyAreas.length ? busyAreas : areas;
    const area = pool[Math.floor(this.host.rand() * pool.length)]!;
    const lairHere = this.host.lair();
    const lair = lairHere?.areaId === area.areaId ? { x: lairHere.x, y: lairHere.y } : undefined;
    const possible = possibleKinds(area.base, lair);
    const w = this.host.store.data.world;
    const chosen = kind ?? pickDisasterKind(w.settings, this.host.configs, possible, () => this.host.rand());
    if (!chosen) return "ingen slags katastrofer er slået til";
    if (!possible.includes(chosen)) return "den slags kan ikke ske her";
    const config = this.host.configs[chosen];
    const here = players.filter((p) => p.areaId === area.areaId);
    if (target && !walkableNow(area.base, this.terrain(area.areaId), target.x, target.y)) target = undefined;
    // The dragon flies about: what disasters must leave alone is wherever it sits now.
    const base = { ...area.base, fixed: lair ? [lair] : [] };
    const plan = planDisaster(chosen, base, this.terrain(area.areaId), config, () => this.host.rand(), {
      id: randomUUID(),
      target: target ?? this.aim(area, here),
      ...(lair ? { lair } : {}),
      keepWalkable: here.map(({ x, y }) => ({ x, y })),
    });
    const strikeAt = new Date(now.getTime() + config.warnSeconds * 1000);
    const timer = this.host.later(() => this.strike(), config.warnSeconds * 1000);
    this.active = { plan, strikeAt, timer };
    this.host.send(undefined, "disaster", this.message(plan, "warning", strikeAt));
    return undefined;
  }

  /** A disaster aimed near someone playing, so it's seen — but a few tiles away, with time to run. */
  private aim(area: ServerArea & { base: NonNullable<ServerArea["base"]> }, here: WorldPlayer[]): { x: number; y: number } | undefined {
    if (!here.length || this.host.rand() > AIM_NEAR_PLAYER) return undefined;
    const p = here[Math.floor(this.host.rand() * here.length)]!;
    for (let i = 0; i < 30; i++) {
      const a = this.host.rand() * Math.PI * 2;
      const d = NEAR_MIN + this.host.rand() * (NEAR_MAX - NEAR_MIN);
      const x = Math.round(p.x + Math.cos(a) * d);
      const y = Math.round(p.y + Math.sin(a) * d);
      if (walkableNow(area.base, this.terrain(area.areaId), x, y) && Math.hypot(x - area.base.start.x, y - area.base.start.y) > 4) return { x, y };
    }
    return undefined;
  }

  private strike(now = new Date()): void {
    const active = this.active;
    if (!active) return;
    this.active = undefined;
    const { plan } = active;
    const area = this.disasterAreas().find((a) => a.areaId === plan.areaId);
    if (!area) return;
    const danger = new Set(plan.danger);
    const struck = this.host
      .players()
      .filter((p) => p.areaId === plan.areaId && !p.unavailable && danger.has(tileKey(p.x, p.y)))
      .map((p) => p.playerId);
    applyDisaster(area.base, this.terrain(plan.areaId), plan, this.host.configs[plan.kind], now);
    const w = this.host.store.data.world;
    w.history.unshift({ id: plan.id, kind: plan.kind, areaId: plan.areaId, x: plan.center.x, y: plan.center.y, at: now.toISOString(), struck: struck.length });
    w.history.length = Math.min(w.history.length, HISTORY_MAX);
    this.host.send(undefined, "disaster", { ...this.message(plan, "strike", active.strikeAt), struck });
    if (plan.food.length) this.host.scatterFood(plan.areaId, plan.food);
    this.changed(plan.areaId);
  }

  /** A parent stopped disasters: one that is being warned about is called off. */
  cancelActive(): void {
    this.active?.timer.clear();
    this.active = undefined;
  }

  private message(plan: DisasterPlan, phase: DisasterMessage["phase"], strikeAt: Date): DisasterMessage {
    return { id: plan.id, kind: plan.kind, areaId: plan.areaId, phase, center: plan.center, danger: plan.danger, strikeAt: strikeAt.toISOString() };
  }

  /** Stores and tells everyone how the area looks now. */
  private changed(areaId: string): void {
    this.host.store.changed();
    this.host.terrainChanged(areaId);
    this.host.send(undefined, "terrain", this.terrainMessage(areaId));
  }

  terrainMessage(areaId: string): ServerMessages["terrain"] {
    const since = Date.now() - NEWS_HOURS * 3_600_000;
    const recent: DisasterNews[] = this.host.store.data.world.history
      .filter((h) => h.areaId === areaId && Date.parse(h.at) > since)
      .map(({ id, kind, at }) => ({ id, kind, at }));
    return { areaId, terrain: this.terrain(areaId), recent };
  }

  /** On join: how every area looks, and a disaster that is on its way. */
  welcome(playerId: string): void {
    for (const a of this.host.areas) this.host.send(playerId, "terrain", this.terrainMessage(a.areaId));
    if (this.active) this.host.send(playerId, "disaster", this.message(this.active.plan, "warning", this.active.strikeAt));
  }

  // ---- the monster a disaster left waiting (the UFO's alien)

  claim(player: WorldPlayer, spawnId: string, now = new Date()): string | undefined {
    const spawn = this.terrain(player.areaId).spawns.find((s) => s.id === spawnId);
    if (!spawn) return "gone";
    if (!isAdjacent(player, { areaId: player.areaId, x: spawn.x, y: spawn.y })) return "too far away";
    const claimedUntil = spawn.claimedUntil ? Date.parse(spawn.claimedUntil) : 0;
    if (spawn.claimedBy && spawn.claimedBy !== player.playerId && claimedUntil > now.getTime()) return "someone else is battling it";
    spawn.claimedBy = player.playerId;
    spawn.claimedUntil = new Date(now.getTime() + CLAIM_MS).toISOString();
    this.host.send(player.playerId, "spawnBattle", { spawnId, speciesId: spawn.speciesId });
    this.changed(player.areaId);
    return undefined;
  }

  done(playerId: string, spawnId: string, caught: boolean): void {
    for (const [areaId, terrain] of Object.entries(this.host.store.data.world.areas)) {
      const spawn = terrain.spawns.find((s) => s.id === spawnId);
      if (!spawn || spawn.claimedBy !== playerId) continue;
      if (caught) terrain.spawns = terrain.spawns.filter((s) => s !== spawn);
      else {
        delete spawn.claimedBy;
        delete spawn.claimedUntil;
      }
      this.changed(areaId);
    }
  }

  /** Someone left mid-battle with a waiting monster: it waits for the next one. */
  playerLeft(playerId: string): void {
    for (const [areaId, terrain] of Object.entries(this.host.store.data.world.areas)) {
      const mine = terrain.spawns.filter((s) => s.claimedBy === playerId);
      for (const s of mine) {
        delete s.claimedBy;
        delete s.claimedUntil;
      }
      if (mine.length) this.changed(areaId);
    }
  }

  // ---- the admin portal

  settingsChanged(): void {
    if (!this.host.store.data.world.settings.enabled) this.cancelActive();
    this.schedule();
  }

  /** Heals every soft change now (hard ones stay). */
  healAll(now = new Date()): void {
    for (const area of this.disasterAreas()) {
      healAllNow(area.base, this.terrain(area.areaId), now);
      this.changed(area.areaId);
    }
  }

  /** Every map back to how it was drawn: all changes, zones and waiting monsters gone. */
  resetAll(): void {
    this.cancelActive();
    for (const area of this.disasterAreas()) {
      this.host.store.data.world.areas[area.areaId] = emptyTerrain();
      this.changed(area.areaId);
    }
  }
}
