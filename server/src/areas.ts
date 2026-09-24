import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { AreaMeta } from "@monster-spil/shared";

/** Tiles in an area where food may grow: open ground and paths (not blocked, not tall grass). */
export interface AreaSpots {
  areaId: string;
  spots: Array<{ x: number; y: number }>;
}

interface TiledLayer {
  name: string;
  data?: number[];
}

/**
 * Reads every area from shared/content/areas/ (the same files the game uses: the Tiled
 * map plus its `.meta.json` sidecar) and lists the tiles where food can grow. Like the
 * bosses, this is read at runtime; the Dockerfile copies the folder into the image.
 * `blocked` are extra tiles to leave free (e.g. a dragon's lair).
 */
export async function loadFoodSpots(blocked: Array<{ areaId: string; x: number; y: number }> = []): Promise<AreaSpots[]> {
  const dir = fileURLToPath(new URL("../content/areas/", import.meta.resolve("@monster-spil/shared")));
  const metas = (await readdir(dir)).filter((f) => f.endsWith(".meta.json"));
  const areas: AreaSpots[] = [];
  for (const file of metas) {
    const meta = JSON.parse(await readFile(dir + file, "utf-8")) as AreaMeta;
    const map = JSON.parse(await readFile(dir + meta.tiledMapPath.replace(/^areas\//, ""), "utf-8")) as { width: number; layers: TiledLayer[] };
    const ground = map.layers.find((l) => l.name === meta.collisionLayer)?.data ?? [];
    const grass = map.layers.find((l) => l.name === meta.encounterZoneLayer)?.data ?? [];
    const skip = new Set(blocked.filter((b) => b.areaId === meta.id).map((b) => `${b.x},${b.y}`));
    const spots: AreaSpots["spots"] = [];
    ground.forEach((gid, i) => {
      const x = i % map.width;
      const y = Math.floor(i / map.width);
      if (gid !== 0 && !meta.collisionGids.includes(gid) && !grass[i] && !skip.has(`${x},${y}`)) spots.push({ x, y });
    });
    areas.push({ areaId: meta.id, spots });
  }
  return areas;
}
