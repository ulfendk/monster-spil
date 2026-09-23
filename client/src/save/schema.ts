import type { CreatureInstance } from "@shared";

export interface SaveData {
  version: 1;
  player: { id: string; navn: string; avatarId: string; farve: string };
  creatures: CreatureInstance[];
  /** Species ids seen (wild or caught) vs. only ids actually caught, for Monsterbogen */
  seenSpeciesIds: string[];
  position: { areaId: string; x: number; y: number };
  createdAt: string;
  updatedAt: string;
}
