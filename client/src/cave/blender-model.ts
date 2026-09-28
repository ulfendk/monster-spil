import * as THREE from "three";
import type { CreatureSpecies } from "@shared";
import { variantColour } from "../gfx/variants";
import type { Gait } from "../world3d/mount-gaits";
import { Builder, S, monsterMaterial, shade, type Built, type MountRig } from "./monster-model";

/**
 * A monster sculpted in Blender (tools/models; loaded by glb-models.ts), made into a monster
 * model like any other: every part gets the monsters' own toon light and ink outline, rare
 * variants recolour it, and it blinks, cries, evolves and is ridden. What the .glb carries
 * (see tools/models/lib/model.py): pivots by name (`body`, `foot_L`, `wing_R`, `seat`…),
 * each mesh's `role`, `outline`, `opacity`, `face`, `minStage`/`maxStage` and `stageShade`,
 * pivots' `stageScale`, `flicker` (a flame, flickering about its base) and `sway` (a leaf,
 * swaying about its stem) and `ridden` (0: only when nobody rides it, 1: only when ridden),
 * a `seat_ride` for a rider if it isn't `seat`, the model's own `gait`, `hips`, `view` and
 * `flap` (how far its wings beat by themselves, `flapRate` how fast) and `fit` (0: not fitted
 * to the picture's box), and vertex colours — the
 * palette colour in RGB, baked shade in alpha.
 */
export function blenderBuilt(b: Builder, source: THREE.Object3D, species: CreatureSpecies, stage: number, variant: string | undefined, pose?: "ride"): Built {
  const root = source.clone(true);
  b.root.add(root);

  const faces: Record<string, THREE.Object3D[]> = { open: [], shut: [], smile: [], talk: [] };
  const meshes: THREE.Mesh[] = [];
  const flames: Array<{ o: THREE.Object3D; scale: THREE.Vector3 }> = [];
  const leaves: Array<{ o: THREE.Object3D; rest: THREE.Euler; k: number }> = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    const grow = o.userData.stageScale as number | undefined;
    if (grow) o.scale.multiplyScalar(1 + grow * (stage - 1));
    if (o.userData.flicker) flames.push({ o, scale: o.scale.clone() });
    if (o.userData.sway) leaves.push({ o, rest: o.rotation.clone(), k: o.userData.sway as number });
  });
  // (The model's own settings sit on its top node.)
  const own = (root.children[0]?.userData ?? {}) as { gait?: Gait; hips?: number; view?: number; flap?: number; flapRate?: number; fit?: number };
  const ridden = pose === "ride";
  root.traverse((o) => {
    if (o.userData.ridden !== undefined && Boolean(o.userData.ridden) !== ridden) o.visible = false;
  });
  for (const mesh of meshes) {
    const ud = mesh.userData;
    if (stage < ((ud.minStage as number | undefined) ?? 1) || stage > ((ud.maxStage as number | undefined) ?? 3)) {
      mesh.removeFromParent();
      continue;
    }
    const toon = ud.role !== "flat";
    const geometry = mesh.geometry.clone();
    b.geometries.push(geometry);
    colourVertices(geometry, (hex) => (toon ? variantColour(ud.stageShade ? shade(hex, -7 * (stage - 1)) : hex, variant) : hex));
    mesh.geometry = geometry;
    if (toon) {
      const material = b.keep(monsterMaterial(0xffffff));
      material.vertexColors = true;
      b.toon.push(material);
      mesh.material = material;
      // (In the mesh's own units: quantized, it's scaled back up by its node.)
      if (ud.outline !== 0) b.inkShell(inflated(geometry, (b.outlinePx * S) / mesh.scale.x), mesh);
    } else {
      const opacity = (ud.opacity as number | undefined) ?? 1;
      mesh.material = b.keep(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity, depthWrite: opacity >= 1 }));
    }
    const face = ud.face as string | undefined;
    if (face && faces[face]) faces[face].push(mesh);
  }

  const node = (name: string) => group(root.getObjectByName(name));
  // Left and right (`foot_L`, `foot_R`), or numbered (`foot_0`…; four legs: front left, front
  // right, back right, back left — so the diagonals step together).
  const pair = (name: string) => {
    const lr = [node(`${name}_L`), node(`${name}_R`)];
    const numbered = Array.from({ length: 8 }, (_, i) => node(`${name}_${i}`));
    return [...lr, ...numbered].filter((g): g is THREE.Group => g !== undefined);
  };
  const body = node("body");
  const rig: MountRig | undefined = body && {
    body,
    feet: pair("foot"),
    arms: pair("arm"),
    ...(node("tail") ? { tail: node("tail")! } : {}),
    ...(node("head") ? { head: node("head")! } : {}),
    ...(own.hips ? { hips: true } : {}),
    wings: pair("wing").map((pivot) => ({ pivot, side: pivot.name.endsWith("_L") ? -1 : 1, rest: pivot.rotation.clone() })),
  };

  // (`fit: 0`: sized by hand, as drawn — wings reaching past the box.)
  if (own.fit !== 0) fit(root, body ? body.getWorldPosition(new THREE.Vector3()).y : -0.5 + 12 / 128);
  b.root.updateMatrixWorld(true);
  const seatNode = (ridden ? root.getObjectByName("seat_ride") : undefined) ?? root.getObjectByName("seat");
  const seat = seatNode ? b.root.worldToLocal(seatNode.getWorldPosition(new THREE.Vector3())) : new THREE.Vector3(0, 0.3, 0);

  const setFace = (face: "normal" | "blink" | "talk") => {
    for (const o of faces.open!) o.visible = face !== "blink";
    for (const o of faces.shut!) o.visible = face === "blink";
    for (const o of faces.smile!) o.visible = face !== "talk";
    for (const o of faces.talk!) o.visible = face === "talk";
  };
  setFace("normal");
  const ride = species.ride;
  const gait = own.gait ?? (ride ? ((ride === true ? "waddle" : ride) as Gait) : undefined);
  const wings = rig?.wings ?? [];
  const flap = own.flap ?? 0.12;
  const moving = flames.length + leaves.length + wings.length > 0;
  return {
    face: setFace,
    seat,
    ...(rig ? { rig } : {}),
    ...(gait ? { gait } : {}),
    ...(own.view !== undefined ? { view: own.view } : {}),
    ...(moving
      ? {
          tick: (t: number) => {
            // (As the game's own flames flicker: anatomy/kit.ts `flicker`.)
            flames.forEach(({ o, scale }, i) => {
              const k = 1 + Math.sin(t * 11 + i * 1.7) * 0.08 + Math.sin(t * 17 + i) * 0.05;
              o.scale.set(scale.x / Math.sqrt(k), scale.y * k, scale.z / Math.sqrt(k));
            });
            // Wings beat by themselves — unless a flight is beating them.
            for (const w of wings) {
              if (w.pivot.userData.driven) continue;
              const beat = Math.sin(t * (own.flapRate ?? 3)) * flap;
              w.pivot.rotation.set(w.rest.x, w.rest.y + w.side * beat, w.rest.z + w.side * beat * 0.4);
            }
            leaves.forEach(({ o, rest, k }, i) => o.rotation.set(rest.x + Math.sin(t * 1.3 + i * 2.1) * 0.06 * k, rest.y, rest.z + Math.sin(t * 1.7 + i) * 0.1 * k));
          },
        }
      : {}),
  };
}

/**
 * Scaled to fill the picture's box like the game's own monsters (anatomy/index.ts `fitToBox`):
 * as wide as fits, feet on the ground (`ground`, the body pivot's height), centred across.
 */
function fit(root: THREE.Object3D, ground: number): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh.material as THREE.Material).side === THREE.BackSide) return;
    mesh.geometry.computeBoundingBox();
    box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld));
  });
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const k = Math.max(0.6, Math.min(0.9 / size.x, (0.5 - 0.03 - ground) / Math.max(0.05, box.max.y - ground), 1.5));
  root.scale.setScalar(k);
  root.position.set((-k * (box.min.x + box.max.x)) / 2, ground * (1 - k), 0);
}

/** Vertex colours from the .glb (palette colour in RGB, shade in alpha) → the colours to draw, each palette colour passed through `recolour`. */
function colourVertices(geometry: THREE.BufferGeometry, recolour: (hex: number) => number): void {
  const source = geometry.getAttribute("color");
  if (!source) return;
  const out = new Float32Array(source.count * 3);
  const cache = new Map<number, THREE.Color>();
  const c = new THREE.Color();
  for (let i = 0; i < source.count; i++) {
    const hex = c.setRGB(source.getX(i), source.getY(i), source.getZ(i)).getHex();
    let colour = cache.get(hex);
    if (!colour) cache.set(hex, (colour = new THREE.Color(recolour(hex))));
    const ao = source.itemSize === 4 ? source.getW(i) : 1;
    out[i * 3] = colour.r * ao;
    out[i * 3 + 1] = colour.g * ao;
    out[i * 3 + 2] = colour.b * ao;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(out, 3));
}

/** The same shape pushed out along its normals (for the ink outline: smooth all round, unlike a scaled copy). */
function inflated(geometry: THREE.BufferGeometry, by: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    out[i * 3] = pos.getX(i) + normal.getX(i) * by;
    out[i * 3 + 1] = pos.getY(i) + normal.getY(i) * by;
    out[i * 3 + 2] = pos.getZ(i) + normal.getZ(i) * by;
  }
  g.setAttribute("position", new THREE.BufferAttribute(out, 3));
  if (geometry.index) g.setIndex(geometry.index);
  return g;
}

/** A pivot as a THREE.Group (glTF's empty nodes load as plain Object3Ds), in its place with its children. */
function group(o: THREE.Object3D | undefined): THREE.Group | undefined {
  if (!o) return undefined;
  if ((o as THREE.Group).isGroup) return o as THREE.Group;
  const g = new THREE.Group();
  g.name = o.name;
  g.userData = o.userData;
  g.position.copy(o.position);
  g.quaternion.copy(o.quaternion);
  g.scale.copy(o.scale);
  o.parent?.add(g);
  for (const child of [...o.children]) g.add(child);
  o.removeFromParent();
  return g;
}
