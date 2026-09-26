/**
 * The map as it is now: the area's base map (the Tiled file) plus the changes natural
 * disasters have made. Pure functions over plain data, shared by the server (which
 * decides and stores the changes) and the client (which draws them).
 *
 * A change is an override of one tile. Soft changes (burnt grass, floodwater, fallen
 * trees, fissures) carry `until` and heal back — to the base tile, or to the hard change
 * that was there before (`after`). Hard changes (craters, raised mountains, rubble
 * passes, the UFO wreck) stay until another disaster changes that tile again.
 */

/** What stands on one tile: the ground layer's tile id and the tall-grass layer's (0 = none). */
export interface TileState {
  ground: number;
  grass: number;
}

export interface TileOverride extends TileState {
  /** Soft changes heal at this time (ISO). Hard changes have no `until`. */
  until?: string;
  /** What a soft change heals back to, when it was laid over a hard change. */
  after?: TileState;
}

/** The tile ids of the area's tileset that disasters use (from the area's `.meta.json`). */
export interface TerrainTileIds {
  ground: number;
  tree: number;
  grass: number;
  water: number;
  path: number;
  mountain: number;
  burnt: number;
  crater: number;
  flood: number;
  log: number;
  crack: number;
  rubble: number;
  wreck: number;
  /** Dunes and beaches, where sand serpents rise (beasts.ts); a map without it has no serpents. */
  sand?: number;
  /** A felled tree's stump (walkable; grows back into a tree) and a dug hole (walkable; fills in) — work.ts. */
  stump?: number;
  hole?: number;
}

/** An area's base map, as the disaster rules need it. */
export interface BaseArea {
  id: string;
  width: number;
  height: number;
  /** Ground layer tile ids, row by row. */
  ground: number[];
  /** Tall-grass layer tile ids (0 = none), row by row. */
  grass: number[];
  /** Ground tile ids that block walking. */
  blocking: number[];
  tiles: TerrainTileIds;
  start: { x: number; y: number };
  /** Tiles that must never change (a dragon's lair, say). */
  fixed: Array<{ x: number; y: number }>;
}

/** A place where a disaster left rare monsters for a while. */
export interface EventZone {
  id: string;
  kind: string;
  speciesId: string;
  /** Chance per step on one of its tiles. */
  rate: number;
  tiles: string[];
  until: string;
}

/** A single monster waiting on the map (the UFO's alien). The first one to claim it may try to catch it. */
export interface WorldSpawn {
  id: string;
  kind: string;
  speciesId: string;
  x: number;
  y: number;
  until: string;
  /** Who is battling it right now, and until when that claim holds. */
  claimedBy?: string;
  claimedUntil?: string;
}

/** Everything that changed in one area. Plain JSON: stored on the server, sent to clients. */
export interface AreaTerrain {
  overrides: Record<string, TileOverride>;
  zones: EventZone[];
  spawns: WorldSpawn[];
}

export const tileKey = (x: number, y: number): string => `${x},${y}`;
export function fromKey(key: string): { x: number; y: number } {
  const [x, y] = key.split(",").map(Number);
  return { x: x!, y: y! };
}

export const emptyTerrain = (): AreaTerrain => ({ overrides: {}, zones: [], spawns: [] });

export function inside(base: BaseArea, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < base.width && y < base.height;
}

export function baseTile(base: BaseArea, x: number, y: number): TileState {
  const i = y * base.width + x;
  return { ground: base.ground[i] ?? 0, grass: base.grass[i] ?? 0 };
}

/** The tile as it is now: the latest change, or the base map. */
export function tileNow(base: BaseArea, terrain: AreaTerrain, x: number, y: number): TileState {
  const o = terrain.overrides[tileKey(x, y)];
  return o ? { ground: o.ground, grass: o.grass } : baseTile(base, x, y);
}

export function blocks(base: BaseArea, state: TileState): boolean {
  return state.ground === 0 || base.blocking.includes(state.ground);
}

export function walkableNow(base: BaseArea, terrain: AreaTerrain, x: number, y: number): boolean {
  return inside(base, x, y) && !blocks(base, tileNow(base, terrain, x, y));
}

/**
 * True if every walkable tile can still be reached from the start when `blocked` tiles
 * are also treated as blocking — i.e. a change never cuts part of the map off, so no
 * one can be stranded or spawn in a pocket.
 */
export function staysConnected(base: BaseArea, isWalkable: (x: number, y: number) => boolean, blocked: Set<string>): boolean {
  // Asks about each tile once, then searches over plain indexes: this runs for every tile a
  // disaster wants to change, so it has to stay quick on a big map.
  const { width: w, height: h } = base;
  const open = new Uint8Array(w * h);
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isWalkable(x, y)) {
        open[y * w + x] = 1;
        total++;
      }
    }
  }
  for (const key of blocked) {
    const { x, y } = fromKey(key);
    if (inside(base, x, y) && open[y * w + x]) {
      open[y * w + x] = 0;
      total--;
    }
  }
  const { x: sx, y: sy } = base.start;
  if (!inside(base, sx, sy) || !open[sy * w + sx]) return false;
  open[sy * w + sx] = 2; // 2 = reached
  let reached = 1;
  const queue = [sy * w + sx];
  while (queue.length) {
    const i = queue.pop()!;
    const x = i % w;
    for (const n of [x + 1 < w ? i + 1 : -1, x > 0 ? i - 1 : -1, i + w < w * h ? i + w : -1, i - w]) {
      if (n >= 0 && open[n] === 1) {
        open[n] = 2;
        reached++;
        queue.push(n);
      }
    }
  }
  return reached === total;
}

const same = (a: TileState, b: TileState) => a.ground === b.ground && a.grass === b.grass;

/**
 * Lays one change over the terrain (mutates `terrain`). A soft change remembers the hard
 * state under it; a hard change replaces everything, and a hard change back to the base
 * tile simply removes the override.
 */
export function setTile(base: BaseArea, terrain: AreaTerrain, key: string, state: TileState, until: string | undefined): void {
  const { x, y } = fromKey(key);
  const old = terrain.overrides[key];
  const hardUnder: TileState | undefined = old ? (old.until ? old.after : { ground: old.ground, grass: old.grass }) : undefined;
  if (until) {
    terrain.overrides[key] = { ...state, until, ...(hardUnder ? { after: hardUnder } : {}) };
  } else if (same(state, baseTile(base, x, y))) {
    delete terrain.overrides[key];
  } else {
    terrain.overrides[key] = { ...state };
  }
}

/**
 * Heals what is due by `now`: soft changes go back to what was under them, and zones and
 * spawns run out. A heal that would block a tile and cut the map in two (a tree growing
 * back where the only way through now is) keeps that tile walkable for good instead; one
 * where someone stands (`occupied`, tile keys) waits until they have stepped off.
 * Returns whether anything changed.
 */
export function healTerrain(base: BaseArea, terrain: AreaTerrain, now: Date, occupied: ReadonlySet<string> = new Set()): boolean {
  const t = now.getTime();
  let changed = false;
  for (const [key, o] of Object.entries(terrain.overrides)) {
    if (!o.until || Date.parse(o.until) > t) continue;
    const { x, y } = fromKey(key);
    const back = o.after ?? baseTile(base, x, y);
    // Never grow a tree (or anything blocking) under someone's feet: try again later.
    if (blocks(base, back) && occupied.has(key)) continue;
    changed = true;
    if (blocks(base, back)) {
      const blocked = new Set([key]);
      if (!staysConnected(base, (bx, by) => walkableNow(base, terrain, bx, by), blocked)) {
        // Stays as it is, but no longer heals.
        terrain.overrides[key] = { ground: o.ground, grass: o.grass };
        continue;
      }
    }
    if (o.after && !same(o.after, baseTile(base, x, y))) terrain.overrides[key] = { ...o.after };
    else delete terrain.overrides[key];
  }
  const zones = terrain.zones.filter((z) => Date.parse(z.until) > t);
  const spawns = terrain.spawns.filter((s) => Date.parse(s.until) > t);
  if (zones.length !== terrain.zones.length || spawns.length !== terrain.spawns.length) changed = true;
  terrain.zones = zones;
  terrain.spawns = spawns;
  return changed;
}

/** Heals every soft change at once (the admin portal's "heal the map"); hard changes stay. */
export function healAllNow(base: BaseArea, terrain: AreaTerrain, now: Date): void {
  for (const o of Object.values(terrain.overrides)) if (o.until) o.until = new Date(now.getTime() - 1).toISOString();
  healTerrain(base, terrain, now);
}

/** The zone (rare monsters) on a tile, if any. */
export function zoneAt(terrain: AreaTerrain, x: number, y: number): EventZone | undefined {
  const k = tileKey(x, y);
  return terrain.zones.find((z) => z.tiles.includes(k));
}
