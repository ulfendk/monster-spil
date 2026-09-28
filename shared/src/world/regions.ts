import { WILD_GROUNDS, type AreaMeta, type EncounterRegion, type EncounterTableEntry, type WildGround, type WildGroundEncounters } from "../types/area.js";

/**
 * Different monsters in different parts of a big map: an area's `.meta.json` can list
 * regions (rectangles of tiles, each with its own encounter table). The first region a tile
 * lies in decides who turns up in its tall grass; tiles in no region use the area's own
 * `encounterTable`. Plain data, so adding a monster to a region is a content change.
 *
 * Away from the grass, the woods, the water and the mountains (walked through slowly) have
 * monsters of their own: `habitats` in the sidecar, by ground tile id.
 */

/** The region a tile lies in, if any. */
export function regionAt(meta: Pick<AreaMeta, "regions">, x: number, y: number): EncounterRegion | undefined {
  return meta.regions?.find((r) => r.rects.some((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h));
}

/** Who can turn up in the tall grass on this tile. */
export function encounterTableAt(meta: Pick<AreaMeta, "regions" | "encounterTable">, x: number, y: number): EncounterTableEntry[] {
  return regionAt(meta, x, y)?.encounterTable ?? meta.encounterTable;
}

/** The habitat (forest, water, mountain) a ground tile id is on this map, with who hides there. */
export function habitatAt(meta: Pick<AreaMeta, "habitats">, gid: number | undefined): (WildGroundEncounters & { habitat: WildGround }) | undefined {
  if (gid === undefined) return undefined;
  for (const habitat of WILD_GROUNDS) {
    const h = meta.habitats?.[habitat];
    if (h?.gids.includes(gid)) return { ...h, habitat };
  }
  return undefined;
}

const lists = (table: EncounterTableEntry[], speciesId: string) => table.some((e) => e.speciesId === speciesId && e.weight > 0);

/** Whether this monster lives anywhere in the area's wild (some table lists it). */
export function livesInArea(meta: Pick<AreaMeta, "regions" | "encounterTable" | "habitats">, speciesId: string): boolean {
  return (
    lists(meta.encounterTable, speciesId) ||
    (meta.regions ?? []).some((r) => lists(r.encounterTable, speciesId)) ||
    Object.values(meta.habitats ?? {}).some((h) => lists(h.encounterTable, speciesId))
  );
}

/** Whether this monster can turn up in the tall grass on this tile. */
export function livesAt(meta: Pick<AreaMeta, "regions" | "encounterTable">, speciesId: string, x: number, y: number): boolean {
  return lists(encounterTableAt(meta, x, y), speciesId);
}

/** Whether this monster hides on ground of this tile id (a forest, the water, a mountain). */
export function livesOnGround(meta: Pick<AreaMeta, "habitats">, speciesId: string, gid: number): boolean {
  const h = habitatAt(meta, gid);
  return !!h && lists(h.encounterTable, speciesId);
}
