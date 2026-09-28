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
  /** What it looks like: its body plan and the parts that make it itself (see `CreatureForm`). */
  form?: CreatureForm;
}

/**
 * How a monster is built in 3D (client/src/cave/anatomy/): a body plan and the parts on it,
 * all plain words from the lists below, so a new monster needs no code. Colours are Kanagawa
 * palette names (client/src/ui/theme.ts), optionally lightened or darkened: "katanaGray:-10".
 * Anything left out takes a sensible default for its plan and type.
 */
export interface CreatureForm {
  body: FormBody;
  /** For a blob or a spirit: what shape it is. */
  shape?: FormShape;
  /** Its main colour (default: its type's), its belly's, and one for markings and features. */
  colour?: string;
  belly?: string;
  accent?: string;
  /** Legs: short, long (deer, goats) or stubby (lizards, tortoises); a biped's are its own. */
  legs?: FormLegs;
  /** Build: a bigger body and a smaller head (trolls, bears), or a small body under a big head. */
  build?: FormBuild;
  ears?: FormEars;
  snout?: FormSnout;
  horns?: FormHorns;
  crest?: FormCrest;
  tail?: FormTail;
  eyes?: FormEyes;
  mouth?: FormMouth;
  pattern?: FormPattern;
  extras?: FormExtra[];
}

export const FORM_BODIES = ["blob", "beast", "biped", "bird", "fish", "bug", "frog", "spirit", "snail", "shell", "crab", "worm"] as const;
export const FORM_SHAPES = ["egg", "drop", "rock", "puffball", "mushroom", "star", "cone", "cloud", "flame", "jelly", "crystal", "whirl", "snowflake"] as const;
export const FORM_LEGS = ["short", "long", "stubby"] as const;
export const FORM_BUILDS = ["normal", "stocky", "chibi", "long"] as const;
export const FORM_EARS = ["none", "cat", "fox", "fennec", "long", "round", "bear", "mouse", "tufts", "bat", "floppy", "clover"] as const;
export const FORM_SNOUTS = ["none", "muzzle", "long", "pig", "beak", "hook", "chisel", "big", "star", "jaw"] as const;
export const FORM_HORNS = ["none", "goat", "ram", "hook", "antlers", "crystal", "zigzag", "nubs", "beetle"] as const;
export const FORM_CRESTS = ["none", "flames", "waves", "leaves", "sprout", "mushroom", "crystals", "rocks", "comb", "cap", "spikes", "sun", "snowflake", "lilypad", "hat", "stonehat", "reeds", "flower", "clover", "tuft", "icicles", "hair"] as const;
export const FORM_TAILS = ["none", "fluffy", "fox", "thin", "puff", "fin", "stinger", "lizard", "fan", "sickle", "curl", "flat", "bolt", "flames", "leafy"] as const;
export const FORM_EYES = ["kawaii", "fierce", "sleepy", "owl", "bug", "dot", "blind", "stalks", "glow", "alien"] as const;
export const FORM_MOUTHS = ["smile", "cat", "grin", "teeth", "buck", "tusks", "beak", "none", "wide"] as const;
export const FORM_PATTERNS = ["none", "stripes", "spots", "bands", "scales", "cracks", "patches", "speckles", "mask", "bark", "fur", "layers"] as const;
export const FORM_EXTRAS = [
  "whiskers", "antennae", "lantern", "pearl", "beard", "sparks", "glow", "bubbles", "steam", "icicles", "raindrops",
  "bugwings", "claws", "pincers", "backfin", "ridge", "embers", "moss", "flower", "lure", "hooves", "carapace", "mist",
  "acorn", "spores", "kitsune", "wattle", "strider", "elytra", "blush", "neck", "veil", "cheeks", "flametip", "dust",
] as const;

export type FormBody = (typeof FORM_BODIES)[number];
export type FormShape = (typeof FORM_SHAPES)[number];
export type FormLegs = (typeof FORM_LEGS)[number];
export type FormBuild = (typeof FORM_BUILDS)[number];
export type FormEars = (typeof FORM_EARS)[number];
export type FormSnout = (typeof FORM_SNOUTS)[number];
export type FormHorns = (typeof FORM_HORNS)[number];
export type FormCrest = (typeof FORM_CRESTS)[number];
export type FormTail = (typeof FORM_TAILS)[number];
export type FormEyes = (typeof FORM_EYES)[number];
export type FormMouth = (typeof FORM_MOUTHS)[number];
export type FormPattern = (typeof FORM_PATTERNS)[number];
export type FormExtra = (typeof FORM_EXTRAS)[number];

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
