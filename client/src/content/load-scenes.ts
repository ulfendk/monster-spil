import type { SceneConfig, SceneKind } from "@shared";
import config from "../../../shared/content/scenes.json";

/** Where wild battles and catching take place (shared/content/scenes.json). */
export const sceneConfig = config as SceneConfig;

/** A scene by id, or the default one. */
export function sceneKind(id: string | undefined): SceneKind {
  return sceneConfig.kinds.find((k) => k.id === id) ?? sceneConfig.kinds.find((k) => k.id === sceneConfig.default) ?? sceneConfig.kinds[0]!;
}
