/**
 * Throwing balls in the cave: a flick on the screen becomes a throw in 3D, the ball flies
 * in an arc under gravity, and a hit near a monster's middle catches more easily. Pure
 * functions, so the feel can be tested without a browser; the 3D scene only draws them.
 *
 * Units are metres and seconds. The camera stands at the origin looking down -z, y is up,
 * the cave floor is y = 0.
 */
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

/** Swipes shorter than this (as a share of the screen's height) are taps, not throws. */
const MIN_SWIPE = 0.06;

/**
 * A flick on the screen → the ball's launch velocity. `dx`/`dy` in pixels (screen y grows
 * downwards, so an upward flick has dy < 0), `ms` how long the finger moved, `screenH` the
 * screen's height. Faster flicks throw further and higher; sideways movement aims left or
 * right. Undefined for a tap or a flick that doesn't go upwards.
 */
export function flickToThrow(dx: number, dy: number, ms: number, screenH: number): Vec3 | undefined {
  const up = -dy / screenH;
  if (up < MIN_SWIPE || screenH <= 0) return undefined;
  const secs = Math.max(0.05, ms / 1000);
  // Screens per second, within what a child's flick can reasonably do.
  const speed = Math.min(4, Math.max(0.5, up / secs));
  const side = Math.max(-4, Math.min(4, dx / screenH / secs));
  return { x: side * 2.2, y: 2.4 + 1.2 * speed, z: -(3 + 3.4 * speed) };
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
  return Math.max(0.1, Math.min(0.95, catchRate * (0.7 + 0.8 * p)));
}
