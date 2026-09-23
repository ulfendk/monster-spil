export type TypeId = "ild" | "vand" | "graes" | "lyn" | "sten";

export interface StatBlock {
  hp: number;
  angreb: number;
  forsvar: number;
  fart: number;
}

/** Species definition — loaded from JSON, one per species. */
export interface CreatureSpecies {
  id: string;
  navn: string;
  type: TypeId;
  baseStats: StatBlock;
  /** 3-4 move ids, resolved against moves.json */
  moveIds: string[];
  spriteFront: string;
  spriteBack: string;
  /** Base catch-rate modifier, 0-1 */
  catchRate: number;
}

/**
 * A caught/owned creature — unique per instance. This is what gets saved to
 * IndexedDB and, from Milestone 2 onward, traded between players by instanceId.
 */
export interface CreatureInstance {
  instanceId: string;
  speciesId: string;
  ownerId: string;
  /** Unused mechanically in Milestone 1; present so the save schema is stable. */
  niveau: number;
  currentHp: number;
  caughtAt: string;
}
