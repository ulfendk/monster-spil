import { variantById, variantName, type VariantConfig } from "@shared";
import config from "../../../shared/content/variants.json";

/** The rare variants (shared/content/variants.json). */
export const variantConfig = config as VariantConfig;

export const variantOf = (id: string | undefined) => variantById(variantConfig, id);

/** "Gylden Mosmus" for a variant, "Mosmus" otherwise. */
export const nameWithVariant = (speciesName: string, id: string | undefined) => variantName(variantConfig, speciesName, id);
