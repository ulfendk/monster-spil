import { caveKind, caveSpeciesIds, type CaveConfig, type CaveKind } from "@shared";
import config from "../../../shared/content/caves.json";

/** The kinds of caves and who lives in them (shared/content/caves.json) — the server plans visits from the same file. */
export const caveConfig = config as CaveConfig;

const residents = caveSpeciesIds(caveConfig);

/** True for a monster that lives in some kind of cave (the monster book shows a cave icon for it). */
export function livesInCaves(speciesId: string): boolean {
  return residents.has(speciesId);
}

/** A cave's kind (its look and name); caves from before kinds existed get the first. */
export function caveKindFor(id: string | undefined): CaveKind | undefined {
  return caveKind(caveConfig, id);
}
