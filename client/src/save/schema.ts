import type { CreatureInstance, FoodKind, Progress } from "@shared";

export interface SaveData {
  version: 1;
  player: { id: string; navn: string; avatarId: string; farve: string };
  creatures: CreatureInstance[];
  /** Species ids seen (wild or caught) vs. only ids actually caught, for Monsterbogen */
  seenSpeciesIds: string[];
  /** How many times each species has been caught in the wild (not starters or trades); "in possession" is counted from `creatures`. */
  caughtCounts: Record<string, number>;
  /** Catches not yet counted by the family server's scoreboard (made offline, or not yet acknowledged). */
  pendingScore: Array<{ id: string; kind: "catch"; at: string }>;
  /** Food collected on the map (at most BAG_MAX), eaten to recover faster after passing out. */
  bag: FoodKind[];
  /** While set and in the future, the player has passed out and can't move (ISO timestamp). */
  passedOutUntil?: string;
  position: { areaId: string; x: number; y: number };
  /** XP, counters and badges (player levels). Older saves get it filled in on load, with credit for what they caught. */
  progress?: Progress;
  createdAt: string;
  updatedAt: string;
}
