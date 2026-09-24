import type { TypeId } from "@shared";

/** One icon per monster type, the same five shown in HOW_TO_ADD_A_MONSTER.md. */
export const TYPE_ICONS: Record<TypeId, string> = {
  ild: "🔥",
  vand: "💧",
  graes: "🌿",
  lyn: "⚡",
  sten: "🪨",
};

/** Battle actions that aren't moves. */
export const FLEE_ICON = "🏃";
export const CATCH_ICON = "🔴";
