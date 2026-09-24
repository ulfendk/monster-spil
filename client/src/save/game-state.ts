import type { SaveData } from "./schema";
import { loadSave, writeSave } from "./db";
import { passOutUntil } from "@shared";

let current: SaveData | undefined;

export function getState(): SaveData | undefined {
  return current;
}

export function setState(data: SaveData): void {
  current = data;
}

/**
 * Marks the player as passed out after their monster fainted; `closeness` says how
 * close they came to winning (see passOutSeconds). The wait is saved, so closing the
 * app doesn't skip it.
 */
export async function passOut(closeness: number): Promise<void> {
  if (!current) return;
  current.passedOutUntil = passOutUntil(new Date(), closeness);
  await persist();
}

/** Explicit checkpoint save — call after setup/starter/catch/battle/area-transition events. */
export async function persist(): Promise<void> {
  if (!current) return;
  current.updatedAt = new Date().toISOString();
  await writeSave(current);
}

export async function loadInitialState(): Promise<SaveData | undefined> {
  current = normalise(await loadSave());
  return current;
}

/**
 * Fills in fields added after a save was written. Saves from before the catch
 * counters existed get a best guess: everything owned except the first creature
 * (the starter) counts as caught once per monster.
 */
function normalise(save: SaveData | undefined): SaveData | undefined {
  if (save && !save.caughtCounts) {
    save.caughtCounts = {};
    for (const creature of save.creatures.slice(1)) {
      save.caughtCounts[creature.speciesId] = (save.caughtCounts[creature.speciesId] ?? 0) + 1;
    }
  }
  if (save && !save.pendingScore) save.pendingScore = [];
  if (save && !save.bag) save.bag = [];
  return save;
}
