import type { TypeId } from "../types/creature.js";

/**
 * Monster eggs: found now and then (digging, and one a day on each map), kept in a nest of a
 * few, and hatched by walking — each step counts. The egg's colour tells its type; which
 * monster is inside (and whether it's a rare variant) is decided when it's found but only shown
 * when it hatches. The pools per type are content (shared/content/eggs.json). Pure rules; the
 * device keeps the eggs in its save.
 */

export interface EggConfig {
  stepsToHatch: number;
  nestSize: number;
  /** The chance a hatchling is a rare variant (higher than in the wild: an egg is special). */
  variantChance: number;
  /** How often digging turns up an egg, next to the other rewards' weights. */
  digWeight: number;
  pools: Record<TypeId, string[]>;
}

export interface Egg {
  id: string;
  type: TypeId;
  speciesId: string;
  variant?: string;
  stepsLeft: number;
  foundAt: string;
}

const TYPES: TypeId[] = ["ild", "vand", "graes", "lyn", "sten"];

/** A new egg: a random type, a monster of that type from its pool, maybe a variant (`pickVariant` rolls one). */
export function newEgg(config: EggConfig, id: string, now: Date, rand: () => number, pickVariant: () => string | undefined): Egg {
  const types = TYPES.filter((t) => (config.pools[t] ?? []).length > 0);
  const type = types[Math.floor(rand() * types.length)] ?? "ild";
  const pool = config.pools[type]!;
  const speciesId = pool[Math.floor(rand() * pool.length)]!;
  const variant = rand() < config.variantChance ? pickVariant() : undefined;
  return { id, type, speciesId, ...(variant ? { variant } : {}), stepsLeft: config.stepsToHatch, foundAt: now.toISOString() };
}

/** Whether the nest has room for another egg. */
export function nestHasRoom(config: EggConfig, eggs: readonly Egg[]): boolean {
  return eggs.length < config.nestSize;
}

/** Steps walked: every egg comes closer to hatching. Returns the eggs still waiting and those that hatch now. */
export function walkEggs(eggs: readonly Egg[], steps: number): { waiting: Egg[]; hatched: Egg[] } {
  const waiting: Egg[] = [];
  const hatched: Egg[] = [];
  for (const egg of eggs) {
    const next = { ...egg, stepsLeft: Math.max(0, egg.stepsLeft - Math.max(0, steps)) };
    (next.stepsLeft === 0 ? hatched : waiting).push(next);
  }
  return { waiting, hatched };
}

/** How far along an egg is (0 = just found, 1 = hatching), for its cracks and wobble. */
export function eggProgress(config: EggConfig, egg: Egg): number {
  return 1 - egg.stepsLeft / Math.max(1, config.stepsToHatch);
}
