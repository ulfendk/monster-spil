import type { WorldPosition } from "../world/adjacency.js";
import { inside, tileKey, tileNow, walkableNow, type AreaTerrain, type BaseArea } from "../world/terrain.js";

/**
 * Caves that open in the mountains now and then and close again. A player standing next
 * to an open cave can go in once: a minigame where monsters peek out from behind rocks
 * and you shoot balls at them with a slingshot to catch them (the device runs it; see throw.ts).
 *
 * Pure rules with an injected random source; the server keeps time and state
 * (server/src/cave-openings.ts), the parent sets the pace in the admin portal, and what
 * lives in the caves is content (shared/content/caves.json).
 */

/** shared/content/caves.json: what a cave visit holds, and the kinds of caves there are. */
export interface CaveConfig {
  /** Balls per visit. */
  balls: number;
  /** Monsters in the cave on one visit. */
  monsters: number;
  kinds: CaveKind[];
}

/**
 * A kind of cave: its name, how often it's the one that opens, who lives in it, and how
 * it looks inside. Colours are names from the game's Kanagawa palette (client/src/ui/theme.ts);
 * `decor` and `particles` pick from the shapes the 3D scene knows how to draw.
 */
export interface CaveKind {
  id: string;
  navn: string;
  weight: number;
  species: Array<{ speciesId: string; weight: number }>;
  look: CaveLook;
}

export type CaveDecor = "crystals" | "icicles" | "lava" | "mushrooms" | "pool";
export type CaveParticles = "none" | "embers" | "snow" | "spores" | "drips";

export interface CaveLook {
  walls: string;
  floor: string;
  fog: string;
  /** The colours things glow in (crystals, lava, mushrooms, the water); the first also lights the cave mouth on the map. */
  glow: string[];
  decor: CaveDecor;
  particles: CaveParticles;
}

/** One open cave on the map. */
export interface CaveState {
  id: string;
  /** Which kind of cave (CaveKind.id). Caves stored before kinds existed have none: the first kind. */
  kind?: string;
  areaId: string;
  /** The cave mouth: a mountain tile with open ground in front of it. */
  x: number;
  y: number;
  openedAt: string;
  closesAt: string;
  /** Who has been in (once each per opening). */
  visitedBy: string[];
}

/** What every client may see of a cave. */
export type CaveView = CaveState;

/** One player's visit: what the server hands the device when they go in. */
export interface CaveVisit {
  caveId: string;
  /** Which kind of cave it is (its look, and who lives in it). */
  kind: string;
  /** Seeds the monsters' hiding and the catch rolls on the device. */
  seed: number;
  /** Which monsters are in there this time (species ids, may repeat). */
  speciesIds: string[];
  balls: number;
}

export interface CaveSettings {
  enabled: boolean;
  /** Average minutes between two caves opening. */
  meanMinutes: number;
  /** How long a cave stays open. */
  openMinutes: number;
  /** 0 = exactly every meanMinutes, 1 = anywhere from 0 to twice that. */
  randomness: number;
}

export const DEFAULT_CAVE_SETTINGS: CaveSettings = { enabled: true, meanMinutes: 60, openMinutes: 20, randomness: 0.5 };
export const MIN_CAVE_GAP_MINUTES = 5;
export const MAX_CAVE_GAP_MINUTES = 7 * 24 * 60;
export const MIN_CAVE_OPEN_MINUTES = 2;
export const MAX_CAVE_OPEN_MINUTES = 240;

/** Settings from the admin portal, checked field by field (anything odd keeps the old value). */
export function cleanCaveSettings(raw: unknown, old: CaveSettings): CaveSettings {
  const r = (raw ?? {}) as Partial<CaveSettings>;
  const num = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : old.enabled,
    meanMinutes: Math.round(num(r.meanMinutes, MIN_CAVE_GAP_MINUTES, MAX_CAVE_GAP_MINUTES, old.meanMinutes)),
    openMinutes: Math.round(num(r.openMinutes, MIN_CAVE_OPEN_MINUTES, MAX_CAVE_OPEN_MINUTES, old.openMinutes)),
    randomness: num(r.randomness, 0, 1, old.randomness),
  };
}

/** When the next cave opens: the average gap, spread by the randomness either way. */
export function nextCaveAt(now: Date, settings: CaveSettings, rand: () => number): Date {
  const spread = 1 + settings.randomness * (2 * rand() - 1);
  const minutes = Math.max(MIN_CAVE_GAP_MINUTES, settings.meanMinutes * spread);
  return new Date(now.getTime() + minutes * 60_000);
}

export function freshCave(id: string, kind: string, at: WorldPosition, now: Date, settings: CaveSettings): CaveState {
  return {
    id,
    kind,
    areaId: at.areaId,
    x: at.x,
    y: at.y,
    openedAt: now.toISOString(),
    closesAt: new Date(now.getTime() + settings.openMinutes * 60_000).toISOString(),
    visitedBy: [],
  };
}

export function caveDue(cave: CaveState, now: Date): boolean {
  return Date.parse(cave.closesAt) <= now.getTime();
}

const STRAIGHT = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** A mountain tile you can walk right up to: a cave can open in its face. */
export function caveMouthTile(base: BaseArea, terrain: AreaTerrain, x: number, y: number): boolean {
  if (tileNow(base, terrain, x, y).ground !== base.tiles.mountain) return false;
  return STRAIGHT.some(([dx, dy]) => walkableNow(base, terrain, x + dx, y + dy));
}

export interface CaveSpotOptions {
  /** Tiles that are taken: players, the dragon, beasts, other caves. */
  occupied?: Array<{ x: number; y: number }>;
  rand: () => number;
}

const MIN_FROM_START = 8;
/** Open tiles around the mouth, so a few players can stand at it. */
const MIN_FREE_NEIGHBOURS = 3;

/**
 * Picks where a cave opens: a mountain face with open ground in front, away from where new
 * players appear and never on or next to anything else. The mouth stays a mountain tile
 * (it blocks walking already), so opening one never changes how the map connects.
 */
export function chooseCaveSpot(base: BaseArea, terrain: AreaTerrain, opts: CaveSpotOptions): { x: number; y: number } | undefined {
  const near = new Set<string>();
  for (const p of opts.occupied ?? []) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) near.add(tileKey(p.x + dx, p.y + dy));
  const candidates: Array<{ x: number; y: number }> = [];
  for (let y = 1; y < base.height - 1; y++) {
    for (let x = 1; x < base.width - 1; x++) {
      if (near.has(tileKey(x, y)) || !caveMouthTile(base, terrain, x, y)) continue;
      if (Math.hypot(x - base.start.x, y - base.start.y) < MIN_FROM_START) continue;
      let free = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && inside(base, x + dx, y + dy) && walkableNow(base, terrain, x + dx, y + dy)) free++;
      if (free >= MIN_FREE_NEIGHBOURS) candidates.push({ x, y });
    }
  }
  if (candidates.length === 0) return undefined;
  return candidates[Math.floor(opts.rand() * candidates.length)];
}

/** Picks something by weight (weights of 0 or less never come up). */
function byWeight<T extends { weight: number }>(items: readonly T[], rand: () => number): T | undefined {
  const total = items.reduce((sum, s) => sum + Math.max(0, s.weight), 0);
  if (total <= 0) return undefined;
  let r = rand() * total;
  return items.find((s) => (r -= Math.max(0, s.weight)) < 0) ?? items.filter((s) => s.weight > 0).at(-1);
}

/** Which kind of cave opens: by weight. */
export function pickCaveKind(config: CaveConfig, rand: () => number): CaveKind | undefined {
  return byWeight(config.kinds, rand);
}

/** A cave's kind, falling back to the first one (caves stored before kinds existed, or a kind since removed). */
export function caveKind(config: CaveConfig, id: string | undefined): CaveKind | undefined {
  return config.kinds.find((k) => k.id === id) ?? config.kinds[0];
}

/** Every monster that lives in some kind of cave. */
export function caveSpeciesIds(config: CaveConfig): Set<string> {
  return new Set(config.kinds.flatMap((k) => k.species.filter((s) => s.weight > 0).map((s) => s.speciesId)));
}

/** Who is in the cave this time: `config.monsters` picked by weight from the cave kind's residents (a species may turn up twice). */
export function planCaveVisit(config: CaveConfig, kind: CaveKind, caveId: string, seed: number, rand: () => number): CaveVisit {
  const speciesIds: string[] = [];
  for (let i = 0; i < config.monsters; i++) {
    const pick = byWeight(kind.species, rand);
    if (pick) speciesIds.push(pick.speciesId);
  }
  return { caveId, kind: kind.id, seed, speciesIds, balls: config.balls };
}

/** The boulders monsters hide behind: how many, and where — different in every cave. */
export const ROCK_AREA = { minX: -2.9, maxX: 2.9, minZ: -11.5, maxZ: -5.5 } as const;
const ROCK_SPACING = 2.3;

/**
 * Lays out 4–6 boulders from a seed (the visit's): spread over the part of the cave every
 * slingshot can reach (see throw.ts), never on top of each other, and at least one close by.
 */
export function caveRocks(seed: number): Array<{ x: number; z: number }> {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const want = 4 + Math.floor(rand() * 3);
  const rocks: Array<{ x: number; z: number }> = [];
  // The near one first, so there's always something easy to hit.
  rocks.push({ x: (rand() - 0.5) * 3, z: ROCK_AREA.maxZ - rand() * 0.8 });
  for (let tries = 0; rocks.length < want && tries < 400; tries++) {
    const p = { x: ROCK_AREA.minX + rand() * (ROCK_AREA.maxX - ROCK_AREA.minX), z: ROCK_AREA.minZ + rand() * (ROCK_AREA.maxZ - ROCK_AREA.minZ) };
    if (rocks.every((r) => Math.hypot(r.x - p.x, r.z - p.z) >= ROCK_SPACING)) rocks.push(p);
  }
  return rocks;
}
