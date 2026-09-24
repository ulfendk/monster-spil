import type { Tile } from "./hint.js";

/** One step on the tile grid: each of dx, dy is -1, 0 or 1. */
export interface Step {
  dx: number;
  dy: number;
}

/**
 * A diagonal step covers √2 tiles. Walking at the same speed, it takes that much
 * longer — so moving diagonally is slower along each axis than moving straight.
 */
export const DIAGONAL_TIME_FACTOR = Math.SQRT2;

/**
 * The direction a drag points in, as one of 8 steps (45° sectors, y grows
 * downwards), or undefined while the finger is still within `deadZone` pixels of
 * where it touched down.
 */
export function dragDirection(vx: number, vy: number, deadZone: number): Step | undefined {
  if (Math.hypot(vx, vy) < deadZone) return undefined;
  const octant = Math.round(Math.atan2(vy, vx) / (Math.PI / 4));
  const angle = (octant * Math.PI) / 4;
  return { dx: Math.round(Math.cos(angle)), dy: Math.round(Math.sin(angle)) };
}

/**
 * The step to actually take from `from` in direction `dir`. A diagonal is only
 * taken when its target and both tiles beside the corner are free (no squeezing
 * between two trees); otherwise the player slides along whichever straight step is
 * free, trying the axis the finger leans towards first. Undefined if nothing is free.
 */
export function chooseStep(from: Tile, dir: Step, vx: number, vy: number, walkable: (x: number, y: number) => boolean): Step | undefined {
  const free = (s: Step) => walkable(from.x + s.dx, from.y + s.dy);
  if (dir.dx === 0 || dir.dy === 0) return free(dir) ? dir : undefined;
  const horizontal = { dx: dir.dx, dy: 0 };
  const vertical = { dx: 0, dy: dir.dy };
  if (free(dir) && free(horizontal) && free(vertical)) return dir;
  const [first, second] = Math.abs(vx) >= Math.abs(vy) ? [horizontal, vertical] : [vertical, horizontal];
  if (free(first)) return first;
  if (free(second)) return second;
  return undefined;
}
