/**
 * Passing out and food. When your monster faints you can't move for a while; how
 * long depends on how close you came to winning. Food collected on the map (kept in
 * a bag) shortens the wait. Pure functions over plain data, shared by the client
 * (which enforces the wait on the device) and the server (which places the food).
 */

export const PASS_OUT_MIN_S = 30;
export const PASS_OUT_MAX_S = 60;
/** Seconds one piece of food takes off the wait. */
export const FOOD_SECONDS = 15;
export const BAG_MAX = 5;
/** The kinds of food that grow on the map; all worth the same. */
export const FOOD_KINDS = ["🍎", "🍓", "🍌", "🥕", "🍇"] as const;
export type FoodKind = (typeof FOOD_KINDS)[number];

/**
 * How long you are out, from how close you came (0 = knocked out without a scratch
 * on the opponent, 1 = it was nearly over for them too): 60 s down to 30 s.
 */
export function passOutSeconds(closeness: number): number {
  const c = Math.min(1, Math.max(0, Number.isFinite(closeness) ? closeness : 0));
  return Math.round(PASS_OUT_MAX_S - (PASS_OUT_MAX_S - PASS_OUT_MIN_S) * c);
}

/** Wild battles and duels: how much of the opponent's HP you took (0 if it was untouched). */
export function closenessFromFoe(foeHp: number, foeMaxHp: number): number {
  return foeMaxHp > 0 ? 1 - Math.max(0, foeHp) / foeMaxHp : 0;
}

/**
 * The dragon never gets near zero in one fight, so there it's the damage you dealt
 * compared with your own monster's HP: dealing as much as you could take is a great fight.
 */
export function closenessFromDamage(dealt: number, myMaxHp: number): number {
  return myMaxHp > 0 ? Math.max(0, dealt) / myMaxHp : 0;
}

/** When the wait ends, as an ISO timestamp, for a faint at `now`. */
export function passOutUntil(now: Date, closeness: number): string {
  return new Date(now.getTime() + passOutSeconds(closeness) * 1000).toISOString();
}

/** Seconds still to wait (0 = free to move). */
export function secondsLeft(until: string | undefined, now: Date): number {
  if (!until) return 0;
  const left = (Date.parse(until) - now.getTime()) / 1000;
  return Number.isFinite(left) ? Math.max(0, Math.ceil(left)) : 0;
}

/** Eating one piece of food: FOOD_SECONDS off the wait (never below now). */
export function eatFood(until: string, now: Date): string | undefined {
  const next = Date.parse(until) - FOOD_SECONDS * 1000;
  return next <= now.getTime() ? undefined : new Date(next).toISOString();
}

/** A piece of food lying on the map. */
export interface FoodItem {
  id: string;
  areaId: string;
  x: number;
  y: number;
  kind: FoodKind;
}

/**
 * Picks where new food grows: a random free spot (not already holding food, not a
 * blocked tile) from `spots`, using an injected random function so the server's
 * placement is testable. Undefined when every spot is taken.
 */
export function pickFoodSpot(spots: ReadonlyArray<{ x: number; y: number }>, taken: ReadonlyArray<{ x: number; y: number }>, random: () => number): { x: number; y: number } | undefined {
  const used = new Set(taken.map((t) => `${t.x},${t.y}`));
  const free = spots.filter((s) => !used.has(`${s.x},${s.y}`));
  if (free.length === 0) return undefined;
  return free[Math.floor(random() * free.length)];
}

export function pickFoodKind(random: () => number): FoodKind {
  return FOOD_KINDS[Math.floor(random() * FOOD_KINDS.length)]!;
}
