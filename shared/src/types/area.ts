import type { TerrainTileIds } from "../world/terrain.js";

/** One weighted entry in an area's wild-encounter table. */
export interface EncounterTableEntry {
  speciesId: string;
  weight: number;
}

/**
 * A part of a big map with its own wild monsters (see shared/src/world/regions.ts):
 * rectangles of tiles (x, y = top-left tile, w × h tiles) and who lives in their tall grass.
 */
export interface EncounterRegion {
  id: string;
  navn: string;
  rects: Array<{ x: number; y: number; w: number; h: number }>;
  encounterTable: EncounterTableEntry[];
  /** Where battles here take place (a scene id from shared/content/scenes.json). */
  scene?: string;
}

/** How you get from one world to another. */
export type LinkKind = "boat" | "tunnel" | "bridge";

/**
 * A way to another world, on a tile of this map (a dock, a tunnel mouth, a bridge): step onto
 * it and you can go to the other end, the link `to.link` on the map `to.areaId`.
 */
export interface AreaLink {
  id: string;
  kind: LinkKind;
  x: number;
  y: number;
  to: { areaId: string; link: string };
}

/** How the 3D map draws a world: its trees and peaks, and its sky (palette names). */
export interface AreaLook3d {
  tree?: "pine" | "sakura" | "snowPine" | "deadPine";
  peak?: "snow" | "volcano";
  sky?: string;
  fog?: string;
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
  /** Who turns up in tall grass that lies in none of the `regions`. */
  encounterTable: EncounterTableEntry[];
  /** Parts of the map with their own wild monsters; the first one a tile lies in wins. */
  regions?: EncounterRegion[];
  /** Where battles on this map take place, outside regions that name their own (shared/content/scenes.json). */
  scene?: string;
  /** Ways to other worlds (shared/src/world/worlds.ts). */
  links?: AreaLink[];
  /** How the 3D map looks here (default: Startskoven's pines, snowy peaks and blue sky). */
  look3d?: AreaLook3d;
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
