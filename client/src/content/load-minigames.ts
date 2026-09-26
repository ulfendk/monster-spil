import type { MinigameConfig } from "@shared";
import config from "../../../shared/content/minigames.json";

/** How the minigames work (shared/content/minigames.json) — the server reads the same file. */
export const minigameConfig = config as MinigameConfig;
