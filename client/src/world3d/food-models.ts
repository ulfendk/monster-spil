import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { KANAGAWA } from "../ui/theme";

/**
 * Food on the 3D map, modelled: an apple with its stalk and leaf, a strawberry with seeds and
 * a green cap, a curved banana, a carrot with its tuft, a bunch of grapes. Toon-shaded with an
 * ink outline like the monsters; about a tile across at scale 1, resting on the ground at y = 0.
 * Map3D uses one in place of a food icon (`icon-apple`, …) standing on the map.
 */

export const FOOD_MODEL_ICONS = ["apple", "strawberry", "banana", "carrot", "grapes", "potion", "healpotion", "healheart", "feather", "clover", "egg", "lantern", "bell", "fan", "shell", "crystal", "castle"] as const;
/** Models that stand still (no bobbing or turning): the castle. */
export const STILL_MODELS: ReadonlySet<string> = new Set(["castle"]);
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

/** A round glass flask of potion (red strength, green healing) with a cork. */
function flask(colour: number) {
  return () => {
    const glass = new THREE.SphereGeometry(0.16, 14, 10);
    glass.translate(0, 0.16, 0);
    const brew = new THREE.SphereGeometry(0.135, 14, 10, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65);
    brew.translate(0, 0.16, 0.012);
    const neck = new THREE.CylinderGeometry(0.05, 0.06, 0.1, 10);
    neck.translate(0, 0.33, 0);
    const cork = new THREE.CylinderGeometry(0.045, 0.04, 0.06, 8);
    cork.translate(0, 0.41, 0);
    return mergeGeometries([coloured(glass, KANAGAWA.fujiWhite), coloured(brew, colour), coloured(neck, KANAGAWA.fujiWhite), coloured(cork, KANAGAWA.boatYellow1)])!;
  };
}

/** A plump red heart standing up, with a white cross on each face: dropped after a won battle. */
function healheart(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const lobe = new THREE.SphereGeometry(0.11, 14, 10);
    lobe.scale(1, 1, 0.7);
    lobe.translate(side * 0.085, 0.3, 0);
    parts.push(coloured(lobe, KANAGAWA.autumnRed));
  }
  const point = new THREE.ConeGeometry(0.17, 0.26, 16, 1);
  point.scale(1.12, 1, 0.55);
  point.rotateZ(Math.PI);
  point.translate(0, 0.17, 0);
  parts.push(coloured(point, KANAGAWA.autumnRed));
  for (const face of [-1, 1]) {
    for (const [w, h] of [[0.035, 0.12], [0.12, 0.035]] as const) {
      const bar = new THREE.BoxGeometry(w, h, 0.02);
      bar.translate(0, 0.27, face * 0.075);
      parts.push(coloured(bar, KANAGAWA.fujiWhite));
    }
  }
  return mergeGeometries(parts)!;
}

function feather(): THREE.BufferGeometry {
  const vane = new THREE.SphereGeometry(0.1, 10, 6);
  vane.scale(0.6, 2.2, 0.15);
  vane.rotateZ(-0.6);
  vane.translate(0.05, 0.2, 0);
  const tip = new THREE.SphereGeometry(0.05, 8, 5);
  tip.scale(0.8, 1.4, 0.3);
  tip.rotateZ(-0.6);
  tip.translate(0.17, 0.37, 0);
  const quill = new THREE.CylinderGeometry(0.008, 0.01, 0.5, 4);
  quill.rotateZ(-0.6);
  quill.translate(0.03, 0.18, 0.01);
  return mergeGeometries([coloured(vane, KANAGAWA.fujiWhite), coloured(tip, KANAGAWA.crystalBlue), coloured(quill, KANAGAWA.boatYellow1)])!;
}

function clover(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const leaf = new THREE.SphereGeometry(0.08, 10, 6);
    leaf.scale(1, 0.25, 0.8);
    leaf.translate(0.08, 0, 0);
    leaf.rotateY((i / 4) * Math.PI * 2 + 0.4);
    leaf.translate(0, 0.3, 0);
    parts.push(coloured(leaf, KANAGAWA.springGreen));
  }
  const stalk = new THREE.CylinderGeometry(0.01, 0.014, 0.3, 4);
  stalk.translate(0, 0.15, 0);
  parts.push(coloured(stalk, KANAGAWA.autumnGreen));
  return mergeGeometries(parts)!;
}

/** A monster egg: speckled, standing on end. */
function egg(): THREE.BufferGeometry {
  const shell = new THREE.SphereGeometry(0.15, 16, 12);
  const pos = shell.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = y > 0 ? 1 - y * 1.3 : 1; // narrower at the top
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
    pos.setY(i, y * 1.35);
  }
  shell.computeVertexNormals();
  shell.translate(0, 0.2, 0);
  const parts = [coloured(shell, KANAGAWA.washi)];
  for (const [x, y, z] of [[0.1, 0.24, 0.06], [-0.06, 0.3, 0.09], [0.02, 0.14, 0.13], [-0.11, 0.18, -0.02], [0.05, 0.28, -0.1]] as const) {
    const spot = new THREE.SphereGeometry(0.022, 6, 4);
    spot.translate(x, y, z);
    parts.push(coloured(spot, KANAGAWA.boatYellow2));
  }
  return mergeGeometries(parts)!;
}

/** A red paper lantern with black bands and a glow. */
function lantern(): THREE.BufferGeometry {
  const body = new THREE.SphereGeometry(0.15, 14, 10);
  body.scale(1, 1.25, 1);
  body.translate(0, 0.26, 0);
  const parts = [coloured(body, KANAGAWA.autumnRed)];
  for (const y of [0.1, 0.42]) {
    const cap = new THREE.CylinderGeometry(0.08, 0.08, 0.04, 12);
    cap.translate(0, y, 0);
    parts.push(coloured(cap, KANAGAWA.sumiInk3));
  }
  for (const y of [0.2, 0.32]) {
    const band = new THREE.TorusGeometry(0.145, 0.01, 4, 16);
    band.rotateX(Math.PI / 2);
    band.translate(0, y, 0);
    parts.push(coloured(band, KANAGAWA.samuraiRed));
  }
  return mergeGeometries(parts)!;
}

/** A golden temple bell on a red cord. */
function bell(): THREE.BufferGeometry {
  const body = new THREE.LatheGeometry([new THREE.Vector2(0.01, 0.4), new THREE.Vector2(0.09, 0.38), new THREE.Vector2(0.12, 0.28), new THREE.Vector2(0.14, 0.14), new THREE.Vector2(0.19, 0.06), new THREE.Vector2(0.17, 0.05)], 16);
  const clapper = new THREE.SphereGeometry(0.04, 8, 6);
  clapper.translate(0, 0.04, 0);
  const cord = new THREE.TorusGeometry(0.04, 0.012, 4, 10);
  cord.translate(0, 0.44, 0);
  return mergeGeometries([coloured(body, KANAGAWA.carpYellow), coloured(clapper, KANAGAWA.boatYellow2), coloured(cord, KANAGAWA.autumnRed)])!;
}

/** A thin upright slab shaped like a slice of a disc (a fan, a shell): angles measured from straight up. */
function slab(radius: number, thickness: number, from: number, to: number, ridges = 0): THREE.BufferGeometry {
  // A cylinder slice, turned so its axis points at the camera side (z) and the slice stands upright.
  const g = new THREE.CylinderGeometry(radius, radius, thickness, 24, 1, false, Math.PI + from, to - from);
  g.rotateX(Math.PI / 2);
  if (ridges > 0) {
    const pos = g.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const r = Math.hypot(x, y);
      if (r < radius * 0.5) continue;
      const k = 1 + 0.06 * Math.cos(Math.atan2(y, x) * ridges);
      pos.setX(i, x * k);
      pos.setY(i, y * k);
    }
    g.computeVertexNormals();
  }
  return g;
}

/** An open folding fan, standing up. */
function fan(): THREE.BufferGeometry {
  const paper = slab(0.32, 0.02, -1.1, 1.1);
  paper.translate(0, 0.06, 0);
  const inner = slab(0.13, 0.03, -1.1, 1.1);
  inner.translate(0, 0.06, 0);
  const pin = new THREE.SphereGeometry(0.03, 8, 6);
  pin.translate(0, 0.06, 0.02);
  return mergeGeometries([coloured(paper, KANAGAWA.crystalBlue), coloured(inner, KANAGAWA.boatYellow1), coloured(pin, KANAGAWA.autumnRed)])!;
}

/** A pink scallop shell, standing on its hinge. */
function shell(): THREE.BufferGeometry {
  const body = slab(0.24, 0.06, -1.45, 1.45, 14);
  body.translate(0, 0.05, 0);
  const hinge = new THREE.BoxGeometry(0.12, 0.06, 0.07);
  hinge.translate(0, 0.03, 0);
  return mergeGeometries([coloured(body, KANAGAWA.sakuraPink), coloured(hinge, KANAGAWA.peachRed)])!;
}

/** A cluster of blue crystals. */
function crystal(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [x, z, h, tilt, colour] of [[0, 0, 0.42, 0, KANAGAWA.springBlue], [-0.12, 0.03, 0.26, 0.4, KANAGAWA.crystalBlue], [0.12, -0.02, 0.3, -0.35, KANAGAWA.crystalBlue], [0.02, 0.1, 0.2, 0.2, KANAGAWA.waveAqua2]] as const) {
    const c = new THREE.OctahedronGeometry(0.07, 0);
    c.scale(1, h / 0.14, 1);
    c.translate(0, h / 2, 0);
    c.rotateZ(tilt);
    c.translate(x, 0, z);
    parts.push(coloured(c, colour));
  }
  return mergeGeometries(parts)!;
}

/** A four-sided Japanese roof, eaves flaring out. */
function roof(width: number, height: number, y: number): THREE.BufferGeometry {
  const r = new THREE.ConeGeometry(width * 0.72, height, 4, 1);
  r.rotateY(Math.PI / 4);
  r.scale(1, 1, 0.85);
  r.translate(0, y + height / 2, 0);
  return r;
}

/** A Japanese castle: a sloping stone base, three tiers of white walls under blue-grey roofs, gold tips. */
function castle(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const base = new THREE.CylinderGeometry(0.2, 0.27, 0.16, 4, 1);
  base.rotateY(Math.PI / 4);
  base.translate(0, 0.08, 0);
  parts.push(coloured(base, KANAGAWA.katanaGray));
  // Tiers, bottom to top: [wall width, wall height, depth].
  let y = 0.16;
  const tiers = [[0.28, 0.16, 0.24], [0.2, 0.13, 0.17], [0.13, 0.11, 0.11]] as const;
  tiers.forEach(([w, h, d], i) => {
    const wall = new THREE.BoxGeometry(w, h, d);
    wall.translate(0, y + h / 2, 0);
    parts.push(coloured(wall, KANAGAWA.fujiWhite));
    // Windows on the front (south, +z): dark slits.
    for (const x of i === 2 ? [0] : [-w * 0.25, w * 0.25]) {
      const win = new THREE.BoxGeometry(0.025, h * 0.35, 0.01);
      win.translate(x, y + h * 0.5, d / 2 + 0.005);
      parts.push(coloured(win, KANAGAWA.sumiInk0));
    }
    const roofH = 0.07 + i * 0.015;
    parts.push(coloured(roof(w + 0.14, roofH, y + h - 0.02), KANAGAWA.waveBlue2));
    y += h + roofH - 0.04;
  });
  const gate = new THREE.BoxGeometry(0.07, 0.1, 0.01);
  gate.translate(0, 0.05, 0.27 * 0.72 + 0.005);
  parts.push(coloured(gate, KANAGAWA.sumiInk0));
  // The golden fish (shachihoko) on the ridge.
  for (const x of [-0.05, 0.05]) {
    const fish = new THREE.ConeGeometry(0.02, 0.07, 5);
    fish.translate(x, y + 0.06, 0);
    parts.push(coloured(fish, KANAGAWA.carpYellow));
  }
  return mergeGeometries(parts)!;
}

const BUILDERS: Record<FoodModelIcon, () => THREE.BufferGeometry> = {
  apple,
  strawberry,
  banana,
  carrot,
  grapes,
  potion: flask(KANAGAWA.autumnRed),
  healpotion: flask(KANAGAWA.springGreen),
  healheart,
  feather,
  clover,
  egg,
  lantern,
  bell,
  fan,
  shell,
  crystal,
  castle,
};
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
