import type { CreatureInstance, CreatureSpecies } from "../types/creature.js";

type BaseStats = CreatureSpecies["baseStats"];

/**
 * Monsters evolve through 1–3 stages: each species names its later stages (`evolutions` in its
 * JSON; none = it doesn't evolve). A monster grows a bond with its player — petting it,
 * playing with it and feeding it (a little each day), and winning battles together — and when
 * the bond is strong enough it can evolve: a new name, stronger in every way, and it looks
 * grander. Pure rules (shared/content/nurture.json has the numbers); the device keeps the
 * monsters in its save.
 */

export interface NurtureConfig {
  /** The bond needed to evolve to stage 2, 3, … */
  bondToEvolve: number[];
  /** Every stage above the first adds this share to all its stats. */
  statBonusPerStage: number;
  pet: { bond: number; perDay: number };
  play: { bond: number; perDay: number };
  feed: { bond: number };
  battleWin: { bond: number };
}

export type CareKind = "pet" | "play" | "feed";

/** How many stages this species has (1 when it doesn't evolve). */
export function stageCount(species: Pick<CreatureSpecies, "evolutions">): number {
  return 1 + Math.min(2, species.evolutions?.length ?? 0);
}

export function stageOf(instance: Pick<CreatureInstance, "stage">, species: Pick<CreatureSpecies, "evolutions">): number {
  return Math.max(1, Math.min(stageCount(species), Math.round(instance.stage ?? 1)));
}

/** The name of a stage: the species' own at stage 1, then its evolutions' names. */
export function stageName(species: Pick<CreatureSpecies, "navn" | "evolutions">, stage: number): string {
  return stage <= 1 ? species.navn : (species.evolutions?.[Math.min(stage, 3) - 2] ?? species.navn);
}

/** Its stats at a stage: every stage above the first makes it stronger all round. */
export function stageStats(stats: BaseStats, stage: number, config: NurtureConfig): BaseStats {
  const k = 1 + config.statBonusPerStage * (Math.max(1, stage) - 1);
  return { hp: Math.round(stats.hp * k), angreb: Math.round(stats.angreb * k), forsvar: Math.round(stats.forsvar * k), fart: Math.round(stats.fart * k) };
}

/** The bond it needs for its next stage (undefined at its last stage). */
export function bondForNext(instance: CreatureInstance, species: CreatureSpecies, config: NurtureConfig): number | undefined {
  const stage = stageOf(instance, species);
  return stage < stageCount(species) ? (config.bondToEvolve[stage - 1] ?? Infinity) : undefined;
}

export function canEvolve(instance: CreatureInstance, species: CreatureSpecies, config: NurtureConfig): boolean {
  const need = bondForNext(instance, species, config);
  return need !== undefined && (instance.bond ?? 0) >= need;
}

/** It evolves: the next stage (and full health at its new strength). */
export function evolve(instance: CreatureInstance, species: CreatureSpecies, config: NurtureConfig): CreatureInstance {
  if (!canEvolve(instance, species, config)) return instance;
  const stage = stageOf(instance, species) + 1;
  return { ...instance, stage, currentHp: stageStats(species.baseStats, stage, config).hp };
}

/**
 * Caring for it: petting and playing (a few times a day each) and feeding (whenever there's
 * food) grow the bond. Returns the monster after it, or why not ("tired" = enough for today).
 */
export function care(instance: CreatureInstance, kind: CareKind, day: string, config: NurtureConfig): { instance: CreatureInstance; ok: true } | { ok: false; reason: "tired" } {
  const today = instance.care?.day === day ? instance.care : { day, pet: 0, play: 0 };
  if (kind !== "feed" && today[kind] >= config[kind].perDay) return { ok: false, reason: "tired" };
  const next: CreatureInstance = {
    ...instance,
    bond: (instance.bond ?? 0) + config[kind].bond,
    care: kind === "feed" ? today : { ...today, [kind]: today[kind] + 1 },
  };
  return { instance: next, ok: true };
}

/** A battle won together. */
export function bondFromWin(instance: CreatureInstance, config: NurtureConfig): CreatureInstance {
  return { ...instance, bond: (instance.bond ?? 0) + config.battleWin.bond };
}
