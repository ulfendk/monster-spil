import Phaser from "phaser";
import { award, type Badge, type ProgressEvent } from "@shared";
import { getState, persist } from "../save/game-state";
import { badgeList, levelConfig, levelOf, speciesCaught } from "../content/load-progress";

/**
 * Where the game tells a player's progress what happened: a catch, a win, damage to the
 * dragon, a cave visit, a trade, food eaten. It adds the XP and counters to the save,
 * notes a level-up or new badges for the map to celebrate, and tells whoever listens
 * (the connection) that the profile changed, so everyone else sees it.
 */

export interface Celebration {
  levelUp?: { from: number; to: number };
  badges: Badge[];
}

/** "celebrate" when something is waiting in the queue below. */
export const progressEvents = new Phaser.Events.EventEmitter();

/** Level-ups and badges not yet shown (shown when the player is back on the map). */
const waiting: Celebration[] = [];

let onProfileChange: (() => void) | undefined;

/** The connection registers here to send the new level and badges to the server. */
export function setProfileListener(listener: () => void): void {
  onProfileChange = listener;
}

/** Takes the next level-up or badge to show, if any. */
export function nextCelebration(): Celebration | undefined {
  return waiting.shift();
}

/** My level now (1 without a save). */
export function myLevel(): number {
  return levelOf(getState()?.progress);
}

/** Counts something that happened. Persists unless `persistLater` (the caller saves anyway). */
export function recordProgress(event: ProgressEvent, persistLater = false): void {
  const save = getState();
  if (!save?.progress) return;
  const result = award(save.progress, event, { species: speciesCaught(save), now: new Date() }, levelConfig, badgeList);
  save.progress = result.progress;
  if (!persistLater) void persist();
  if (result.levelUp || result.newBadges.length) {
    waiting.push({ ...(result.levelUp ? { levelUp: result.levelUp } : {}), badges: result.newBadges });
    progressEvents.emit("celebrate");
    onProfileChange?.();
  }
}
