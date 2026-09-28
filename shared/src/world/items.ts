import type { ItemEffect } from "../types/battle.js";

/**
 * Potions and other things to find on the map and use in battles (shared/content/items.json):
 * a strength potion (harder moves), a feather (moves that never miss), a lucky clover (one
 * double-strong move), a healing potion. They lie about each map in spots that change every
 * day — the same for everyone on the same day, so a family can hunt together — and each is
 * picked up once per day per device. Pure rules; the device keeps what it carries.
 */

export interface ItemDef {
  id: string;
  navn: string;
  /** A drawn icon (gfx/icon-art.ts). */
  icon: string;
  weight: number;
  effect: ItemEffect;
}

export interface ItemConfig {
  /** One item on a map per this many open tiles. */
  tilesPerItem: number;
  /** How many of one kind a player can carry. */
  maxCarried: number;
  items: ItemDef[];
  /** Hearts a won wild battle drops round you: each heals `heal` of the monster's HP, at most `max`, gone after `seconds`. */
  winHeals?: { heal: number; max: number; seconds: number };
}

export interface ItemSpot {
  /** Unique for the day and the map: taking it is remembered by this. */
  key: string;
  itemId: string;
  x: number;
  y: number;
}

function seeded(text: string): () => number {
  let a = 2166136261;
  for (const ch of text) a = Math.imul(a ^ ch.codePointAt(0)!, 16777619) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Today's items on a map: `open` are the tiles they may lie on (open ground, paths), `day` e.g. "2026-09-27". */
export function itemSpots(config: ItemConfig, areaId: string, day: string, open: ReadonlyArray<{ x: number; y: number }>): ItemSpot[] {
  if (open.length === 0 || config.items.length === 0) return [];
  const rand = seeded(`${areaId}:${day}`);
  const count = Math.max(2, Math.round(open.length / Math.max(1, config.tilesPerItem)));
  const total = config.items.reduce((s, i) => s + Math.max(0, i.weight), 0);
  const taken = new Set<number>();
  const spots: ItemSpot[] = [];
  for (let n = 0; n < count && taken.size < open.length; n++) {
    let i = Math.floor(rand() * open.length);
    while (taken.has(i)) i = (i + 1) % open.length;
    taken.add(i);
    let r = rand() * total;
    const item = config.items.find((it) => (r -= Math.max(0, it.weight)) < 0) ?? config.items[0]!;
    spots.push({ key: `${areaId}:${day}:${n}`, itemId: item.id, x: open[i]!.x, y: open[i]!.y });
  }
  return spots;
}

/** Today's egg on a map (one a day), on an open tile, or undefined for a map with none. */
export function eggSpot(areaId: string, day: string, open: ReadonlyArray<{ x: number; y: number }>): { key: string; x: number; y: number } | undefined {
  if (open.length === 0) return undefined;
  const rand = seeded(`${areaId}:${day}:egg`);
  const tile = open[Math.floor(rand() * open.length)]!;
  return { key: `${areaId}:${day}:egg`, x: tile.x, y: tile.y };
}

/** Picks one up: the new count of that item, or undefined if the bag is full of that kind. */
export function carryItem(config: ItemConfig, carried: Record<string, number>, itemId: string): number | undefined {
  const now = carried[itemId] ?? 0;
  return now >= config.maxCarried ? undefined : now + 1;
}

/** The day in Danish time (items move at midnight there). */
export function itemDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/**
 * How many hearts a won battle leaves on the ground: enough to heal what the fight cost my
 * monster (none if it's unhurt), at most `winHeals.max`.
 */
export function winHealCount(config: ItemConfig, hp: number, maxHp: number): number {
  const heals = config.winHeals;
  if (!heals || maxHp <= 0 || hp >= maxHp) return 0;
  const missing = (maxHp - Math.max(0, hp)) / maxHp;
  return Math.min(heals.max, Math.max(1, Math.ceil(missing / Math.max(0.01, heals.heal) - 1e-9)));
}

/** A heart picked up: my monster's HP after it (never above its full HP). */
export function healFromHeart(config: ItemConfig, hp: number, maxHp: number): number {
  const heal = config.winHeals?.heal ?? 0;
  return Math.min(maxHp, Math.max(0, hp) + Math.max(1, Math.round(maxHp * heal)));
}

/**
 * Where dropped things land round `centre`: free tiles (`ok`) a step or a few away, the
 * nearest first (in a random order among those as near), never on `centre` itself.
 */
export function dropSpots(centre: { x: number; y: number }, count: number, ok: (x: number, y: number) => boolean, rand: () => number, radius = 3): Array<{ x: number; y: number }> {
  const spots: Array<{ x: number; y: number; d: number; r: number }> = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      if (d === 0 || !ok(centre.x + dx, centre.y + dy)) continue;
      spots.push({ x: centre.x + dx, y: centre.y + dy, d, r: rand() });
    }
  }
  // Nearest first; among those as near, spread about.
  spots.sort((a, b) => a.d - b.d || a.r - b.r);
  return spots.slice(0, Math.max(0, count)).map(({ x, y }) => ({ x, y }));
}
