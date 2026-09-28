import type * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { contentAssets } from "../content/load-assets";

/**
 * Monsters sculpted in Blender (tools/models, `npm run models`): each `creatures/<species
 * id>.glb` is loaded once, here, before any 3D scene can build a model — this module waits
 * for them at the top level, so every chunk that imports monster-model.ts waits too and
 * `buildMonsterModel` stays synchronous. A model that fails to load is skipped: that monster
 * is built the old way. They're meshopt-compressed and quantized (tools/models/build.py), so
 * each mesh sits in a node scaled back up to size.
 */
const models = new Map<string, THREE.Object3D>();

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
await Promise.all(
  Object.entries(contentAssets)
    .filter(([key]) => key.startsWith("creatures/") && key.endsWith(".glb"))
    .map(async ([key, url]) => {
      try {
        const gltf = await loader.loadAsync(url);
        models.set(key.slice("creatures/".length, -".glb".length), gltf.scene);
      } catch (e) {
        console.warn(`[models] ${key} didn't load`, e);
      }
    }),
);

/** The Blender model for a species, if it has one (shared: clone it before changing anything). */
export function blenderModel(speciesId: string): THREE.Object3D | undefined {
  return models.get(speciesId);
}
