import type { AreaMeta, EncounterRegion, EncounterTableEntry } from "../types/area.js";

/**
 * Different monsters in different parts of a big map: an area's `.meta.json` can list
 * regions (rectangles of tiles, each with its own encounter table). The first region a tile
 * lies in decides who turns up in its tall grass; tiles in no region use the area's own
 * `encounterTable`. Plain data, so adding a monster to a region is a content change.
 */

/** The region a tile lies in, if any. */
export function regionAt(meta: Pick<AreaMeta, "regions">, x: number, y: number): EncounterRegion | undefined {
  return meta.regions?.find((r) => r.rects.some((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h));
}

/** Who can turn up in the tall grass on this tile. */
export function encounterTableAt(meta: Pick<AreaMeta, "regions" | "encounterTable">, x: number, y: number): EncounterTableEntry[] {
  return regionAt(meta, x, y)?.encounterTable ?? meta.encounterTable;
}

/** Whether this monster lives anywhere in the area's wild (some table lists it). */
export function livesInArea(meta: Pick<AreaMeta, "regions" | "encounterTable">, speciesId: string): boolean {
  const lists = (table: EncounterTableEntry[]) => table.some((e) => e.speciesId === speciesId && e.weight > 0);
  return lists(meta.encounterTable) || (meta.regions ?? []).some((r) => lists(r.encounterTable));
}

/** Whether this monster can turn up in the tall grass on this tile. */
export function livesAt(meta: Pick<AreaMeta, "regions" | "encounterTable">, speciesId: string, x: number, y: number): boolean {
  return encounterTableAt(meta, x, y).some((e) => e.speciesId === speciesId && e.weight > 0);
}
