import type Phaser from "phaser";
import type { RideGait } from "@shared";

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
  /** A player's face: stands as their animal figure in 3D, with the headwear and badges this says (read every frame) — riding the monster whose front picture is `mount.key`, if they are. */
  avatar?: () => { id: string; look?: string; badges: string[]; mount?: { key: string; gait: RideGait; variant?: string; stage?: number } };
}

const KEY = "map3d";

export function setMapHint<T extends Phaser.GameObjects.GameObject>(object: T, hint: MapHint): T {
  object.setData(KEY, hint);
  return object;
}

/**
 * Something in the air (a flying dragon, a swooping eagle): the 2D map shows its height as
 * being drawn `height` px higher up the screen; the 3D map puts it back over its spot on the
 * ground and raises it that high instead. 0 = it's landed.
 */
export function setAirborne<T extends Phaser.GameObjects.GameObject>(object: T, height: number, tileSize = 64): T {
  // A little lower than on the 2D map: in 3D, rising also brings it closer to the camera.
  return setMapHint(object, height > 0 ? { dy: height, lift: (height / tileSize) * 0.6 } : {});
}

export function mapHint(object: Phaser.GameObjects.GameObject): MapHint | undefined {
  return object.data?.get(KEY) as MapHint | undefined;
}
