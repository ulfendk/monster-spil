import type { AreaMeta } from "../types/area.js";
import { regionAt } from "./regions.js";

/**
 * Where a wild battle (and catching) takes place: a 3D scene that fits the part of the map
 * you're in — a sunny meadow, a forest glade, a lake shore, the mountains, the dunes, snow,
 * a volcano, cherry blossom. The looks are content (shared/content/scenes.json): colours by
 * Kanagawa palette name, which scenery stands about (drawn by client/src/cave/scenery.ts)
 * and what drifts through the air. A region of a map (or a whole map) names its scene.
 */

export type SceneDecor = "pines" | "susuki" | "water" | "reeds" | "rocks" | "peaks" | "dunes" | "bamboo" | "sakura" | "snowPines" | "lava" | "mushrooms" | "ferns";
export const SCENE_DECOR: readonly SceneDecor[] = ["pines", "susuki", "water", "reeds", "rocks", "peaks", "dunes", "bamboo", "sakura", "snowPines", "lava", "mushrooms", "ferns"];
export type SceneParticles = "none" | "snow" | "petals" | "embers" | "leaves";
export const SCENE_PARTICLES: readonly SceneParticles[] = ["none", "snow", "petals", "embers", "leaves"];

export interface SceneLook {
  sky: string;
  fog: string;
  ground: string;
  hills: string;
  /** The big round sun low in the sky (a palette name); none without it. */
  sun?: string;
  /** How bright the daylight is (1 = a clear day). */
  light?: number;
  /** The daylight's colour (a palette name; default warm white) — a cool blue makes snow look like snow. */
  lightTint?: string;
  /** How far away the mist starts and where it's thick (metres; defaults 18 and 60). */
  fogNear?: number;
  fogFar?: number;
  decor: SceneDecor[];
  particles?: SceneParticles;
}

export interface SceneKind {
  id: string;
  navn: string;
  look: SceneLook;
}

export interface SceneConfig {
  /** The scene where no region or map names one. */
  default: string;
  kinds: SceneKind[];
}

/** The scene for a battle on this tile of this map: its region's, else the map's, else the default. */
export function sceneAt(meta: Pick<AreaMeta, "regions" | "scene">, x: number, y: number, config: SceneConfig): SceneKind {
  const id = regionAt(meta, x, y)?.scene ?? meta.scene ?? config.default;
  return config.kinds.find((k) => k.id === id) ?? config.kinds.find((k) => k.id === config.default) ?? config.kinds[0]!;
}
