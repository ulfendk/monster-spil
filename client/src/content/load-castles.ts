import type { CastleConfig, CastleDef, CastleProgress } from "@shared";
import type { SaveData } from "../save/schema";
import config from "../../../shared/content/castles.json";

/** The castles, one per world: the quest for the key, the guardians, the treasure (shared/content/castles.json). */
export const castleConfig = config as unknown as CastleConfig;

export const castleFor = (worldId: string): CastleDef | undefined => castleConfig.castles.find((c) => c.worldId === worldId);

/** This player's progress at a world's castle (made on first use). */
export function castleProgress(save: SaveData, worldId: string): CastleProgress {
  const castles = (save.castles ??= {});
  return (castles[worldId] ??= { found: [], beaten: 0 });
}
