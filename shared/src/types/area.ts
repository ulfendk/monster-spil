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
  encounterZoneLayer: string;
  encounterTable: EncounterTableEntry[];
  /** 0-1 chance per step taken inside the encounter zone */
  encounterRate: number;
  playerStart: { x: number; y: number };
}
