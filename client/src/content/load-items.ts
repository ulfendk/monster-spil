import type { ItemConfig, ItemDef } from "@shared";
import config from "../../../shared/content/items.json";

/** Potions and other things to find on the map and use in battles (shared/content/items.json). */
export const itemConfig = config as ItemConfig;

export const itemById = (id: string): ItemDef | undefined => itemConfig.items.find((i) => i.id === id);
