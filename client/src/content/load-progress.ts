import { levelForXp, type Badge, type LevelConfig, type Progress } from "@shared";
import levels from "../../../shared/content/levels.json";
import badges from "../../../shared/content/badges.json";
import type { SaveData } from "../save/schema";

/** How XP adds up to levels, titles, looks and the monster bonus (shared/content/levels.json). */
export const levelConfig = levels as LevelConfig;
/** Every badge there is (shared/content/badges.json), in the order the badge wall shows them. */
export const badgeList = badges as Badge[];
export const badgesById: Record<string, Badge> = Object.fromEntries(badgeList.map((b) => [b.id, b]));

/** How many species this player has caught (for the "species" badges). */
export function speciesCaught(save: SaveData): number {
  return Object.values(save.caughtCounts).filter((n) => n > 0).length;
}

export function levelOf(progress: Progress | undefined): number {
  return levelForXp(progress?.xp ?? 0, levelConfig);
}

/** What everyone may see: my level and my badges' ids. */
export function profileOf(save: SaveData): { level: number; badges: string[] } {
  return { level: levelOf(save.progress), badges: Object.keys(save.progress?.badges ?? {}) };
}
