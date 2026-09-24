import type { BossDefinition } from "@shared";

/** Every boss in shared/content/raid/*.json, picked up at build time (adding one needs no code change). */
const modules = import.meta.glob<BossDefinition>("../../../shared/content/raid/*.json", { eager: true, import: "default" });

export const bossesById: Record<string, BossDefinition> = Object.fromEntries(Object.values(modules).map((b) => [b.id, b]));
