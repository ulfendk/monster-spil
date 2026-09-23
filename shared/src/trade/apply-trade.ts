import type { CreatureInstance } from "../types/creature.js";
import type { TradeDelivery } from "./trade-session.js";

/**
 * Applies a finished trade to one player's creatures[]. Idempotent: the server
 * re-sends an unacknowledged delivery after a reconnect, and applying it twice
 * must not duplicate or lose anything. Returns a new array.
 */
export function applyDelivery(creatures: CreatureInstance[], delivery: TradeDelivery): CreatureInstance[] {
  const kept = creatures.filter((c) => c.instanceId !== delivery.give);
  if (kept.some((c) => c.instanceId === delivery.receive.instanceId)) return kept;
  return [...kept, delivery.receive];
}
