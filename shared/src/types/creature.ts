export type TypeId = "ild" | "vand" | "graes" | "lyn" | "sten";

export interface StatBlock {
  hp: number;
  angreb: number;
  forsvar: number;
  fart: number;
}

/** Species definition — loaded from JSON, one per species. */
export interface CreatureSpecies {
  id: string;
  navn: string;
  type: TypeId;
  baseStats: StatBlock;
  /** 3-4 move ids, resolved against moves.json */
  moveIds: string[];
  spriteFront: string;
  spriteBack: string;
  /**
   * The monster's cry, a path relative to shared/content/ (e.g. "creatures/flammepels.wav";
   * wav, mp3 or m4a so it plays on iPad Safari). Optional: without it the game plays a short
   * type-coloured blip instead.
   */
  sound?: string;
  /** Base catch-rate modifier, 0-1 */
  catchRate: number;
  /** The names of its later evolution stages (none: it doesn't evolve). */
  evolutions?: string[];
  /** Big enough to ride on the map (the player sits on its back), and how it moves then (creature/riding.ts; `true` = waddle). */
  ride?: true | "waddle" | "stomp" | "bound" | "slither" | "glide" | "fly";
  /** Wings on its model: a bat's or a bird's (dragons' and eagles' kinds have their own). */
  wings?: "bat" | "feather";
  /** A spiral shell on its back (a snail). */
  shell?: boolean;
}

/**
 * A caught/owned creature — unique per instance. This is what gets saved to
 * IndexedDB and, from Milestone 2 onward, traded between players by instanceId.
 */
export interface CreatureInstance {
  instanceId: string;
  speciesId: string;
  ownerId: string;
  /** Unused mechanically in Milestone 1; present so the save schema is stable. */
  niveau: number;
  currentHp: number;
  caughtAt: string;
  /** A rare look (golden, giant…), see shared/src/creature/variants.ts; absent for an ordinary one. */
  variant?: string;
  /** Its evolution stage (1 = as caught; up to 3), see shared/src/creature/evolution.ts. */
  stage?: number;
  /** How close it is to its player (care and battles together): what lets it evolve. */
  bond?: number;
  /** Today's care so far (petting and playing are limited per day). */
  care?: { day: string; pet: number; play: number };
}
