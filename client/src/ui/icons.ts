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

/** Icon shown large above each battle message, chosen by the log entry's kind (never by parsing its text). */
export const LOG_ICONS = {
  damage: "💥",
  miss: "💨",
  faint: "😵",
  "catch-success": "🎉",
  "catch-fail": "😤",
  flee: "🏃",
} as const;

/** Icons for how a battle ended, and for the states around it. */
export const OUTCOME_ICONS = { won: "🏆", lost: "😵", fled: "🏃", caught: "🎉" } as const;
export const WAITING_ICON = "⏳";
export const OPPONENT_LEFT_ICON = "🚪";
export const CONNECTION_LOST_ICON = "📵";
export const CANCELLED_ICON = "✋";
export const STRONG_ICON = "⭐";
export const WEAK_ICON = "🛡️";

/** Monster book and info page. */
export const CAUGHT_ICON = "🔴"; // times caught, matching the Fang! ball
export const OWNED_ICON = "🎒"; // in your possession right now
export const SOUND_ICON = "🔊";
export const STAT_ICONS = { hp: "❤️", angreb: "⚔️", forsvar: "🛡️", fart: "👟" } as const;
export const POWER_ICON = "💥";
export const STEPS_ICON = "👣";
