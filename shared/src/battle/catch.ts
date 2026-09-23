import type { CreatureInstance, CreatureSpecies } from "../types/creature.js";
import type { Rng } from "./rng.js";

/**
 * Lower HP makes the catch easier. species.catchRate scales the whole curve;
 * the result is clamped so nothing is ever a guaranteed catch or a hopeless one.
 */
export function attemptCatch(target: CreatureInstance, species: CreatureSpecies, rng: Rng): boolean {
  const hpFraction = Math.max(0, Math.min(1, target.currentHp / species.baseStats.hp));
  const rawChance = species.catchRate * (1.5 - hpFraction);
  const chance = Math.max(0.05, Math.min(0.95, rawChance));
  return rng.next() < chance;
}
