/**
 * Throwing balls in the cave and the meadow: pulling a slingshot back and letting go becomes a throw in 3D, the ball flies
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

/** Pulls shorter than this (as a share of the longest pull) are let go without a throw. */
export const MIN_PULL = 0.15;
/** How far to the side the slingshot can aim: the tangent of its widest angle (about 35°). */
const MAX_AIM = 0.7;
/** A pull this close to straight back (tangent, about 5°) throws straight ahead: small wobbles of the finger don't count. */
const STRAIGHT = 0.09;

/**
 * Pulling the slingshot back and letting go → the ball's launch velocity. `dx`/`dy` is how
 * far the finger pulled from where it pressed, in pixels (screen y grows downwards, so
 * pulling back towards yourself is dy > 0), `maxPull` the longest pull that counts. The
 * longer the pull, the further and higher the ball flies; it goes the opposite way of the
 * pull, so pulling down and to the right aims left (nearly straight back throws straight
 * ahead, and the aim turns gently from there). Undefined for a pull too short to throw
 * or one that doesn't pull back (downwards) at all.
 */
export function slingshotToThrow(dx: number, dy: number, maxPull: number): Vec3 | undefined {
  if (maxPull <= 0 || dy <= 0) return undefined;
  const pull = Math.min(1, Math.hypot(dx, dy) / maxPull);
  if (pull < MIN_PULL) return undefined;
  // From a gentle lob up to a long, high throw.
  const speed = 0.5 + 3.5 * ((pull - MIN_PULL) / (1 - MIN_PULL));
  const z = -(3 + 3.4 * speed);
  const slant = -dx / dy;
  const aim = Math.sign(slant) * Math.min(MAX_AIM, Math.max(0, Math.abs(slant) - STRAIGHT) * 0.8);
  return { x: aim * -z || 0, y: 2.4 + 1.2 * speed, z };
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
