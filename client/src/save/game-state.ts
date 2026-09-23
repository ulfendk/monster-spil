import type { SaveData } from "./schema";
import { loadSave, writeSave } from "./db";

let current: SaveData | undefined;

export function getState(): SaveData | undefined {
  return current;
}

export function setState(data: SaveData): void {
  current = data;
}

/** Explicit checkpoint save — call after setup/starter/catch/battle/area-transition events. */
export async function persist(): Promise<void> {
  if (!current) return;
  current.updatedAt = new Date().toISOString();
  await writeSave(current);
}

export async function loadInitialState(): Promise<SaveData | undefined> {
  current = await loadSave();
  return current;
}
