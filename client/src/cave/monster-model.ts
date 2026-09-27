import * as THREE from "three";
import type { CreatureSpecies, TypeId } from "@shared";
import { KANAGAWA } from "../ui/theme";
import { TYPE_COLOURS, bodyShape, speciesShade, type BossLook } from "../gfx/placeholder-sprites";
import { variantColour } from "../gfx/variants";

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
}

export interface MonsterModel {
  root: THREE.Group;
  setFace(face: "normal" | "blink" | "talk"): void;
  /** A flash of colour (a hit), or null to stop. */
  setTint(colour: number | null): void;
  setOpacity(opacity: number): void;
  dispose(): void;
}

const S = 1 / 128;
const INK = KANAGAWA.sumiInk0;
/** How thick the ink outline is (px, in the 128-px box). */
const OUTLINE = 2.2;

let gradient: THREE.DataTexture | undefined;
/** Three flat bands of light: shadow, mid, lit — woodblock, not glossy. */
function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  gradient = new THREE.DataTexture(new Uint8Array([95, 175, 255]), 3, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

function shade(colour: number, amount: number): number {
  const c = new THREE.Color(colour);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amount / 100)));
  return c.getHex();
}

/** A place on the model, from the picture's pixel coordinates (y down) and a depth in px. */
const P = (x: number, y: number, z = 0) => new THREE.Vector3((x - 64) * S, (64 - y) * S, z * S);

class Builder {
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
    const material = this.keep(new THREE.MeshToonMaterial({ color: recolour ? variantColour(colour, this.variant) : colour, gradientMap: toonGradient(), transparent: true }));
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

const sphere = () => new THREE.SphereGeometry(0.5, 20, 14);

export function buildMonsterModel(spec: MonsterModelSpec): MonsterModel {
  const b = new Builder(spec.variant);
  const face = spec.look === "serpent" ? serpent(b, spec.species) : spec.look === "eagle" ? eagle(b, spec.species) : creature(b, spec.species, spec.look === "dragon");
  return {
    root: b.root,
    setFace: face,
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

function creature(b: Builder, species: CreatureSpecies, dragon: boolean): (face: "normal" | "blink" | "talk") => void {
  const colour = shade(TYPE_COLOURS[species.type], dragon ? 0 : speciesShade(species.id) * 0.8);
  const { w, h } = bodyShape(species);
  const d = Math.min(w, h) * 0.8; // how deep the body is
  const cy = 128 - 12 - h / 2; // the body's middle (px, y down): feet near the bottom of the box
  const top = cy - h / 2;
  /** How far the body's surface sticks out towards the viewer at (x, y) — to put the face on it. */
  const front = (x: number, y: number) => (d / 2) * Math.sqrt(Math.max(0, 1 - ((x - 64) / (w / 2)) ** 2 - ((y - cy) / (h / 2)) ** 2));

  b.part(sphere(), colour, P(64, cy), new THREE.Vector3(w * S, h * S, d * S));
  b.part(sphere(), shade(colour, 12), P(64, cy + h * 0.2, d * 0.24), new THREE.Vector3(w * 0.6 * S, h * 0.46 * S, d * 0.55 * S), false);
  for (const side of [-1, 1]) b.part(sphere(), shade(colour, -14), P(64 + side * w * 0.26, cy + h / 2 - 3, d * 0.12), new THREE.Vector3(20 * S, 12 * S, 18 * S));
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
    typeFeature(b, species.type, top, w, d);
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
      eyes.push(b.flat(sphere(), INK, P(x, eyeY, z), new THREE.Vector3(11 * S, 14 * S, 6 * S)));
      eyes.push(b.flat(sphere(), KANAGAWA.washi, P(x + 2, eyeY - 3, z + 3), 5.2 * S));
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
  return (face) => {
    for (const e of eyes) e.visible = face !== "blink";
    for (const l of shut) l.visible = face === "blink";
    smile.visible = face !== "talk";
    if (fang) fang.visible = face !== "talk";
    open.visible = face === "talk";
  };
}

/** A teardrop flame (px), tip up, for the fire crest. */
function flameShape(height: number, width: number): Array<[number, number]> {
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
