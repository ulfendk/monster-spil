import type { BeastDefinition } from "@shared";
import type { BossLook } from "../gfx/placeholder-sprites";

/** Every visiting beast in shared/content/beasts/*.json, picked up at build time (adding one needs no code change). */
const modules = import.meta.glob<BeastDefinition>("../../../shared/content/beasts/*.json", { eager: true, import: "default" });

export const beastsById: Record<string, BeastDefinition> = Object.fromEntries(Object.values(modules).map((b) => [b.id, b]));

/** What a beast (and the baby it gives) looks like until it has real art: sand beasts are serpents, forest ones eagles. */
export function beastLook(beast: BeastDefinition): BossLook {
  return beast.habitat === "sand" ? "serpent" : "eagle";
}

/** The beast whose baby this species is, if any (the monster book shows its icon instead of a hint). */
export function beastForBaby(speciesId: string): BeastDefinition | undefined {
  return Object.values(beastsById).find((b) => b.rewardSpeciesId === speciesId);
}
