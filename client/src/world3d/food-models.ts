import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { KANAGAWA } from "../ui/theme";

/**
 * Food on the 3D map, modelled: an apple with its stalk and leaf, a strawberry with seeds and
 * a green cap, a curved banana, a carrot with its tuft, a bunch of grapes. Toon-shaded with an
 * ink outline like the monsters; about a tile across at scale 1, resting on the ground at y = 0.
 * Map3D uses one in place of a food icon (`icon-apple`, …) standing on the map.
 */

export const FOOD_MODEL_ICONS = ["apple", "strawberry", "banana", "carrot", "grapes"] as const;
export type FoodModelIcon = (typeof FOOD_MODEL_ICONS)[number];

let gradient: THREE.DataTexture | undefined;
function toon(): THREE.DataTexture {
  if (gradient) return gradient;
  gradient = new THREE.DataTexture(new Uint8Array([110, 185, 255]), 3, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

function coloured(geometry: THREE.BufferGeometry, colour: number): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const c = new THREE.Color(colour);
  const colours = new Float32Array(g.attributes.position!.count * 3);
  for (let i = 0; i < colours.length; i += 3) colours.set([c.r, c.g, c.b], i);
  g.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  g.deleteAttribute("uv");
  return g;
}

function apple(): THREE.BufferGeometry {
  const body = new THREE.SphereGeometry(0.2, 16, 12);
  body.scale(1, 0.9, 1);
  body.translate(0, 0.18, 0);
  const stalk = new THREE.CylinderGeometry(0.012, 0.015, 0.08, 5);
  stalk.translate(0, 0.38, 0);
  const leaf = new THREE.SphereGeometry(0.05, 8, 4);
  leaf.scale(1.4, 0.25, 0.7);
  leaf.rotateZ(0.5);
  leaf.translate(0.05, 0.4, 0);
  return mergeGeometries([coloured(body, KANAGAWA.autumnRed), coloured(stalk, KANAGAWA.sumiInk5), coloured(leaf, KANAGAWA.springGreen)])!;
}

function strawberry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const berry = new THREE.SphereGeometry(0.17, 14, 10);
  // Pointed at the bottom: pull the lower half down into a cone-ish shape.
  const pos = berry.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 0) {
      const k = 1 + y / 0.17;
      pos.setX(i, pos.getX(i) * (0.35 + 0.65 * k));
      pos.setZ(i, pos.getZ(i) * (0.35 + 0.65 * k));
      pos.setY(i, y * 1.35);
    }
  }
  berry.computeVertexNormals();
  berry.translate(0, 0.24, 0);
  parts.push(coloured(berry, KANAGAWA.peachRed));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const seed = new THREE.SphereGeometry(0.014, 4, 3);
    seed.translate(Math.cos(a) * 0.155, 0.22 + (i % 2) * 0.07, Math.sin(a) * 0.155);
    parts.push(coloured(seed, KANAGAWA.carpYellow));
  }
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.ConeGeometry(0.035, 0.12, 4);
    leaf.rotateZ(Math.PI / 2);
    leaf.translate(0.07, 0, 0);
    leaf.rotateY((i / 5) * Math.PI * 2);
    leaf.translate(0, 0.4, 0);
    parts.push(coloured(leaf, KANAGAWA.autumnGreen));
  }
  return mergeGeometries(parts)!;
}

function banana(): THREE.BufferGeometry {
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.22, 0.14, 0), new THREE.Vector3(0, -0.02, 0), new THREE.Vector3(0.22, 0.16, 0));
  const body = new THREE.TubeGeometry(curve, 16, 0.065, 7, false);
  // Thinner towards the ends.
  const pos = body.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const t = Math.min(1, Math.abs(x) / 0.22);
    const c = curve.getPoint((x + 0.22) / 0.44);
    const k = 1 - 0.55 * t * t;
    pos.setY(i, c.y + (pos.getY(i) - c.y) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  body.computeVertexNormals();
  body.translate(0, 0.07, 0);
  const tip = new THREE.CylinderGeometry(0.018, 0.022, 0.05, 5);
  tip.rotateZ(0.9);
  tip.translate(0.24, 0.24, 0);
  return mergeGeometries([coloured(body, KANAGAWA.carpYellow), coloured(tip, KANAGAWA.sumiInk5)])!;
}

function carrot(): THREE.BufferGeometry {
  const root = new THREE.ConeGeometry(0.08, 0.4, 10);
  root.rotateZ(Math.PI / 2);
  root.translate(0.02, 0.08, 0);
  const parts = [coloured(root, KANAGAWA.surimiOrange)];
  for (const [a, h] of [[-0.4, 0.2], [0, 0.26], [0.4, 0.2]] as const) {
    const frond = new THREE.ConeGeometry(0.03, h, 4);
    frond.translate(0, h / 2, 0);
    frond.rotateZ(a + 1.2);
    frond.translate(-0.18, 0.08, 0);
    parts.push(coloured(frond, KANAGAWA.springGreen));
  }
  return mergeGeometries(parts)!;
}

function grapes(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rows = [[0.3, 3], [0.22, 3], [0.14, 2], [0.07, 1]] as const;
  rows.forEach(([y, n], r) => {
    for (let i = 0; i < n; i++) {
      const grape = new THREE.SphereGeometry(0.058, 10, 8);
      const x = (i - (n - 1) / 2) * 0.1;
      grape.translate(x, y, (r % 2) * 0.03);
      parts.push(coloured(grape, KANAGAWA.oniViolet));
    }
  });
  const stem = new THREE.CylinderGeometry(0.012, 0.015, 0.1, 5);
  stem.translate(0, 0.39, 0);
  const leaf = new THREE.SphereGeometry(0.07, 8, 4);
  leaf.scale(1.3, 0.2, 1);
  leaf.translate(0.06, 0.38, 0);
  parts.push(coloured(stem, KANAGAWA.sumiInk5), coloured(leaf, KANAGAWA.autumnGreen));
  return mergeGeometries(parts)!;
}

const BUILDERS: Record<FoodModelIcon, () => THREE.BufferGeometry> = { apple, strawberry, banana, carrot, grapes };
const cache = new Map<FoodModelIcon, THREE.BufferGeometry>();
let material: THREE.MeshToonMaterial | undefined;
let ink: THREE.MeshBasicMaterial | undefined;

/** A food model (shared geometry; the returned group is its own). */
export function buildFoodModel(icon: FoodModelIcon): THREE.Group {
  let geometry = cache.get(icon);
  if (!geometry) {
    geometry = BUILDERS[icon]();
    cache.set(icon, geometry);
  }
  material ??= new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon() });
  ink ??= new THREE.MeshBasicMaterial({ color: KANAGAWA.sumiInk0, side: THREE.BackSide });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, material));
  // The ink edge: a slightly bigger copy seen from inside.
  const edge = new THREE.Mesh(geometry, ink);
  edge.scale.setScalar(1.08);
  edge.position.y = -0.012;
  group.add(edge);
  return group;
}

/** The food drawn by an icon texture key (`icon-apple`), if it's one. */
export function foodModelFor(textureKey: string): FoodModelIcon | undefined {
  const name = textureKey.startsWith("icon-") ? textureKey.slice(5) : "";
  return (FOOD_MODEL_ICONS as readonly string[]).includes(name) ? (name as FoodModelIcon) : undefined;
}
