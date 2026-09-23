import type { AreaMeta } from "@shared";
import startskovenMeta from "../../../shared/content/areas/startskoven.meta.json";
import startskovenMapUrl from "../../../shared/content/areas/startskoven.json?url";
import startskovenTilesetUrl from "../../../shared/content/areas/startskoven-tileset.png";

export interface AreaAssets {
  meta: AreaMeta;
  mapUrl: string;
  tilesetUrl: string;
}

/**
 * Milestone 1 ships a single area, so this is a plain manual registry rather
 * than a glob-based auto-discovery loader. Add a second area the same way;
 * switch to import.meta.glob (like load-content.ts does for creatures) once
 * there are enough areas that a manual list becomes impractical.
 */
const AREA_REGISTRY: Record<string, AreaAssets> = {
  startskoven: {
    meta: startskovenMeta as AreaMeta,
    mapUrl: startskovenMapUrl,
    tilesetUrl: startskovenTilesetUrl,
  },
};

export function getAreaAssets(areaId: string): AreaAssets {
  const area = AREA_REGISTRY[areaId];
  if (!area) throw new Error(`Unknown area id: ${areaId}`);
  return area;
}
