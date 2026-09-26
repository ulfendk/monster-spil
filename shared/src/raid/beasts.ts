import type { WorldPosition } from "../world/adjacency.js";
import { inside, staysConnected, tileKey, tileNow, walkableNow, type AreaTerrain, type BaseArea } from "../world/terrain.js";
import type { FightBoss, FightState } from "./raid.js";

/**
 * Visiting beasts: sand serpents that rise out of the dunes and giant eagles that swoop
 * down from the forest. Each kind turns up now and then, stays a while and leaves again.
 * They are fought exactly like the family dragon — alone or as a team, with shared HP,
 * and everyone who hurt one gets a baby of its own when it is beaten.
 *
 * Pure rules with an injected random source; the server keeps time and state
 * (server/src/beasts.ts), the parent sets the pace in the admin portal.
 */

/** Where a kind of beast appears: on sand (dunes, beaches) or at a forest's edge. */
export type Habitat = "sand" | "forest";
export const HABITATS: readonly Habitat[] = ["sand", "forest"];

/** A kind of beast as written in shared/content/beasts/<id>.json. */
export interface BeastDefinition extends FightBoss {
  habitat: Habitat;
}

/** One beast on the map right now. */
export interface BeastState extends FightState {
  /** This visit's id (a new one every time the kind turns up). */
  id: string;
  beastId: string;
  areaId: string;
  x: number;
  y: number;
  appearedAt: string;
  /** It leaves at this time (ISO) — later if someone is still fighting it then. */
  leavesAt: string;
}

/** What every client may see of a beast. */
export interface BeastView {
  id: string;
  beastId: string;
  areaId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  defeated: boolean;
  contributors: number;
  leavesAt: string;
  /** A team gathering at it that others can join (set by the server). */
  gathering?: { teamId: string; leaderId: string; size: number };
}

export interface BeastSettings {
  enabled: boolean;
  /** Average minutes between two visits of the same kind. */
  meanMinutes: number;
  /** How long one stays before it leaves. */
  stayMinutes: number;
  /** 0 = exactly every meanMinutes, 1 = anywhere from 0 to twice that. */
  randomness: number;
}

export const DEFAULT_BEAST_SETTINGS: BeastSettings = { enabled: true, meanMinutes: 60, stayMinutes: 15, randomness: 0.5 };
export const MIN_BEAST_GAP_MINUTES = 5;
export const MAX_BEAST_GAP_MINUTES = 7 * 24 * 60;
export const MIN_BEAST_STAY_MINUTES = 2;
export const MAX_BEAST_STAY_MINUTES = 120;

/** Settings from the admin portal, checked field by field (anything odd keeps the old value). */
export function cleanBeastSettings(raw: unknown, old: BeastSettings): BeastSettings {
  const r = (raw ?? {}) as Partial<BeastSettings>;
  const num = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : old.enabled,
    meanMinutes: Math.round(num(r.meanMinutes, MIN_BEAST_GAP_MINUTES, MAX_BEAST_GAP_MINUTES, old.meanMinutes)),
    stayMinutes: Math.round(num(r.stayMinutes, MIN_BEAST_STAY_MINUTES, MAX_BEAST_STAY_MINUTES, old.stayMinutes)),
    randomness: num(r.randomness, 0, 1, old.randomness),
  };
}

/** When a kind turns up next: the average gap, spread by the randomness either way, counted from when the last one left. */
export function nextBeastAt(now: Date, settings: BeastSettings, rand: () => number): Date {
  const spread = 1 + settings.randomness * (2 * rand() - 1);
  const minutes = Math.max(MIN_BEAST_GAP_MINUTES, settings.meanMinutes * spread);
  return new Date(now.getTime() + minutes * 60_000);
}

export function freshBeast(def: BeastDefinition, id: string, at: WorldPosition, now: Date, settings: BeastSettings): BeastState {
  return {
    id,
    beastId: def.id,
    areaId: at.areaId,
    x: at.x,
    y: at.y,
    hp: def.maxHp,
    maxHp: def.maxHp,
    damageBy: {},
    appearedAt: now.toISOString(),
    leavesAt: new Date(now.getTime() + settings.stayMinutes * 60_000).toISOString(),
  };
}

export function beastView(beast: BeastState): BeastView {
  return {
    id: beast.id,
    beastId: beast.beastId,
    areaId: beast.areaId,
    x: beast.x,
    y: beast.y,
    hp: beast.hp,
    maxHp: beast.maxHp,
    defeated: beast.hp <= 0,
    contributors: Object.values(beast.damageBy).filter((d) => d > 0).length,
    leavesAt: beast.leavesAt,
  };
}

/** Its time is up (the server still waits for anyone fighting it). */
export function beastDue(beast: BeastState, now: Date): boolean {
  return Date.parse(beast.leavesAt) <= now.getTime();
}

/** How many tree tiles touch a tile (of its 8 neighbours). */
function treesAround(base: BaseArea, terrain: AreaTerrain, x: number, y: number): number {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && inside(base, x + dx, y + dy) && tileNow(base, terrain, x + dx, y + dy).ground === base.tiles.tree) n++;
  }
  return n;
}

/** Whether a beast of this habitat could come up on the tile: sand for serpents, open ground at a forest's edge for eagles. */
export function habitatTile(base: BaseArea, terrain: AreaTerrain, habitat: Habitat, x: number, y: number): boolean {
  const s = tileNow(base, terrain, x, y);
  if (s.grass) return false;
  if (habitat === "sand") return base.tiles.sand !== undefined && s.ground === base.tiles.sand;
  return s.ground === base.tiles.ground && treesAround(base, terrain, x, y) >= FOREST_EDGE_TREES;
}

export interface BeastSpotOptions {
  /** Tiles that are taken: players, the dragon, other beasts, waiting monsters. */
  occupied?: Array<{ x: number; y: number }>;
  rand: () => number;
}

const MIN_FROM_START = 8;
const MARGIN = 2;
/** An eagle lands where at least this many trees stand around it. */
const FOREST_EDGE_TREES = 3;
/** Of its 8 neighbours at least this many are walkable: room for a small team. */
const MIN_FREE_NEIGHBOURS = 4;
/** Tiles tried for connectivity (each check walks the whole map). */
const TRIES = 25;

/**
 * Picks where a beast comes up: a tile of its habitat, with room around it, away from where
 * new players appear, never on (or next to) anything else, and never one that would cut the
 * map in two while it sits there. Undefined if the map has no such place.
 */
export function chooseBeastSpot(base: BaseArea, terrain: AreaTerrain, habitat: Habitat, opts: BeastSpotOptions): { x: number; y: number } | undefined {
  const near = new Set<string>();
  for (const p of opts.occupied ?? []) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) near.add(tileKey(p.x + dx, p.y + dy));
  for (const s of terrain.spawns) near.add(tileKey(s.x, s.y));
  const candidates: Array<{ x: number; y: number }> = [];
  for (let y = MARGIN; y < base.height - MARGIN; y++) {
    for (let x = MARGIN; x < base.width - MARGIN; x++) {
      if (near.has(tileKey(x, y)) || !habitatTile(base, terrain, habitat, x, y)) continue;
      if (Math.hypot(x - base.start.x, y - base.start.y) < MIN_FROM_START) continue;
      let free = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && walkableNow(base, terrain, x + dx, y + dy)) free++;
      if (free >= MIN_FREE_NEIGHBOURS) candidates.push({ x, y });
    }
  }
  // Fisher–Yates, so every fitting spot is equally likely.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(opts.rand() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
  }
  for (const c of candidates.slice(0, TRIES)) {
    if (staysConnected(base, (x, y) => walkableNow(base, terrain, x, y), new Set([tileKey(c.x, c.y)]))) return c;
  }
  return undefined;
}
