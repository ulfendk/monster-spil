/**
 * Rare variants of monsters: now and then a wild monster turns up golden, dark, snow-white,
 * in other colours, giant or tiny. Only how it looks changes (a variant fights like any
 * other of its kind); the caught monster keeps its variant (`CreatureInstance.variant`),
 * so it can be shown off, traded and counted. The kinds and how rare they are are content:
 * shared/content/variants.json.
 */

export interface VariantLook {
  /** Degrees to turn the colours round the colour wheel. */
  hue?: number;
  /** Or: every colour becomes this one hue (degrees; 42 = gold), keeping its light and shade. */
  hueTo?: number;
  /** At least this strong a colour (0–1), so even a grey monster turns gold. */
  minSaturation?: number;
  /** Multiplies how strong the colours are (0 = grey). */
  saturation?: number;
  /** Towards white (0–1) or black (0–1). The ink outlines stay ink. */
  lighten?: number;
  darken?: number;
  /** A Kanagawa palette colour (by name) mixed in, and how much (0–1). */
  tint?: string;
  tintAmount?: number;
  /** Drawn this much bigger (1 = as usual). */
  size?: number;
  /** Twinkles in battle. */
  sparkle?: boolean;
}

export interface VariantDef {
  id: string;
  /** The adjective shown before the monster's name ("Gylden Mosmus"). */
  navn: string;
  /** How often, compared with the other variants. */
  weight: number;
  look: VariantLook;
}

export interface VariantConfig {
  /** The chance (0–1) that a wild monster is a variant at all. */
  chance: number;
  variants: VariantDef[];
}

/** Rolls whether a wild monster is a variant, and which one. */
export function rollVariant(config: VariantConfig, rand: () => number): string | undefined {
  if (rand() >= config.chance) return undefined;
  const total = config.variants.reduce((sum, v) => sum + Math.max(0, v.weight), 0);
  if (total <= 0) return undefined;
  let r = rand() * total;
  for (const v of config.variants) {
    r -= Math.max(0, v.weight);
    if (r < 0) return v.id;
  }
  return config.variants.filter((v) => v.weight > 0).at(-1)?.id;
}

export function variantById(config: VariantConfig, id: string | undefined): VariantDef | undefined {
  return id ? config.variants.find((v) => v.id === id) : undefined;
}

/** A variant id as the server accepts it from a device (a short ASCII slug). */
export function isVariantId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{1,24}$/.test(value);
}

/** The name to show: "Gylden Mosmus" for a variant, just "Mosmus" otherwise. */
export function variantName(config: VariantConfig, speciesName: string, id: string | undefined): string {
  const v = variantById(config, id);
  return v ? `${v.navn} ${speciesName}` : speciesName;
}
