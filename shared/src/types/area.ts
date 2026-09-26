import type { TerrainTileIds } from "../world/terrain.js";

/** One weighted entry in an area's wild-encounter table. */
export interface EncounterTableEntry {
  speciesId: string;
  weight: number;
}

/**
 * Hand-authored sidecar for a Tiled area export — game logic that doesn't
 * belong inside the Tiled JSON itself, so re-exporting the map from Tiled
 * never clobbers it.
 */
export interface AreaMeta {
  id: string;
  tiledMapPath: string;
  tilesetImagePath: string;
  encounterZoneLayer: string;
  collisionLayer: string;
  /** Tile GIDs on collisionLayer that block movement */
  collisionGids: number[];
  encounterTable: EncounterTableEntry[];
  /** 0-1 chance per step taken inside the encounter zone */
  encounterRate: number;
  playerStart: { x: number; y: number };
  /**
   * Which tile ids (on the collision layer) the overview map draws as trees, water or paths.
   * Optional: without it, every blocking tile is drawn as a tree and everything else as ground.
   */
  minimap?: { tree?: number[]; water?: number[]; path?: number[]; mountain?: number[]; burnt?: number[]; crater?: number[]; flood?: number[]; sand?: number[]; stump?: number[]; hole?: number[] };
  /**
   * Which tile ids natural disasters use (see shared/src/world/terrain.ts). Optional:
   * an area without it never has disasters.
   */
  terrain?: TerrainTileIds;
}
