import type Phaser from "phaser";

/**
 * How a thing on the map stands in the 3D map (client/src/world3d/map-3d.ts), for the few
 * that can't be told from what they are. Pictures and circles stand up; ellipses and
 * rectangles lie on the ground; text and labels float over the spot they're placed at.
 * These say otherwise. In the 2D map they change nothing.
 */
export interface MapHint {
  /** Lies flat on the ground (a glow, a shadow, a marked tile). */
  flat?: boolean;
  /** Floats this many tiles above the ground. */
  lift?: number;
  /** Belongs to the spot this many pixels further south on the 2D map (a label drawn above its owner). */
  dy?: number;
}

const KEY = "map3d";

export function setMapHint<T extends Phaser.GameObjects.GameObject>(object: T, hint: MapHint): T {
  object.setData(KEY, hint);
  return object;
}

export function mapHint(object: Phaser.GameObjects.GameObject): MapHint | undefined {
  return object.data?.get(KEY) as MapHint | undefined;
}
