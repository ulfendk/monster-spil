import * as THREE from "three";
import type { CreatureSpecies, TypeId } from "@shared";
import { KANAGAWA } from "../ui/theme";
import { TYPE_COLOURS, bodyShape, speciesShade, type BossLook } from "../gfx/placeholder-sprites";
import { variantColour } from "../gfx/variants";
import { flammeskael } from "./handmade/flammeskael";

/**
 * A monster in 3D, modelled after its placeholder picture (gfx/placeholder-sprites.ts) so it
 * is the same little yokai: a round body shaped by its stats (defence wider, HP taller) with
 * a lighter belly and two feet, a kawaii face (ink eyes with a glint, pink cheeks, a smile,
 * a fang for strong attackers), its type's head feature (a crest of fox-fire flames, wave
 * scales, two leaves and a bud, Raijin's zigzag horns, a rocky cap), a tail at the back —
 * and for the dragons' kind wings and horns, sand serpents in coils, eagles with spread wings.
 * Toon-shaded in a few flat bands and outlined in ink, like the woodblock pictures.
 *
 * Only for monsters drawn by the game: a kid's drawing stays the picture it is.
 *
 * Sizes: built inside the picture's 128-px box (x right, y up, z towards the viewer, the
 * origin at the box's middle), scaled by 1/128 — so a model of scale `size` fills the same
 * space as a picture sprite of that size. Its front (the face) looks along +z.
 */
export interface MonsterModelSpec {
  species: CreatureSpecies;
  look?: BossLook;
  variant?: string;
  /** Its evolution stage (1–3): later stages are richer in colour, with a bigger crest, a chest mark, and at 3 a mantle and a crown. */
  stage?: number;
}

export interface MonsterModel {
  root: THREE.Group;
  /** Where a rider sits (in the root's own units, before it's scaled). */
  seat: THREE.Vector3;
  /** Little movements of its own, if it has any (wings flapping, flames flickering): call every frame with the time in seconds. */
  tick?(seconds: number): void;
  setFace(face: "normal" | "blink" | "talk"): void;
  /** A flash of colour (a hit), or null to stop. */
  setTint(colour: number | null): void;
  setOpacity(opacity: number): void;
  dispose(): void;
}

export const S = 1 / 128;
export const INK = KANAGAWA.sumiInk0;
/** How thick the ink outline is (px, in the 128-px box). */
const OUTLINE = 2.2;

/**
 * How monsters are lit, whatever the scene's lights: a key light from the upper left in front,
 * a soft-edged shadow side (two tones, like a woodblock print), a highlight band, edges that
 * darken towards the silhouette and undersides in shade — so a round body reads as round —
 * and a touch of sky along the upper rim. `env` tints it all for the place (a cave is dimmer
 * and warmer); stages set it (`setMonsterEnvironment`).
 */
const monsterEnv = { value: new THREE.Color(1, 1, 1) };

export function setMonsterEnvironment(colour: number | THREE.Color = 0xffffff, strength = 1): void {
  monsterEnv.value.set(colour).multiplyScalar(strength);
}

const SHADE_GLSL = /* glsl */ `
  {
    vec3 n = normalize(normal);
    vec3 v = normalize(vViewPosition);
    float nl = dot(n, normalize(vec3(-0.5, 0.75, 0.55)));
    float lit = mix(0.6, 1.0, smoothstep(-0.08, 0.14, nl));
    lit += 0.06 * smoothstep(0.62, 0.78, nl);
    float rim = 1.0 - clamp(dot(n, v), 0.0, 1.0);
    lit *= 1.0 - 0.3 * smoothstep(0.4, 1.0, rim);
    lit *= 1.0 - 0.2 * clamp(-n.y, 0.0, 1.0);
    lit += 0.1 * smoothstep(0.62, 1.0, rim) * clamp(n.y, 0.0, 1.0);
    // Shaded in perceived brightness (the screen shows linear light compressed): the shadow side
    // reads as a shadow even on a bright red.
    outgoingLight = diffuseColor.rgb * pow(clamp(lit, 0.0, 1.25), 2.0) * monsterEnv + totalEmissiveRadiance;
  }
`;

/** A monster's own material (see above): a toon material whose light is worked out in its shader. */
export function monsterMaterial(colour: number): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ color: colour, transparent: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.monsterEnv = monsterEnv;
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", "uniform vec3 monsterEnv;\nvoid main() {")
      .replace("#include <opaque_fragment>", `${SHADE_GLSL}\n#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => "monster-shade-1";
  return material;
}

export function shade(colour: number, amount: number): number {
  const c = new THREE.Color(colour);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amount / 100)));
  return c.getHex();
}

/** A place on the model, from the picture's pixel coordinates (y down) and a depth in px. */
export const P = (x: number, y: number, z = 0) => new THREE.Vector3((x - 64) * S, (64 - y) * S, z * S);

export class Builder {
  readonly root = new THREE.Group();
  readonly materials: THREE.Material[] = [];
  readonly geometries: THREE.BufferGeometry[] = [];
  private readonly ink: THREE.MeshBasicMaterial;
  readonly toon: THREE.MeshToonMaterial[] = [];

  constructor(private readonly variant: string | undefined) {
    this.ink = this.keep(new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide, transparent: true }));
  }

  keep<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  /** A coloured, toon-shaded part (its colour turned as a rare variant's), outlined in ink unless `outline` is false. */
  part(geometry: THREE.BufferGeometry, colour: number, at: THREE.Vector3, scale: THREE.Vector3 | number = 1, outline = true, recolour = true): THREE.Mesh {
    this.geometries.push(geometry);
    const material = this.keep(monsterMaterial(recolour ? variantColour(colour, this.variant) : colour));
    this.toon.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(at);
    if (typeof scale === "number") mesh.scale.setScalar(scale);
    else mesh.scale.copy(scale);
    if (outline) {
      // The ink edge: the same shape a little bigger, drawn from inside (only its rim shows).
      const edge = new THREE.Mesh(geometry, this.ink);
      geometry.computeBoundingSphere();
      const r = geometry.boundingSphere!.radius * Math.max(mesh.scale.x, mesh.scale.y, mesh.scale.z);
      edge.scale.setScalar(1 + (OUTLINE * S) / Math.max(r, 0.01));
      mesh.add(edge);
    }
    this.root.add(mesh);
    return mesh;
  }

  /** A flat-coloured part that doesn't take the light (ink, eye glints, cheeks). */
  flat(geometry: THREE.BufferGeometry, colour: number, at: THREE.Vector3, scale: THREE.Vector3 | number = 1, opacity = 1): THREE.Mesh {
    this.geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, this.keep(new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity })));
    mesh.position.copy(at);
    if (typeof scale === "number") mesh.scale.setScalar(scale);
    else mesh.scale.copy(scale);
    this.root.add(mesh);
    return mesh;
  }

  /** An outline shape (px, y down) pushed out `depth` px, centred on itself. */
  shape(points: Array<[number, number]>, depth: number): THREE.BufferGeometry {
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x * S, -y * S)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: depth * S, bevelEnabled: true, bevelThickness: 1 * S, bevelSize: 1 * S, bevelSegments: 1 });
    g.center();
    return g;
  }
}

export const sphere = () => new THREE.SphereGeometry(0.5, 32, 22);

/** A body: a sphere a little fuller at the bottom and narrower at the top, like a sitting yokai. */
export function bodyGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.5, 36, 26);
  const pos = g.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = y < 0 ? 1 + 0.14 * Math.sin(-y * Math.PI) : 1 - 0.1 * y;
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

/** A small whole number from a species id: to vary ears and such from monster to monster. */
function idHash(id: string): number {
  let h = 7;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** What a model's builder gives back: how to change its face, where a rider sits, and its own movements. */
export interface Built {
  face: (face: "normal" | "blink" | "talk") => void;
  seat: THREE.Vector3;
  tick?: (seconds: number) => void;
}

/** Monsters with a model made by hand for them (from a drawing), by species id. */
const HANDMADE: Record<string, (b: Builder, species: CreatureSpecies, stage: number) => Built> = {
  ildflagrer: flammeskael,
};

export function buildMonsterModel(spec: MonsterModelSpec): MonsterModel {
  const b = new Builder(spec.variant);
  const handmade = HANDMADE[spec.species.id];
  const built: Built = handmade
    ? handmade(b, spec.species, spec.stage ?? 1)
    : spec.look === "serpent"
      ? { face: serpent(b, spec.species), seat: P(64, 30, -6) }
      : spec.look === "eagle"
        ? { face: eagle(b, spec.species), seat: P(64, 60, -4) }
        : creature(b, spec.species, spec.look === "dragon", spec.stage ?? 1);
  return {
    root: b.root,
    seat: built.seat,
    ...(built.tick ? { tick: built.tick } : {}),
    setFace: built.face,
    setTint(colour) {
      for (const m of b.toon) {
        m.emissive.setHex(colour ?? 0);
        m.emissiveIntensity = colour === null ? 0 : 0.7;
      }
    },
    setOpacity(opacity) {
      for (const m of b.materials) (m as THREE.MeshBasicMaterial).opacity = opacity;
    },
    dispose() {
      for (const g of b.geometries) g.dispose();
      for (const m of b.materials) m.dispose();
    },
  };
}

// ------------------------------------------------------------ an ordinary monster (or a dragon)

function creature(b: Builder, species: CreatureSpecies, dragon: boolean, stage: number): Built {
  // Later stages: a deeper, richer colour.
  const colour = shade(TYPE_COLOURS[species.type], (dragon ? 0 : speciesShade(species.id) * 0.8) - (stage - 1) * 7);
  const { w, h } = bodyShape(species);
  const d = Math.min(w, h) * 0.8; // how deep the body is
  const cy = 128 - 12 - h / 2; // the body's middle (px, y down): feet near the bottom of the box
  const top = cy - h / 2;
  /** How far the body's surface sticks out towards the viewer at (x, y) — to put the face on it. */
  const front = (x: number, y: number) => (d / 2) * Math.sqrt(Math.max(0, 1 - ((x - 64) / (w / 2)) ** 2 - ((y - cy) / (h / 2)) ** 2));

  b.part(bodyGeometry(), colour, P(64, cy), new THREE.Vector3(w * S, h * S, d * S));
  b.part(sphere(), shade(colour, 12), P(64, cy + h * 0.2, d * 0.24), new THREE.Vector3(w * 0.6 * S, h * 0.46 * S, d * 0.55 * S), false);
  for (const side of [-1, 1]) {
    // Feet: rounded paws with three toe bumps.
    const fx = 64 + side * w * 0.26;
    const fy = cy + h / 2 - 3;
    b.part(sphere(), shade(colour, -14), P(fx, fy, d * 0.12), new THREE.Vector3(20 * S, 12 * S, 20 * S));
    for (const t of [-1, 0, 1]) b.part(sphere(), shade(colour, -8), P(fx + t * 5.5, fy + 2, d * 0.12 + 9), new THREE.Vector3(6 * S, 6 * S, 6 * S), false);
    // Little arms at the sides, held forward.
    const arm = b.part(sphere(), shade(colour, -6), P(64 + side * w * 0.47, cy + h * 0.08, d * 0.16), new THREE.Vector3(11 * S, 20 * S, 12 * S));
    arm.rotation.set(-0.5, 0, side * 0.55);
  }
  if (!dragon && species.type !== "lyn" && species.type !== "sten") {
    // Ears, varying by monster: none, pointed or round.
    const style = idHash(species.id) % 3;
    for (const side of [-1, 1]) {
      const at = P(64 + side * w * 0.33, cy - h * 0.38, -d * 0.05);
      if (style === 1) {
        const ear = b.part(new THREE.ConeGeometry(0.5, 1, 12), shade(colour, -4), at, new THREE.Vector3(13 * S, 20 * S, 9 * S));
        ear.rotation.z = -side * 0.45;
        const inner = b.part(new THREE.ConeGeometry(0.5, 1, 10), KANAGAWA.sakuraPink, at.clone().add(new THREE.Vector3(side * -0.4 * S, -1.5 * S, 3.4 * S)), new THREE.Vector3(7 * S, 12 * S, 3 * S), false, false);
        inner.rotation.z = -side * 0.45;
      } else if (style === 2) {
        const ear = b.part(sphere(), shade(colour, -4), at, new THREE.Vector3(16 * S, 15 * S, 7 * S));
        ear.rotation.z = -side * 0.3;
        b.part(sphere(), KANAGAWA.sakuraPink, at.clone().add(new THREE.Vector3(0, 0, 3 * S)), new THREE.Vector3(9 * S, 8 * S, 2 * S), false, false);
      }
    }
  }
  // The tail, at the back.
  // (A cone points up; tipped over backwards it points away from the face, a little up and to the side.)
  const tail = b.part(new THREE.ConeGeometry(0.5, 1, 6), shade(colour, -8), P(64 + w * 0.12, cy + h * 0.22, -d * 0.52), new THREE.Vector3(12 * S, 26 * S, 12 * S));
  tail.rotation.set(-Math.PI / 2 - 0.45, 0, -0.35);

  if (dragon) {
    const wing = shade(colour, -24);
    for (const side of [-1, 1]) {
      const g = b.shape([[0, 0], [side * 42, -32], [side * 36, -8], [side * 42, 12], [side * 26, 22]], 3);
      const m = b.part(g, wing, P(64 + side * 34, cy - 8, -d * 0.35));
      m.rotation.y = side * 0.5;
    }
    for (const side of [-1, 1]) {
      const horn = b.part(new THREE.ConeGeometry(0.5, 1, 7), KANAGAWA.oldWhite, P(64 + side * w * 0.22, top - 4), new THREE.Vector3(12 * S, 28 * S, 12 * S));
      horn.rotation.z = -side * 0.25;
    }
  } else {
    // The type's crest (bigger at later stages, grown from where it sits on the head).
    const before = b.root.children.length;
    typeFeature(b, species.type, top, w, d);
    if (stage > 1) {
      const crest = new THREE.Group();
      const pivot = P(64, top + 6);
      crest.position.copy(pivot);
      for (const part of b.root.children.slice(before)) {
        part.position.sub(pivot);
        crest.add(part);
      }
      crest.scale.setScalar(1 + 0.3 * (stage - 1));
      b.root.add(crest);
    }
  }
  if (stage >= 2) {
    // A mark on the chest: a diamond in the type's light colour.
    const mark = b.part(new THREE.OctahedronGeometry(0.5, 0), shade(TYPE_COLOURS[species.type], 22), P(64, cy + h * 0.16, front(64, cy + h * 0.16) - 1), new THREE.Vector3(10 * S, 13 * S, 5 * S), false);
    mark.rotation.z = Math.PI / 4;
  }
  if (stage >= 3) {
    // A mantle over the shoulders and down the back, and a small golden crown.
    const mantle = b.part(new THREE.SphereGeometry(0.5, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), shade(colour, -18), P(64, cy + 2, -d * 0.12), new THREE.Vector3(w * 1.08 * S, h * 1.02 * S, d * 1.08 * S));
    mantle.rotation.x = Math.PI + 0.35;
    for (let i = -1; i <= 1; i++) {
      const spike = b.part(new THREE.ConeGeometry(0.5, 1, 5), KANAGAWA.carpYellow, P(64 + i * 8, top - 2 - (i === 0 ? 3 : 0), d * 0.18), new THREE.Vector3(6 * S, (i === 0 ? 14 : 10) * S, 6 * S));
      spike.rotation.z = -i * 0.25;
    }
  }

  // The face.
  const eyeY = cy - h * 0.08;
  const dx = Math.max(12, w * 0.19);
  const eyes: THREE.Object3D[] = [];
  const shut: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const x = 64 + side * dx;
    const z = front(x, eyeY) + 1;
    if (dragon) {
      eyes.push(b.flat(sphere(), KANAGAWA.carpYellow, P(x, eyeY, z), new THREE.Vector3(13 * S, 15 * S, 5 * S)));
      eyes.push(b.flat(sphere(), INK, P(x, eyeY, z + 2), new THREE.Vector3(4 * S, 12 * S, 3 * S)));
    } else {
      eyes.push(b.flat(sphere(), INK, P(x, eyeY, z), new THREE.Vector3(11 * S, 14 * S, 8 * S)));
      eyes.push(b.flat(sphere(), KANAGAWA.washi, P(x + 2, eyeY - 3, z + 4), 5.2 * S));
      eyes.push(b.flat(sphere(), KANAGAWA.washi, P(x - 2.5, eyeY + 3, z + 3.5), 2.2 * S, 0.8));
    }
    // Shut: a happy curve where the eye was (hidden until a blink).
    const lid = b.flat(new THREE.TorusGeometry(5.5 * S, 1.3 * S, 5, 10, Math.PI * 0.7), INK, P(x, eyeY + 1, z + 1));
    lid.rotation.z = Math.PI * 1.15;
    lid.visible = false;
    shut.push(lid);
    b.flat(sphere(), KANAGAWA.sakuraPink, P(x + side * 8, eyeY + 11, front(x + side * 8, eyeY + 11) + 0.5), new THREE.Vector3(12 * S, 6 * S, 2 * S), 0.85);
  }
  const mouthY = eyeY + 8;
  const mouthZ = front(64, mouthY) + 1;
  const smile = b.flat(new THREE.TorusGeometry(5 * S, 1.2 * S, 5, 10, Math.PI * 0.7), INK, P(64, mouthY, mouthZ));
  smile.rotation.z = Math.PI * 1.15;
  const open = new THREE.Group();
  open.add(b.flat(sphere(), INK, P(64, eyeY + 13, front(64, eyeY + 13) + 1), new THREE.Vector3(13 * S, 12 * S, 4 * S)));
  open.add(b.flat(sphere(), KANAGAWA.sakuraPink, P(64, eyeY + 16, front(64, eyeY + 16) + 2.5), new THREE.Vector3(8 * S, 5 * S, 2 * S)));
  b.root.add(open);
  open.visible = false;
  let fang: THREE.Object3D | undefined;
  if (species.baseStats.angreb >= 13 || dragon) {
    fang = b.flat(new THREE.ConeGeometry(2.5 * S, 6 * S, 4), KANAGAWA.washi, P(67, eyeY + 13, front(67, eyeY + 13) + 1.5));
    fang.rotation.x = Math.PI;
  }
  return {
    face: (face) => {
      for (const e of eyes) e.visible = face !== "blink";
      for (const l of shut) l.visible = face === "blink";
      smile.visible = face !== "talk";
      if (fang) fang.visible = face !== "talk";
      open.visible = face === "talk";
    },
    // On top, a little behind the crest.
    seat: P(64, top + h * 0.1, -d * 0.2),
  };
}

/** A teardrop flame (px), tip up, for the fire crest. */
export function flameShape(height: number, width: number): Array<[number, number]> {
  return [[0, -height], [width * 0.3, -height * 0.55], [width * 0.5, -height * 0.2], [width * 0.3, 0], [-width * 0.3, 0], [-width * 0.5, -height * 0.2], [-width * 0.3, -height * 0.55]];
}

function typeFeature(b: Builder, type: TypeId, top: number, w: number, d: number): void {
  switch (type) {
    case "ild": {
      // A crest of three flames (fox-fire), orange with yellow hearts.
      for (const [dx, h, fw] of [[-13, 24, 16], [13, 24, 16], [0, 34, 20]] as const) {
        b.part(b.shape(flameShape(h, fw), 6), KANAGAWA.surimiOrange, P(64 + dx, top + 10 - h / 2, 0));
        b.part(b.shape(flameShape(h * 0.55, fw * 0.5), 7), KANAGAWA.carpYellow, P(64 + dx, top + 9 - h * 0.28, 1.5), 1, false, false);
      }
      break;
    }
    case "vand": {
      // A crest of wave scales (seigaiha), each a half-disc with white rings on it.
      for (const [dx, r] of [[-11, 12], [11, 12], [0, 15]] as const) {
        const scale = b.part(new THREE.CylinderGeometry(r * S, r * S, 7 * S, 16, 1, false, -Math.PI / 2, Math.PI), KANAGAWA.waveBlue2, P(64 + dx, top + 8, dx === 0 ? -2 : 0));
        scale.rotation.x = Math.PI / 2;
        for (const k of [0.72, 0.42]) {
          const ring = b.flat(new THREE.TorusGeometry(r * k * S, 1 * S, 4, 12, Math.PI), KANAGAWA.fujiWhite, P(64 + dx, top + 8, (dx === 0 ? -2 : 0) + 4));
          ring.rotation.z = 0;
        }
      }
      break;
    }
    case "graes": {
      // Two leaves sprouting from the head, and a small pink bud between them.
      for (const side of [-1, 1]) {
        const leaf = b.part(sphere(), KANAGAWA.autumnGreen, P(64 + side * 12, top - 6), new THREE.Vector3(32 * S, 12 * S, 6 * S));
        leaf.rotation.z = side * 0.6;
      }
      b.part(sphere(), KANAGAWA.sakuraPink, P(64, top - 2), 10 * S);
      break;
    }
    case "lyn": {
      // Zigzag horns, like Raijin's.
      for (const side of [-1, 1]) {
        const pts: Array<[number, number]> = [[-5, 8], [side * 2, -8], [-side * 5, -8], [side * 4, -26], [side * 2, -12], [side * 9, -12], [5, 8]];
        b.part(b.shape(pts, 5), KANAGAWA.carpYellow, P(64 + side * w * 0.22, top - 7, 0));
      }
      break;
    }
    case "sten": {
      // A rocky cap of plates, with a little moss.
      const cap = b.part(new THREE.DodecahedronGeometry(0.5), KANAGAWA.katanaGray, P(64, top), new THREE.Vector3(w * 0.78 * S, 22 * S, d * 0.8 * S));
      cap.rotation.y = 0.4;
      b.part(sphere(), KANAGAWA.autumnGreen, P(64 - w * 0.2, top - 6, d * 0.2), 6 * S, false);
      b.part(sphere(), KANAGAWA.autumnGreen, P(64 + w * 0.24, top - 2, d * 0.18), 5 * S, false);
      break;
    }
  }
}

// ------------------------------------------------------------ a sand serpent

function serpent(b: Builder, species: CreatureSpecies): (face: "normal" | "blink" | "talk") => void {
  const colour = shade(TYPE_COLOURS[species.type], -6);
  const coils = [{ y: 106, w: 104, h: 30 }, { y: 86, w: 86, h: 26 }, { y: 68, w: 66, h: 22 }];
  for (const c of coils) {
    const coil = b.part(new THREE.TorusGeometry((c.w / 2 - c.h / 2) * S, (c.h / 2) * S, 10, 24), colour, P(64, c.y));
    coil.rotation.x = Math.PI / 2;
    coil.scale.z = 0.9;
  }
  b.part(new THREE.CylinderGeometry(8 * S, 10 * S, 24 * S, 10), colour, P(64, 54));
  b.part(sphere(), shade(colour, -5), P(64, 32, -3), new THREE.Vector3(60 * S, 44 * S, 14 * S));
  b.part(sphere(), colour, P(64, 32, 3), new THREE.Vector3(36 * S, 32 * S, 26 * S));
  const eyes: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    eyes.push(b.flat(sphere(), KANAGAWA.carpYellow, P(64 + side * 8, 30, 15), new THREE.Vector3(10 * S, 11 * S, 4 * S)));
    eyes.push(b.flat(sphere(), INK, P(64 + side * 8, 30, 17), new THREE.Vector3(3 * S, 9 * S, 2 * S)));
  }
  const tongue = b.flat(new THREE.ConeGeometry(1.5 * S, 12 * S, 4), KANAGAWA.autumnRed, P(64, 50, 14));
  tongue.rotation.x = Math.PI;
  for (const e of eyes) e.userData.open = e.scale.y;
  return (face) => {
    for (const e of eyes) e.scale.y = face === "blink" ? (e.userData.open as number) * 0.15 : (e.userData.open as number);
    tongue.visible = face !== "blink";
  };
}

// ------------------------------------------------------------ a giant eagle

function eagle(b: Builder, species: CreatureSpecies): (face: "normal" | "blink" | "talk") => void {
  const body = shade(TYPE_COLOURS[species.type], -30);
  const wing = shade(body, -16);
  for (const side of [-1, 1]) {
    const pts: Array<[number, number]> = [[side * 0, -16], [side * 26, -38], [side * 48, -34]];
    for (let f = 0; f < 5; f++) pts.push([side * (48 - f * 4), -22 + f * 9], [side * (38 - f * 5), -18 + f * 9]);
    pts.push([side * 2, 16]);
    const m = b.part(b.shape(pts, 3), wing, P(64 + side * 30, 70, -10));
    m.rotation.y = side * 0.35;
  }
  b.part(sphere(), body, P(64, 76), new THREE.Vector3(44 * S, 58 * S, 38 * S));
  b.part(sphere(), shade(body, 16), P(64, 86, 10), new THREE.Vector3(26 * S, 30 * S, 22 * S), false);
  b.part(sphere(), KANAGAWA.fujiWhite, P(64, 38), new THREE.Vector3(34 * S, 30 * S, 30 * S));
  const beak = b.part(new THREE.ConeGeometry(6 * S, 14 * S, 6), KANAGAWA.carpYellow, P(64, 46, 16));
  beak.rotation.x = Math.PI / 2 + 0.5;
  for (const side of [-1, 1]) b.part(new THREE.CylinderGeometry(1.8 * S, 1.8 * S, 16 * S, 5), KANAGAWA.carpYellow, P(64 + side * 12, 110), 1, false);
  const eyes: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    eyes.push(b.flat(sphere(), KANAGAWA.surimiOrange, P(64 + side * 7, 35, 13), new THREE.Vector3(9 * S, 9 * S, 4 * S)));
    eyes.push(b.flat(sphere(), INK, P(64 + side * 7, 35, 15), 5.6 * S));
  }
  return (face) => {
    for (const e of eyes) e.visible = face !== "blink";
  };
}
