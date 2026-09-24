import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { DISASTER_KINDS, type AreaMeta, type BaseArea, type DisasterConfigs } from "@monster-spil/shared";

/** An area as the server needs it: its base map (for disasters) and where food may grow. */
export interface ServerArea {
  areaId: string;
  /** Open ground and paths on the base map (not blocked, not tall grass, not a lair). */
  spots: Array<{ x: number; y: number }>;
  /** The base map; undefined for an area whose meta has no `terrain` block (no disasters there). */
  base?: BaseArea;
}
/** Kept for the food code: an area's food spots. */
export type AreaSpots = Pick<ServerArea, "areaId" | "spots">;

interface TiledLayer {
  name: string;
  data?: number[];
}

const contentDir = (sub: string) => fileURLToPath(new URL(`../content/${sub}`, import.meta.resolve("@monster-spil/shared")));

/**
 * Reads every area from shared/content/areas/ (the same files the game uses: the Tiled
 * map plus its `.meta.json` sidecar). Like the bosses, this is read at runtime; the
 * Dockerfile copies the folder into the image. `fixed` are tiles to leave alone (a
 * dragon's lair): no food there, and disasters never change them.
 */
export async function loadAreas(fixed: Array<{ areaId: string; x: number; y: number }> = []): Promise<ServerArea[]> {
  const dir = contentDir("areas/");
  const metas = (await readdir(dir)).filter((f) => f.endsWith(".meta.json"));
  const areas: ServerArea[] = [];
  for (const file of metas) {
    const meta = JSON.parse(await readFile(dir + file, "utf-8")) as AreaMeta;
    const map = JSON.parse(await readFile(dir + meta.tiledMapPath.replace(/^areas\//, ""), "utf-8")) as { width: number; height: number; layers: TiledLayer[] };
    const ground = map.layers.find((l) => l.name === meta.collisionLayer)?.data ?? [];
    const grass = map.layers.find((l) => l.name === meta.encounterZoneLayer)?.data ?? [];
    const mine = fixed.filter((b) => b.areaId === meta.id).map(({ x, y }) => ({ x, y }));
    const skip = new Set(mine.map((b) => `${b.x},${b.y}`));
    const spots: ServerArea["spots"] = [];
    ground.forEach((gid, i) => {
      const x = i % map.width;
      const y = Math.floor(i / map.width);
      if (gid !== 0 && !meta.collisionGids.includes(gid) && !grass[i] && !skip.has(`${x},${y}`)) spots.push({ x, y });
    });
    const base: BaseArea | undefined = meta.terrain
      ? { id: meta.id, width: map.width, height: map.height, ground, grass, blocking: meta.collisionGids, tiles: meta.terrain, start: meta.playerStart, fixed: mine }
      : undefined;
    areas.push({ areaId: meta.id, spots, ...(base ? { base } : {}) });
  }
  return areas;
}

/** shared/content/disasters.json: each disaster's numbers (warning time, size, how long things last). */
export async function loadDisasterConfigs(): Promise<DisasterConfigs> {
  const raw = JSON.parse(await readFile(contentDir("disasters.json"), "utf-8")) as Partial<DisasterConfigs>;
  for (const k of DISASTER_KINDS) if (!raw[k]) throw new Error(`disasters.json has no "${k}"`);
  return raw as DisasterConfigs;
}
