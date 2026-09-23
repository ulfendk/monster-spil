import type { TypeId } from "./creature.js";

export interface Move {
  id: string;
  navn: string;
  type: TypeId;
  power: number;
  /** 0-1 */
  accuracy: number;
  soundKey?: string;
}
