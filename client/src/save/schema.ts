import type { CreatureInstance } from "@shared";

export interface SaveData {
  version: 1;
  player: { id: string; navn: string; avatarId: string; farve: string };
  creatures: CreatureInstance[];
  /** Species ids seen (wild or caught) vs. only ids actually caught, for Monsterbogen */
  seenSpeciesIds: string[];
  /** How many times each species has been caught in the wild (not starters or trades); "in possession" is counted from `creatures`. */
  caughtCounts: Record<string, number>;
  position: { areaId: string; x: number; y: number };
  createdAt: string;
  updatedAt: string;
}
