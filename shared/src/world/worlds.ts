import type { AreaLink, AreaMeta } from "../types/area.js";

/**
 * The worlds: each is its own map (an area), and they're joined by row boats, tunnels and
 * bridges — `links` in each map's .meta.json, one at each end. Some worlds open only from a
 * player level on (shared/content/worlds.json: name, icon, where it lies on the world map,
 * `minLevel`). Pure rules; the overworld does the travelling.
 */

export interface WorldDef {
  /** The map's area id. */
  id: string;
  navn: string;
  /** A drawn icon (gfx/icon-art.ts) for the world map and the monster book. */
  icon: string;
  /** Where it lies on the world map (0–1 across and down). */
  x: number;
  y: number;
  /** The player level needed to go there. */
  minLevel: number;
}

export interface WorldConfig {
  worlds: WorldDef[];
}

export function worldById(config: WorldConfig, id: string): WorldDef | undefined {
  return config.worlds.find((w) => w.id === id);
}

/** The way to another world on this tile, if there is one. */
export function linkAt(meta: Pick<AreaMeta, "links">, x: number, y: number): AreaLink | undefined {
  return meta.links?.find((l) => l.x === x && l.y === y);
}

/** Where a link comes out: the other end's tile on the other map, or undefined if that map doesn't have it. */
export function linkTarget(link: AreaLink, metas: ReadonlyArray<Pick<AreaMeta, "id" | "links">>): { areaId: string; x: number; y: number } | undefined {
  const there = metas.find((m) => m.id === link.to.areaId)?.links?.find((l) => l.id === link.to.link);
  return there ? { areaId: link.to.areaId, x: there.x, y: there.y } : undefined;
}

/** Whether a player of this level may go to this world (a world not in the list is open). */
export function canEnterWorld(config: WorldConfig, worldId: string, level: number): boolean {
  return level >= (worldById(config, worldId)?.minLevel ?? 1);
}
