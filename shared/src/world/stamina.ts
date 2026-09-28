/**
 * Climbing is hard work: every step onto a mountain uses some breath, and when it's all used
 * the player has to stop and rest for a few seconds before climbing on. Walking on level ground
 * or standing still gets the breath back. Pure rules; the device keeps the numbers (they're not
 * saved: a fresh map is a rested player). The numbers are content: `climb` in
 * shared/content/minigames.json.
 */

export interface ClimbConfig {
  /** Mountain steps in a row before a rest is needed. */
  tilesBeforeRest: number;
  /** How long a rest takes. */
  restSeconds: number;
}

/** A step onto a tile: `used` is the breath used so far (0 = fresh). `rest` = stop and rest now (and be fresh after). */
export function staminaStep(used: number, climbing: boolean, config: ClimbConfig): { used: number; rest: boolean } {
  if (!climbing) return { used: Math.max(0, used - 1), rest: false };
  const next = used + 1;
  if (next >= config.tilesBeforeRest) return { used: 0, rest: true };
  return { used: next, rest: false };
}

/** Standing still for `seconds` (not resting on purpose): breath comes back, all of it in `restSeconds`. */
export function staminaRecover(used: number, seconds: number, config: ClimbConfig): number {
  return Math.max(0, used - (seconds * config.tilesBeforeRest) / Math.max(0.1, config.restSeconds));
}

/** How much breath is left, 0–1 (for the meter). */
export function breathLeft(used: number, config: ClimbConfig): number {
  return Math.max(0, Math.min(1, 1 - used / Math.max(1, config.tilesBeforeRest)));
}
