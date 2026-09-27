import type { CreatureSpecies } from "../types/creature.js";

/**
 * How a monster moves when it's ridden (`"ride"` in its JSON): each way of moving has its own
 * animation on the 3D map and its own pace.
 * - waddle: a sway from foot to foot (the default)
 * - stomp: heavy, slow strides that shake the ground a little (bears, trolls)
 * - bound: leaps, landing and springing off again (deer, goats)
 * - slither: a snake's S-curves running down a long body
 * - glide: a snail's slow stretch and pull, leaving a shiny trail
 * - fly: up in the air with beating wings
 */
export const RIDE_GAITS = ["waddle", "stomp", "bound", "slither", "glide", "fly"] as const;
export type RideGait = (typeof RIDE_GAITS)[number];

/** How long a step takes riding, as a share of the time walking takes (a snail is slow; flying is a little faster). */
export const RIDE_STEP_TIME: Record<RideGait, number> = {
  waddle: 1,
  stomp: 1.15,
  bound: 0.9,
  slither: 1,
  glide: 1.35,
  fly: 0.85,
};

/** How this species moves when ridden, or undefined if it can't be ridden (`true` = waddle). */
export function rideGait(species: Pick<CreatureSpecies, "ride"> | undefined): RideGait | undefined {
  const ride = species?.ride;
  if (ride === true) return "waddle";
  return typeof ride === "string" && (RIDE_GAITS as readonly string[]).includes(ride) ? ride : undefined;
}
