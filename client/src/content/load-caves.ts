import type { CaveConfig } from "@shared";
import config from "../../../shared/content/caves.json";

/** What lives in the caves (shared/content/caves.json) — the server plans visits from the same file. */
export const caveConfig = config as CaveConfig;

/** True for a monster that lives in the caves (the monster book shows a cave icon for it). */
export function livesInCaves(speciesId: string): boolean {
  return caveConfig.species.some((s) => s.speciesId === speciesId && s.weight > 0);
}
