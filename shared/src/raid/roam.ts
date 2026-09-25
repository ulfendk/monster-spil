import type { WorldPosition } from "../world/adjacency.js";
import { inside, staysConnected, tileKey, tileNow, walkableNow, type AreaTerrain, type BaseArea } from "../world/terrain.js";

/**
 * A roaming dragon: now and then it flies to a new perch instead of always waiting in
 * the same spot. Pure rules with an injected random source; the server keeps time and
 * state (server/src/dragon-roam.ts), the parent sets the pace in the admin portal.
 */
export interface RoamSettings {
  enabled: boolean;
  /** Average minutes between flights. */
  meanMinutes: number;
  /** 0 = exactly every meanMinutes, 1 = anywhere from 0 to twice that. */
  randomness: number;
}

export const DEFAULT_ROAM_SETTINGS: RoamSettings = { enabled: true, meanMinutes: 360, randomness: 0.5 };
export const MIN_ROAM_GAP_MINUTES = 5;
export const MAX_ROAM_GAP_MINUTES = 7 * 24 * 60;

/** Settings from the admin portal, checked field by field (anything odd keeps the old value). */
export function cleanRoamSettings(raw: unknown, old: RoamSettings): RoamSettings {
  const r = (raw ?? {}) as Partial<RoamSettings>;
  const num = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : old.enabled,
    meanMinutes: Math.round(num(r.meanMinutes, MIN_ROAM_GAP_MINUTES, MAX_ROAM_GAP_MINUTES, old.meanMinutes)),
    randomness: num(r.randomness, 0, 1, old.randomness),
  };
}

/** When the dragon flies next: the average gap, spread by the randomness either way. */
export function nextRoamAt(now: Date, settings: RoamSettings, rand: () => number): Date {
  const spread = 1 + settings.randomness * (2 * rand() - 1);
  const minutes = Math.max(MIN_ROAM_GAP_MINUTES, settings.meanMinutes * spread);
  return new Date(now.getTime() + minutes * 60_000);
}

export interface LairOptions {
  /** Where it sits now; the new perch is a good way off. */
  current?: WorldPosition;
  /** Tiles players stand on (never the new perch). */
  occupied?: Array<{ x: number; y: number }>;
  rand: () => number;
  /** How far away (tiles) the new perch should be at least; relaxed if nothing fits. */
  minFromCurrent?: number;
}

const MIN_FROM_START = 8;
const MARGIN = 3;
/** Of its 8 neighbours at least this many are walkable: room for a team to stand around it. */
const MIN_FREE_NEIGHBOURS = 7;
/** Tiles tried for connectivity per pass (each check walks the whole map). */
const TRIES = 25;

/**
 * Picks a new perch: plain open ground (no path, tall grass, water or trees), with room
 * around it, away from where new players appear and from where the dragon is now, not on
 * a player or a waiting monster — and never one that would cut the map in two. Undefined if
 * the map has no such place.
 */
export function chooseLair(base: BaseArea, terrain: AreaTerrain, opts: LairOptions): { x: number; y: number } | undefined {
  const spawns = new Set(terrain.spawns.map((s) => tileKey(s.x, s.y)));
  const occupied = new Set((opts.occupied ?? []).map((p) => tileKey(p.x, p.y)));
  const candidates: Array<{ x: number; y: number }> = [];
  for (let y = MARGIN; y < base.height - MARGIN; y++) {
    for (let x = MARGIN; x < base.width - MARGIN; x++) {
      const s = tileNow(base, terrain, x, y);
      if (s.ground !== base.tiles.ground || s.grass) continue;
      const key = tileKey(x, y);
      if (occupied.has(key) || spawns.has(key)) continue;
      if (Math.hypot(x - base.start.x, y - base.start.y) < MIN_FROM_START) continue;
      let free = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && inside(base, x + dx, y + dy) && walkableNow(base, terrain, x + dx, y + dy)) free++;
      if (free >= MIN_FREE_NEIGHBOURS) candidates.push({ x, y });
    }
  }
  const from = opts.current;
  const first = opts.minFromCurrent ?? 12;
  for (const minDistance of [first, Math.min(first, 4), 0]) {
    const far = candidates.filter((c) => !from || from.areaId !== base.id || Math.hypot(c.x - from.x, c.y - from.y) >= minDistance);
    // Fisher–Yates, so every fitting spot is equally likely.
    for (let i = far.length - 1; i > 0; i--) {
      const j = Math.floor(opts.rand() * (i + 1));
      [far[i], far[j]] = [far[j]!, far[i]!];
    }
    for (const c of far.slice(0, TRIES)) {
      if (staysConnected(base, (x, y) => walkableNow(base, terrain, x, y), new Set([tileKey(c.x, c.y)]))) return c;
    }
  }
  return undefined;
}
