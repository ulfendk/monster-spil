import type { TypeId } from "./creature.js";

/**
 * 5-way single-cycle rock-paper-scissors: each type beats exactly one other
 * and loses to exactly one other. Adding a 6th type later only needs one new
 * entry here, plus one edge pointing into the existing cycle.
 */
export const TYPE_ADVANTAGE: Record<TypeId, TypeId> = {
  ild: "graes",
  graes: "lyn",
  lyn: "vand",
  vand: "sten",
  sten: "ild",
};

export function getMultiplier(attacker: TypeId, defender: TypeId): number {
  if (TYPE_ADVANTAGE[attacker] === defender) return 1.5;
  if (TYPE_ADVANTAGE[defender] === attacker) return 0.5;
  return 1;
}
