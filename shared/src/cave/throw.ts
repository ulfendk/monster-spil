/**
 * Throwing balls in the cave and the meadow: aiming with the crosshairs and pressing the trigger becomes a throw in 3D, the ball flies
 * in an arc under gravity, and a hit near a monster's middle catches more easily. Pure
 * functions, so the feel can be tested without a browser; the 3D scene only draws them.
 *
 * Units are metres and seconds. The camera stands at the origin looking down -z, y is up,
 * the cave floor is y = 0.
 */
import { CATCH_EASE } from "../battle/catch.js";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const GRAVITY = 9.8;
/** Where the ball is held, just in front of the camera, low in the picture. */
export const BALL_START: Vec3 = { x: 0, y: 0.9, z: -1 };
/** How far from a monster's middle the ball may pass and still hit it (it's generous: the youngest player is 6). */
export const HIT_RADIUS = 0.75;

/** The longest and shortest a throw takes (seconds): near things quickly, far ones in a higher arc. */
const FLIGHT = { min: 0.5, max: 1.2, perMetre: 0.055, base: 0.45 };

/**
 * Aiming with the crosshairs → the ball's launch velocity: it leaves the hand (BALL_START)
 * and comes down exactly on `target` (the point under the crosshairs), in an arc that takes
 * longer the further away it is. Aiming well is all it takes to hit something that stands
 * still; something that moves has moved on a little by the time the ball gets there.
 */
export function aimToThrow(target: Vec3): { v: Vec3; t: number } {
  const dx = target.x - BALL_START.x;
  const dy = target.y - BALL_START.y;
  const dz = target.z - BALL_START.z;
  const distance = Math.hypot(dx, dz);
  const t = Math.min(FLIGHT.max, Math.max(FLIGHT.min, FLIGHT.base + distance * FLIGHT.perMetre));
  return { v: { x: dx / t, y: (dy + 0.5 * GRAVITY * t * t) / t, z: dz / t }, t };
}

/** Where the ball is `t` seconds after the throw. */
export function ballAt(v: Vec3, t: number): Vec3 {
  return {
    x: BALL_START.x + v.x * t,
    y: BALL_START.y + v.y * t - 0.5 * GRAVITY * t * t,
    z: BALL_START.z + v.z * t,
  };
}

/** When the ball comes down to the floor. */
export function landingTime(v: Vec3): number {
  return (v.y + Math.sqrt(v.y * v.y + 2 * GRAVITY * BALL_START.y)) / GRAVITY;
}

/** The closest the ball's path comes to a point before it lands, and when. */
export function closestApproach(v: Vec3, target: Vec3, step = 1 / 240): { t: number; distance: number } {
  const end = landingTime(v);
  let best = { t: 0, distance: Infinity };
  for (let t = 0; t <= end; t += step) {
    const p = ballAt(v, t);
    const d = Math.hypot(p.x - target.x, p.y - target.y, p.z - target.z);
    if (d < best.distance) best = { t, distance: d };
  }
  return best;
}

/** How well a ball passing `distance` from a monster's middle hit it: 1 = dead centre, 0 = the very edge; undefined = a miss. */
export function hitPrecision(distance: number, radius = HIT_RADIUS): number | undefined {
  if (distance > radius) return undefined;
  return 1 - distance / radius;
}

/**
 * The chance a hit catches the monster: its species' catchRate, better for a hit near the
 * middle. Never certain, never hopeless (like catching in battle).
 */
export function caveCatchChance(catchRate: number, precision: number): number {
  const p = Math.max(0, Math.min(1, precision));
  return Math.max(0.1, Math.min(0.95, catchRate * (0.7 + 0.8 * p) * CATCH_EASE));
}
