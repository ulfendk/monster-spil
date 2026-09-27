import type { EggConfig } from "@shared";
import config from "../../../shared/content/eggs.json";

/** Monster eggs: how many steps they take, the nest's size, who's inside by type (shared/content/eggs.json). */
export const eggConfig = config as EggConfig;
