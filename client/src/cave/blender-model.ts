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
 * pivots' `stageScale`, and vertex colours — the palette colour in RGB, baked shade in alpha.
 */
export function blenderBuilt(b: Builder, source: THREE.Object3D, species: CreatureSpecies, stage: number, variant: string | undefined): Built {
  const root = source.clone(true);
  b.root.add(root);

  const faces: Record<string, THREE.Object3D[]> = { open: [], shut: [], smile: [], talk: [] };
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    const grow = o.userData.stageScale as number | undefined;
    if (grow) o.scale.multiplyScalar(1 + grow * (stage - 1));
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
  const pair = (name: string) => [node(`${name}_L`), node(`${name}_R`)].filter((g): g is THREE.Group => g !== undefined);
  const body = node("body");
  const rig: MountRig | undefined = body && {
    body,
    feet: pair("foot"),
    arms: pair("arm"),
    ...(node("tail") ? { tail: node("tail")! } : {}),
    ...(node("head") ? { head: node("head")! } : {}),
    wings: pair("wing").map((pivot) => ({ pivot, side: pivot.name.endsWith("_L") ? -1 : 1, rest: pivot.rotation.clone() })),
  };

  b.root.updateMatrixWorld(true);
  const seatNode = root.getObjectByName("seat");
  const seat = seatNode ? b.root.worldToLocal(seatNode.getWorldPosition(new THREE.Vector3())) : new THREE.Vector3(0, 0.3, 0);

  const setFace = (face: "normal" | "blink" | "talk") => {
    for (const o of faces.open!) o.visible = face !== "blink";
    for (const o of faces.shut!) o.visible = face === "blink";
    for (const o of faces.smile!) o.visible = face !== "talk";
    for (const o of faces.talk!) o.visible = face === "talk";
  };
  setFace("normal");
  const ride = species.ride;
  return {
    face: setFace,
    seat,
    ...(rig ? { rig } : {}),
    ...(ride ? { gait: (ride === true ? "waddle" : ride) as Gait } : {}),
  };
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
