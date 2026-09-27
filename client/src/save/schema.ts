import type { CreatureInstance, Egg, FoodKind, Progress } from "@shared";

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
  /** Monster eggs in the nest, hatching as I walk (shared/src/creature/eggs.ts). */
  eggs?: Egg[];
  /** Potions and other items carried (item id → how many), to use in battles. */
  items?: Record<string, number>;
  /** Items picked up today (so each lies there only once a day for this player): the day, and their keys. */
  itemsTaken?: { day: string; keys: string[] };
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
