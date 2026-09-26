import type { DisasterKind, TypeId } from "@shared";

/**
 * Names of the drawn icons (see gfx/icon-art.ts) for each meaning in the game. Use
 * them with `addIcon(scene, x, y, NAME, size)`, as a button's `icon`, or inline in
 * text as `ic(NAME)` → "[[name]]" rendered by `richText`.
 */

/** One icon per monster type, the same five shown in HOW_TO_ADD_A_MONSTER.md. */
export const TYPE_ICONS: Record<TypeId, string> = {
  ild: "fire",
  vand: "water",
  graes: "leaf",
  lyn: "bolt",
  sten: "stone",
};

/** Battle actions that aren't moves. */
export const FLEE_ICON = "run";
export const CATCH_ICON = "ball";

/** Icon shown large above each battle message, chosen by the log entry's kind (never by parsing its text). */
export const LOG_ICONS = {
  damage: "hit",
  miss: "miss",
  faint: "faint",
  "catch-success": "cheer",
  "catch-fail": "angry",
  flee: "run",
} as const;

/** Icons for how a battle ended, and for the states around it. */
export const OUTCOME_ICONS = { won: "trophy", lost: "faint", fled: "run", caught: "cheer" } as const;
export const WAITING_ICON = "hourglass";
export const OPPONENT_LEFT_ICON = "door";
export const CONNECTION_LOST_ICON = "offline";
export const CANCELLED_ICON = "hand";
export const STRONG_ICON = "star";
export const WEAK_ICON = "shield";

/** Monster book and info page. */
export const CAUGHT_ICON = "ball"; // times caught, matching the Fang! ball
export const OWNED_ICON = "bag"; // in your possession right now
export const SOUND_ICON = "sound";
export const STAT_ICONS = { hp: "heart", angreb: "sword", forsvar: "shield", fart: "run" } as const;
export const POWER_ICON = "hit";
export const STEPS_ICON = "steps";

/** The family dragon and the scoreboard. */
export const DRAGON_ICON = "dragon";
export const SLEEP_ICON = "sleep";
/** A cave in the mountains, and the ball you throw inside. */
export const CAVE_ICON = "cave";
/** The visiting beasts, by where they live: sand serpents and giant eagles. */
export const BEAST_ICONS = { sand: "serpent", forest: "eagle" } as const;
export const REST_ICON = "hourglass";
export const SCORES_ICON = "trophy";
export const DUEL_WIN_ICON = "sword";
export const POINTS_ICON = "star";
export const MEDALS = ["medal1", "medal2", "medal3"] as const;
export const TEAM_ICON = "team";
export const HEART_ICON = "heart";

/** Food is stored as emoji in saves and messages; this is the icon drawn for each. */
const FOOD_ICONS: Record<string, string> = { "🍎": "apple", "🍓": "strawberry", "🍌": "banana", "🥕": "carrot", "🍇": "grapes" };
export const foodIcon = (kind: string): string => FOOD_ICONS[kind] ?? "apple";

/** The monster-book hint arrows (emoji from shared/world/hint.ts) as an angle for the drawn arrow; undefined = "you are here". */
const ARROW_ANGLES: Record<string, number> = { "➡️": 0, "↘️": 45, "⬇️": 90, "↙️": 135, "⬅️": 180, "↖️": 225, "⬆️": 270, "↗️": 315 };
export const arrowAngle = (arrow: string): number | undefined => ARROW_ANGLES[arrow];

/** Natural disasters. */
export const DISASTER_ICONS: Record<DisasterKind, string> = {
  meteor: "meteor",
  earthquake: "quake",
  flood: "flood",
  hurricane: "storm",
  dragonfire: "fire",
  ufo: "ufo",
};
