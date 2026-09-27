import type { AreaMeta, WorldConfig } from "@shared";
import worldsJson from "../../../shared/content/worlds.json";

export interface AreaAssets {
  meta: AreaMeta;
  mapUrl: string;
  tilesetUrl: string;
}

/**
 * Every map (world) in shared/content/areas/: its `.meta.json` sidecar, its Tiled map and its
 * tileset, found at build time — adding a world is adding its files (scripts/generate-worlds.mjs
 * makes them), no code change.
 */
const metas = import.meta.glob<AreaMeta>("../../../shared/content/areas/*.meta.json", { eager: true, import: "default" });
const maps = import.meta.glob<string>(["../../../shared/content/areas/*.json", "!../../../shared/content/areas/*.meta.json"], { eager: true, query: "?url", import: "default" });
const tilesets = import.meta.glob<string>("../../../shared/content/areas/*.png", { eager: true, query: "?url", import: "default" });

const DIR = "../../../shared/content/areas/";
const AREA_REGISTRY: Record<string, AreaAssets> = {};
for (const meta of Object.values(metas)) {
  const mapUrl = maps[DIR + meta.tiledMapPath.replace(/^areas\//, "")];
  const tilesetUrl = tilesets[DIR + meta.tilesetImagePath.replace(/^areas\//, "")];
  if (mapUrl && tilesetUrl) AREA_REGISTRY[meta.id] = { meta, mapUrl, tilesetUrl };
}

export function getAreaAssets(areaId: string): AreaAssets {
  const area = AREA_REGISTRY[areaId];
  if (!area) throw new Error(`Unknown area id: ${areaId}`);
  return area;
}

/** Whether this build has the map (an older device may be told about a world it doesn't have). */
export function hasArea(areaId: string): boolean {
  return areaId in AREA_REGISTRY;
}

/** Every world's sidecar (for links, the world map and where monsters live). */
export function allAreaMetas(): AreaMeta[] {
  return Object.values(AREA_REGISTRY).map((a) => a.meta);
}

/** The worlds: names, icons, where they lie on the world map, the level each opens at (shared/content/worlds.json). */
export const worldConfig = worldsJson as WorldConfig;
