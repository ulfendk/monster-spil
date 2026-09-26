import type { CreatureInstance, CreatureSpecies } from "../types/creature.js";
import type { Rng } from "./rng.js";

/**
 * Lower HP makes the catch easier. species.catchRate scales the whole curve; `bonus`
 * scales it too (a well-aimed 3D throw); the result is clamped so nothing is ever a
 * guaranteed catch or a hopeless one.
 */
export function attemptCatch(target: CreatureInstance, species: CreatureSpecies, rng: Rng, bonus = 1): boolean {
  const hpFraction = Math.max(0, Math.min(1, target.currentHp / species.baseStats.hp));
  const rawChance = species.catchRate * (1.5 - hpFraction) * bonus;
  const chance = Math.max(0.05, Math.min(0.95, rawChance));
  return rng.next() < chance;
}

/**
 * How much a 3D throw's aim helps: 0.8× at the very edge of the monster, 1.2× dead
 * centre. The middle (0.5) is exactly the old catch, so a throw without aim changes nothing.
 */
export function catchBonus(precision: number): number {
  return 0.8 + 0.4 * Math.max(0, Math.min(1, precision));
}
