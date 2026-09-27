import * as THREE from "three";
import type { CreatureSpecies } from "@shared";
import { KANAGAWA } from "../../ui/theme";
import { Builder, INK, P, S, bodyGeometry, shade, sphere, type Built } from "../monster-model";

/**
 * Flammeskæl, made by hand after the drawing it came from (docs/drawings/ildflagrer.jpg):
 * a pale egg of a body that is all head, angry red eyes, two nostrils, a wide mouth full of
 * sharp teeth with a forked red tongue hanging out, four little yellow horns on the brow, a
 * mane of flames with blue tips standing up from the head, two big yellow bat wings (finger
 * bones, a scalloped edge, a hooked claw at the wrist) and a long thin tail curling up to a
 * burning torch of a tip. It hovers: no feet. The wings beat and the flames flicker (`tick`).
 * At stage 2 (Flammedrage) the wings, mane and horns are bigger and the body warmer.
 */

const K = KANAGAWA;
const CX = 64;
const CY = 80;
const W = 44;
const H = 54;
const D = 40;
const TOP = CY - H / 2;

/** How far the egg's surface sticks out towards the viewer at (x, y) px. */
function front(x: number, y: number): number {
  return (D / 2) * Math.sqrt(Math.max(0, 1 - ((x - CX) / (W / 2)) ** 2 - ((y - CY) / (H / 2)) ** 2));
}

/** A flat shape (px, y down, relative to its own origin) pushed out `depth` px, not centred: its origin stays where (0, 0) is. */
function slab(points: Array<[number, number]>, depth: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x * S, -y * S)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: depth * S, bevelEnabled: true, bevelThickness: 0.8 * S, bevelSize: 0.8 * S, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, (-depth / 2) * S);
  return g;
}

/** A thin rod from `a` to `b` (a bone, a tongue). */
function rod(b: Builder, a: THREE.Vector3, to: THREE.Vector3, radius: number, colour: number, outline = true): THREE.Mesh {
  const length = a.distanceTo(to);
  const mesh = b.part(new THREE.CylinderGeometry(radius * S, radius * S, length, 8), colour, a.clone().lerp(to, 0.5), 1, outline);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(a).normalize());
  return mesh;
}

/** Moves a part (made in the root) into a group, at the same coordinates — now the group's own. */
function into(group: THREE.Object3D, mesh: THREE.Object3D): void {
  group.add(mesh);
}

/** A round flame (px): a teardrop turned on a lathe, its base at y = 0, pointing up. */
function teardrop(height: number, width: number, from = 0): THREE.BufferGeometry {
  const profile: Array<[number, number]> = [[0, 0], [0.34, 0.08], [0.5, 0.26], [0.44, 0.48], [0.28, 0.7], [0.12, 0.88], [0, 1]];
  const points = profile.filter(([, y]) => y > from + 0.001).map(([r, y]) => new THREE.Vector2(r * width * S, y * height * S));
  if (from > 0) {
    // Cut across at `from`: start from the middle, out to the teardrop's width there.
    const i = profile.findIndex(([, y]) => y > from);
    const [r0, y0] = profile[i - 1]!;
    const [r1, y1] = profile[i]!;
    const r = r0 + ((r1 - r0) * (from - y0)) / (y1 - y0);
    points.unshift(new THREE.Vector2(0, from * height * S), new THREE.Vector2(r * width * S, from * height * S));
  }
  return new THREE.LatheGeometry(points, 12);
}

/** A flame like the crayon ones in the drawing: orange, a yellow heart and a red streak showing, a small blue tip. */
function flame(b: Builder, group: THREE.Group, at: THREE.Vector3, height: number, width: number, lean: number): THREE.Group {
  const f = new THREE.Group();
  f.position.copy(at);
  f.rotation.z = lean;
  group.add(f);
  const body = b.part(teardrop(height, width), K.surimiOrange, new THREE.Vector3());
  // The blue tip: the top of the same teardrop, a hair bigger, over it.
  const tip = b.part(teardrop(height, width * 1.1, 0.72), K.crystalBlue, new THREE.Vector3(0, 0.01 * height * S, 0), 1, false);
  const heart = b.part(teardrop(height * 0.5, width * 0.55), K.carpYellow, new THREE.Vector3(0, 0, width * 0.2 * S), 1, false);
  const streak = b.part(teardrop(height * 0.72, width * 0.3), K.autumnRed, new THREE.Vector3(width * 0.14 * S, height * 0.08 * S, width * 0.26 * S), 1, false);
  for (const m of [body, tip, heart, streak]) f.add(m);
  return f;
}

export function flammeskael(b: Builder, _species: CreatureSpecies, stage: number): Built {
  const grown = 1 + 0.22 * (stage - 1);
  // The body: pale peach, warmer at stage 2.
  const skin = new THREE.Color(K.fujiWhite).lerp(new THREE.Color(K.sakuraPink), 0.28).lerp(new THREE.Color(K.surimiOrange), 0.08 + 0.1 * (stage - 1)).getHex();
  b.part(bodyGeometry(), skin, P(CX, CY), new THREE.Vector3(W * S, H * S, D * S));

  // ---- the wings: behind the body, swept back a little, beating.
  const wingColour = K.carpYellow;
  const boneColour = shade(K.boatYellow2, -6);
  const wings: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.copy(P(CX + side * 17, CY + 2, -8));
    wing.rotation.y = side * 0.25;
    wing.scale.setScalar(grown);
    b.root.add(wing);
    // Its outline: from the shoulder up to the tip along the arm, then back down the scalloped edge.
    const pts: Array<[number, number]> = [
      [0, -2], [18, -22], [52, -44], // the arm along the leading edge, to the tip
      [44, -27], [58, -18], // the edge between the finger bones curves in: scallops
      [44, -9], [46, 2],
      [33, 1], [26, 14],
      [14, 6], [4, 10],
    ];
    const membrane = b.part(slab(pts.map(([x, y]) => [x * side, y]), 2.4), wingColour, new THREE.Vector3());
    into(wing, membrane);
    // The arm bone along the leading edge, and finger bones from the wrist to each point.
    const wrist = new THREE.Vector3(18 * side * S, 22 * S, 0.5 * S);
    const shoulder = new THREE.Vector3(0, 4 * S, 0.5 * S);
    const tipAt = (x: number, y: number) => new THREE.Vector3(x * side * S, -y * S, 0.6 * S);
    const bones: THREE.Mesh[] = [rod(b, shoulder, wrist, 1.8, boneColour, false), rod(b, wrist, tipAt(52, -44), 1.4, boneColour, false)];
    for (const [x, y] of [[58, -18], [46, 2], [26, 14]] as const) bones.push(rod(b, wrist, tipAt(x, y), 1, boneColour, false));
    for (const bone of bones) into(wing, bone);
    // The hooked claw at the wrist, pointing up.
    const claw = b.part(new THREE.ConeGeometry(0.5, 1, 8), K.carpYellow, new THREE.Vector3(), new THREE.Vector3(4 * S, 10 * S, 4 * S));
    claw.position.copy(wrist).add(new THREE.Vector3(0, 5 * S, 0));
    claw.rotation.z = -side * 0.5;
    into(wing, claw);
    wings.push(wing);
  }

  // ---- the tail: from low on the back, curling out and up to a burning tip.
  const curve = new THREE.CatmullRomCurve3([P(CX + 12, CY + 20, -12), P(CX + 30, CY + 12, -18), P(CX + 44, CY - 12, -16), P(CX + 50, CY - 42, -10), P(CX + 52, CY - 56, -6)]);
  b.part(new THREE.TubeGeometry(curve, 28, 2.2 * S, 8), shade(skin, -10), new THREE.Vector3());
  const torch = new THREE.Group();
  b.root.add(torch);
  const torchFlames = [flame(b, torch, P(CX + 52, CY - 56, -6), 18, 12, -0.15), flame(b, torch, P(CX + 48, CY - 55, -7), 12, 8, 0.55), flame(b, torch, P(CX + 56, CY - 55, -5), 12, 8, -0.75)];

  // ---- the mane of flames on top of the head, tallest in the middle.
  const mane = new THREE.Group();
  mane.position.copy(P(CX, TOP + 10, -4));
  mane.scale.setScalar(grown);
  b.root.add(mane);
  const maneFlames: THREE.Group[] = [];
  // (Two rows, the back one taller, all leaning out from the middle — a wild blaze.)
  for (const [dx, height, width, lean, z] of [
    [-16, 26, 8, 0.5, -6], [-9, 36, 8, 0.25, -7], [-2, 44, 9, 0.06, -8], [6, 42, 9, -0.12, -7], [13, 32, 8, -0.32, -6], [19, 22, 7, -0.6, -5],
    [-19, 18, 7, 0.7, 2], [-11, 24, 8, 0.35, 3], [-3, 28, 8, 0.1, 4], [5, 30, 8, -0.1, 4], [12, 24, 8, -0.38, 3], [18, 16, 7, -0.7, 1],
  ] as const) {
    maneFlames.push(flame(b, mane, new THREE.Vector3(dx * S, 0, z * S), height, width, lean));
  }

  // ---- four little yellow horns on the brow.
  for (const [x, y, lean, size] of [[-14, TOP + 12, 0.45, 1], [14, TOP + 12, -0.45, 1], [0, TOP + 8, 0, 1.05], [0, TOP + 19, 0, 0.8]] as const) {
    const hx = CX + x;
    const horn = b.part(new THREE.ConeGeometry(0.5, 1, 10), K.carpYellow, P(hx, y - 4, front(hx, y) - 1), new THREE.Vector3(5 * S * size * grown, 10 * S * size * grown, 5 * S * size * grown));
    horn.rotation.set(0.35, 0, lean);
  }

  // ---- the face.
  const eyeY = CY - 2;
  const eyes: THREE.Object3D[] = [];
  const lids: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const x = CX + side * 10;
    const z = front(x, eyeY);
    // An almond eye, slanting down towards the nose: angry.
    const eye = new THREE.Group();
    eye.position.copy(P(x, eyeY, z));
    eye.rotation.z = side * 0.35;
    b.root.add(eye);
    const white = b.flat(sphere(), K.autumnRed, new THREE.Vector3(), new THREE.Vector3(11 * S, 8 * S, 4 * S));
    const rim = b.flat(new THREE.TorusGeometry(0.5, 0.09, 6, 20), INK, new THREE.Vector3(0, 0, 0.8 * S), new THREE.Vector3(11.5 * S, 8.5 * S, 3 * S));
    const pupil = b.flat(sphere(), INK, new THREE.Vector3(-side * 1 * S, 0, 1.6 * S), new THREE.Vector3(4 * S, 5 * S, 2 * S));
    const glint = b.flat(sphere(), K.washi, new THREE.Vector3(-side * 0.2 * S, 1.2 * S, 2.6 * S), 1.5 * S);
    for (const m of [white, rim, pupil, glint]) eye.add(m);
    eyes.push(eye);
    // The frown over it.
    rod(b, P(x - side * 7, eyeY - 4, z + 1.5), P(x + side * 7, eyeY - 9, z + 1), 1.1, INK, false);
    // Shut: an angry line (hidden until a blink).
    const lid = rod(b, P(x - side * 6, eyeY - 1, z + 1.5), P(x + side * 6, eyeY + 1.5, z + 1.5), 1.1, INK, false);
    lid.visible = false;
    lids.push(lid);
  }
  for (const side of [-1, 1]) b.flat(sphere(), INK, P(CX + side * 3, CY + 7, front(CX + side * 3, CY + 7) + 0.5), new THREE.Vector3(2 * S, 2 * S, 1 * S));

  // The mouth: wide, dark red inside, rows of sharp teeth; it opens wider when it cries.
  const mouthY = CY + 15;
  const mouth = new THREE.Group();
  mouth.position.copy(P(CX, mouthY, front(CX, mouthY)));
  b.root.add(mouth);
  mouth.add(b.flat(sphere(), shade(K.samuraiRed, -18), new THREE.Vector3(), new THREE.Vector3(26 * S, 9 * S, 4 * S)));
  mouth.add(b.flat(new THREE.TorusGeometry(0.5, 0.06, 6, 24), INK, new THREE.Vector3(0, 0, 0.8 * S), new THREE.Vector3(26.5 * S, 9.5 * S, 3 * S)));
  for (let i = 0; i < 8; i++) {
    const tx = (i - 3.5) * 3.1;
    const up = b.flat(new THREE.ConeGeometry(1.3 * S, 3.6 * S, 4), K.washi, new THREE.Vector3(tx * S, (3.4 - Math.abs(tx) * 0.07) * S, 1.6 * S));
    up.rotation.x = Math.PI;
    mouth.add(up);
    if (i > 0) {
      const lx = (i - 4) * 3.1;
      mouth.add(b.flat(new THREE.ConeGeometry(1.2 * S, 3.2 * S, 4), K.washi, new THREE.Vector3(lx * S, (-3.2 + Math.abs(lx) * 0.07) * S, 1.6 * S)));
    }
  }
  // The forked tongue, hanging out to the side.
  const tongue = new THREE.Group();
  tongue.position.copy(mouth.position);
  b.root.add(tongue);
  const t0 = new THREE.Vector3(3 * S, -1 * S, 2.5 * S);
  const t1 = new THREE.Vector3(8 * S, -9 * S, 5 * S);
  const t2 = new THREE.Vector3(11 * S, -15 * S, 5.5 * S);
  for (const [a, c, r] of [[t0, t1, 1.8], [t1, t2, 1.5], [t2, t2.clone().add(new THREE.Vector3(-1.5 * S, -4 * S, 0)), 0.9], [t2, t2.clone().add(new THREE.Vector3(2.5 * S, -3.5 * S, 0)), 0.9]] as const) {
    tongue.add(rod(b, a, c, r, K.peachRed, false));
  }

  return {
    face: (face) => {
      for (const e of eyes) e.visible = face !== "blink";
      for (const l of lids) l.visible = face === "blink";
      mouth.scale.y = face === "talk" ? 1.7 : 1;
    },
    // On top of the head, just behind the mane.
    seat: P(CX, TOP + 6, -14),
    rig: {
      body: b.wrapBody([], P(CX, CY + H / 2).y),
      feet: [],
      arms: [],
      wings: wings.map((pivot, i) => ({ pivot, side: i === 0 ? -1 : 1, rest: new THREE.Euler(0, (i === 0 ? -1 : 1) * 0.25, 0) })),
    },
    tick: (t) => {
      // Wings beat (the left one mirrors the right) — unless a rider's flight is beating them.
      const beat = Math.sin(t * 6) * 0.32;
      wings.forEach((wing, i) => {
        if (wing.userData.driven) return;
        const side = i === 0 ? -1 : 1;
        wing.rotation.set(0, side * (0.25 + beat), side * beat * 0.4);
      });
      // Flames flicker, each in its own time.
      [...maneFlames, ...torchFlames].forEach((f, i) => {
        const k = 1 + Math.sin(t * 11 + i * 1.7) * 0.08 + Math.sin(t * 17 + i) * 0.05;
        f.scale.set(1 / Math.sqrt(k), k, 1);
      });
    },
  };
}
