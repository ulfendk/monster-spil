import type { MinigameConfig } from "@shared";
import config from "../../../shared/content/minigames.json";

/** How the minigames work (shared/content/minigames.json) — the server reads the same file. */
export const minigameConfig = config as MinigameConfig;

/** Whether a monster can be dug up with the shovel (in the ground or in the sand). */
export function livesUnderground(speciesId: string): boolean {
  return [...minigameConfig.dig.monsters, ...(minigameConfig.dig.sandMonsters ?? [])].some((m) => m.speciesId === speciesId && m.weight > 0);
}
