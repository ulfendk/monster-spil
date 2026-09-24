import type { DisasterConfigs, DisasterKind } from "@shared";
import disasters from "../../../shared/content/disasters.json";

/** The disasters' names and numbers (shared/content/disasters.json), also read by the server. */
export const disasterConfigs = disasters as DisasterConfigs;

/** Which disaster leaves this species behind, if any (the monster book shows it instead of a distance hint). */
export function disasterForSpecies(speciesId: string): DisasterKind | undefined {
  return (Object.keys(disasterConfigs) as DisasterKind[]).find((k) => disasterConfigs[k].speciesId === speciesId);
}
