import { baseTile, inside, setTile, tileKey, tileNow, walkableNow, type AreaTerrain, type BaseArea } from "./terrain.js";

/**
 * Working the land with the minigames: cutting a tree down opens a path (its stump grows
 * back into a tree), digging a hole finds something (the hole fills in again), swimming
 * across water and climbing over a mountain take you to the other side. Pure rules; the
 * server applies cuts and holes to the shared terrain (everyone sees them, and they heal
 * like disaster changes), the device runs the minigames and keeps what it finds. The
 * numbers are content: shared/content/minigames.json.
 */

export interface DigReward {
  kind: "food" | "monster" | "gem" | "nothing";
  weight: number;
  /** For a gem: how much XP it's worth. */
  xp?: number;
}

export interface MinigameConfig {
  cut: { regrowHours: number };
  /** `sandMonsters` hide in sand instead of `monsters` (optional: without it, sand has the same ones). */
  dig: { healHours: number; rewards: DigReward[]; monsters: Array<{ speciesId: string; weight: number }>; sandMonsters?: Array<{ speciesId: string; weight: number }> };
  swim: { maxTiles: number };
  climb: { maxTiles: number };
}

export type WorkKind = "cut" | "dig";

/** A tree that can be felled: a tree now (not the map's border, not a protected tile). */
export function canCut(base: BaseArea, terrain: AreaTerrain, x: number, y: number): boolean {
  if (base.tiles.stump === undefined || !inside(base, x, y) || onBorder(base, x, y) || isFixed(base, x, y)) return false;
  return tileNow(base, terrain, x, y).ground === base.tiles.tree;
}

/** Ground that can be dug: plain open ground or sand, no tall grass, not dug or changed already. */
export function canDig(base: BaseArea, terrain: AreaTerrain, x: number, y: number): boolean {
  if (base.tiles.hole === undefined || !inside(base, x, y) || terrain.overrides[tileKey(x, y)]) return false;
  const t = baseTile(base, x, y);
  return !t.grass && (t.ground === base.tiles.ground || (base.tiles.sand !== undefined && t.ground === base.tiles.sand));
}

/** Fells the tree: a stump for `regrowHours`, then a tree again (mutates `terrain`). */
export function applyCut(base: BaseArea, terrain: AreaTerrain, x: number, y: number, now: Date, config: MinigameConfig): void {
  const until = new Date(now.getTime() + config.cut.regrowHours * 3_600_000).toISOString();
  setTile(base, terrain, tileKey(x, y), { ground: base.tiles.stump!, grass: 0 }, until);
}

/** Digs a hole that fills in again after `healHours` (mutates `terrain`). */
export function applyDig(base: BaseArea, terrain: AreaTerrain, x: number, y: number, now: Date, config: MinigameConfig): void {
  const until = new Date(now.getTime() + config.dig.healHours * 3_600_000).toISOString();
  setTile(base, terrain, tileKey(x, y), { ground: base.tiles.hole!, grass: 0 }, until);
}

function onBorder(base: BaseArea, x: number, y: number): boolean {
  return x === 0 || y === 0 || x === base.width - 1 || y === base.height - 1;
}

function isFixed(base: BaseArea, x: number, y: number): boolean {
  return base.fixed.some((f) => f.x === x && f.y === y);
}

/**
 * Where you come out when you swim across water or climb over a mountain, heading from
 * `from` towards `toward` (a tile next to you): straight on over tiles of that kind, onto
 * the first walkable tile beyond. Undefined if it's too far, or something else (a tree,
 * the map's edge) is in the way.
 */
export function crossTarget(
  base: BaseArea,
  terrain: AreaTerrain,
  from: { x: number; y: number },
  toward: { x: number; y: number },
  kind: "swim" | "climb",
  config: MinigameConfig
): { x: number; y: number; tiles: number } | undefined {
  const dx = Math.sign(toward.x - from.x);
  const dy = Math.sign(toward.y - from.y);
  if (!dx && !dy) return undefined;
  const over = kind === "swim" ? base.tiles.water : base.tiles.mountain;
  const max = kind === "swim" ? config.swim.maxTiles : config.climb.maxTiles;
  let x = from.x + dx;
  let y = from.y + dy;
  let tiles = 0;
  while (inside(base, x, y) && !onBorder(base, x, y) && tileNow(base, terrain, x, y).ground === over) {
    tiles++;
    if (tiles > max) return undefined;
    x += dx;
    y += dy;
  }
  if (tiles === 0 || !inside(base, x, y) || !walkableNow(base, terrain, x, y)) return undefined;
  return { x, y, tiles };
}

/** What a hole turns up, by weight. */
export function pickDigReward(config: MinigameConfig, rand: () => number): DigReward {
  return byWeight(config.dig.rewards, rand) ?? { kind: "nothing", weight: 1 };
}

/** Which monster was hiding in the hole, by weight (sand has its own, if the config lists them). */
export function pickDigMonster(config: MinigameConfig, rand: () => number, onSand = false): string | undefined {
  return byWeight((onSand && config.dig.sandMonsters) || config.dig.monsters, rand)?.speciesId;
}

function byWeight<T extends { weight: number }>(items: readonly T[], rand: () => number): T | undefined {
  const total = items.reduce((sum, i) => sum + Math.max(0, i.weight), 0);
  if (total <= 0) return undefined;
  let r = rand() * total;
  return items.find((i) => (r -= Math.max(0, i.weight)) < 0) ?? items.filter((i) => i.weight > 0).at(-1);
}

