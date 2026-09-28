import * as THREE from "three";
import type { FormEyes, FormMouth } from "@shared";
import { KANAGAWA } from "../../ui/theme";
import { type Builder, INK, S, shade } from "../monster-model";
import { alongZ, type Ell, sphereGeo, V } from "./kit";

/**
 * Faces: eyes of many kinds (big kawaii ones with an iris and two glints, fierce slit-pupilled
 * ones under a frown, sleepy half-shut ones, an owl's great discs, a bug's shiny domes, little
 * dots, blind shut ones, glowing coals, an alien's dark almonds) and mouths (a smile, a cat's
 * "w", a grin, teeth, buck teeth, tusks, a frog's wide line), each on the head's own surface.
 * Blinking shuts the eyes; crying opens the mouth.
 */

export type FaceState = "normal" | "blink" | "talk";
export type FaceSwitch = (face: FaceState) => void;

export interface FaceSpec {
  head: Ell;
  eyes: FormEyes;
  mouth: FormMouth;
  /** How far round the head the eyes sit (radians from the front) and how high. */
  eyeYaw?: number;
  eyePitch?: number;
  /** The eyes' height (px). */
  eyeSize?: number;
  /** Where the mouth goes (default: on the head, below the eyes), and how wide it is (px). */
  mouthOn?: { e: Ell; yaw: number; pitch: number };
  mouthWidth?: number;
  /** The iris's colour (and a fierce or glowing eye's). */
  iris: number;
  /** The skin round the eyes (for sleepy lids). */
  skin: number;
  blush?: boolean;
  fang?: boolean;
  brows?: boolean;
}

/** A group lying on the surface at (yaw, pitch), its +z out of the surface. */
export function onSurface(b: Builder, e: Ell, yaw: number, pitch: number, out = 0.4): THREE.Group {
  const { p, n } = e.at(yaw, pitch, out);
  const g = new THREE.Group();
  g.position.copy(p);
  // Face along the normal, but keep "up" up.
  alongZ(g, n);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(g.quaternion);
  const want = new THREE.Vector3(0, 1, 0).sub(n.clone().multiplyScalar(n.y));
  if (want.lengthSq() < 1e-6) {
    b.root.add(g);
    return g;
  }
  want.normalize();
  const angle = Math.atan2(new THREE.Vector3().crossVectors(up, want).dot(n), up.dot(want));
  g.rotateZ(angle);
  b.root.add(g);
  return g;
}

/** A flat part in a group (local px). */
function dot(b: Builder, g: THREE.Object3D, colour: number, x: number, y: number, z: number, w: number, h: number, d = 1.2, opacity = 1): THREE.Mesh {
  const m = b.flat(sphereGeo(), colour, V(x, y, z), V(w, h, d), opacity);
  g.add(m);
  return m;
}

/** An arc of ink (a shut eye, a smile): `bow` 1 bends down like a smile, -1 up like a happy shut eye. */
function arc(b: Builder, g: THREE.Object3D, x: number, y: number, radius: number, thick: number, span: number, bow: 1 | -1): THREE.Mesh {
  const m = b.flat(new THREE.TorusGeometry(radius * S, thick * S, 5, 14, span), INK, V(x, y, 0.6));
  m.rotation.z = bow === 1 ? Math.PI + (Math.PI - span) / 2 : (Math.PI - span) / 2;
  g.add(m);
  return m;
}

export function makeFace(b: Builder, spec: FaceSpec): FaceSwitch {
  const { head } = spec;
  const size = spec.eyeSize ?? head.ry * 0.36;
  const yaw = spec.eyeYaw ?? 0.42;
  const pitch = spec.eyePitch ?? 0.1;
  const open: THREE.Object3D[] = [];
  const shut: THREE.Object3D[] = [];
  const talkShow: THREE.Object3D[] = [];
  const talkHide: THREE.Object3D[] = [];

  for (const side of [-1, 1]) {
    if (spec.eyes === "stalks") break; // (the body made them, on stalks)
    const g = onSurface(b, head, side * yaw, pitch);
    const eye = new THREE.Group();
    g.add(eye);
    open.push(eye);
    const w = size * 0.8;
    const h = size;
    switch (spec.eyes) {
      case "kawaii": {
        dot(b, eye, INK, 0, 0, 0, w, h, 2);
        // The iris shows in the lower half, and two glints.
        dot(b, eye, spec.iris, 0, -h * 0.2, 0.8, w * 0.62, h * 0.5, 1.2);
        dot(b, eye, INK, 0, -h * 0.05, 1.3, w * 0.36, h * 0.44, 1);
        dot(b, eye, KANAGAWA.washi, side * -w * 0.18, h * 0.2, 2, w * 0.36, h * 0.3, 1);
        dot(b, eye, KANAGAWA.washi, side * w * 0.2, -h * 0.26, 2, w * 0.16, h * 0.13, 1, 0.85);
        break;
      }
      case "fierce": {
        // An almond slanting down to the nose, a coloured iris with a slit.
        eye.rotation.z = side * -0.3;
        dot(b, eye, KANAGAWA.washi, 0, 0, 0, w * 1.25, h * 0.62, 1.6);
        dot(b, eye, spec.iris, side * -w * 0.12, 0, 0.8, w * 0.6, h * 0.58, 1.2);
        dot(b, eye, INK, side * -w * 0.12, 0, 1.4, w * 0.16, h * 0.5, 1);
        dot(b, eye, KANAGAWA.washi, side * -w * 0.02, h * 0.12, 2, w * 0.14, h * 0.12, 1);
        const rim = b.flat(new THREE.TorusGeometry(0.5, 0.07, 5, 20), INK, V(0, 0, 0.4), V(w * 1.28, h * 0.66, 1));
        eye.add(rim);
        break;
      }
      case "sleepy": {
        dot(b, eye, INK, 0, -h * 0.12, 0, w, h * 0.72, 1.6);
        dot(b, eye, spec.iris, 0, -h * 0.26, 0.7, w * 0.6, h * 0.3, 1.2);
        dot(b, eye, KANAGAWA.washi, side * -w * 0.2, -h * 0.12, 1.6, w * 0.22, h * 0.16, 1);
        // The heavy lid over the top half.
        dot(b, eye, spec.skin, 0, h * 0.2, 1.2, w * 1.14, h * 0.62, 1.8);
        const lash = b.flat(new THREE.BoxGeometry(w * 1.1 * S, 1.3 * S, 0.8 * S), INK, V(0, -h * 0.08, 2.2));
        eye.add(lash);
        break;
      }
      case "owl": {
        // A great disc round each eye, a golden ring and a big black pupil.
        dot(b, eye, shade(spec.skin, 18), 0, 0, -0.6, w * 2, h * 1.7, 1.4);
        dot(b, eye, spec.iris, 0, 0, 0.4, w * 1.25, h * 1.1, 1.4);
        dot(b, eye, INK, 0, 0, 1.2, w * 0.8, h * 0.72, 1.2);
        dot(b, eye, KANAGAWA.washi, side * -w * 0.2, h * 0.18, 2, w * 0.26, h * 0.22, 1);
        break;
      }
      case "bug": {
        // Big shiny compound domes.
        const dome = b.part(sphereGeo(), shade(spec.iris, -30), V(0, 0, 0), V(w * 1.5, h * 1.35, h * 0.9), true, false);
        eye.add(dome);
        for (const [gx, gy, r] of [[-0.25, 0.3, 0.3], [0.1, 0.12, 0.14], [-0.05, -0.3, 0.1]] as const) dot(b, eye, KANAGAWA.washi, side * w * gx * 1.5, h * gy * 1.3, h * 0.44, w * r, h * r, 1, 0.9);
        break;
      }
      case "dot": {
        dot(b, eye, INK, 0, 0, 0, w * 0.46, h * 0.5, 1.4);
        dot(b, eye, KANAGAWA.washi, side * -w * 0.08, h * 0.1, 1, w * 0.14, h * 0.14, 1);
        break;
      }
      case "blind": {
        // Shut for good: a calm line each.
        const line = arc(b, eye, 0, 0, w * 0.5, 1.1, Math.PI * 0.6, -1);
        line.scale.y = 0.7;
        break;
      }
      case "glow": {
        // Glowing coals, no pupil, in an ink rim.
        dot(b, eye, INK, 0, 0, 0, w * 1.1, h * 0.95, 1.4);
        dot(b, eye, spec.iris, 0, 0, 0.8, w * 0.84, h * 0.72, 1.2);
        dot(b, eye, KANAGAWA.washi, 0, h * 0.08, 1.4, w * 0.4, h * 0.3, 1, 0.8);
        break;
      }
      case "alien": {
        // Big dark almonds tilted up at the outside, with a soft sheen.
        eye.rotation.z = side * 0.45;
        dot(b, eye, INK, 0, 0, 0, w * 1.5, h * 0.95, 2);
        dot(b, eye, shade(spec.iris, -20), side * w * 0.1, -h * 0.12, 0.8, w * 1.0, h * 0.5, 1, 0.5);
        dot(b, eye, KANAGAWA.washi, side * -w * 0.3, h * 0.2, 1.6, w * 0.3, h * 0.2, 1);
        break;
      }
    }
    // Shut: a happy arc (a blind one stays as it is).
    if (spec.eyes !== "blind") {
      const lid = arc(b, g, 0, spec.eyes === "sleepy" ? -size * 0.1 : 0, size * 0.42, 1.3, Math.PI * 0.72, -1);
      lid.visible = false;
      shut.push(lid);
    }
    if (spec.brows || spec.eyes === "fierce") {
      const brow = b.flat(new THREE.BoxGeometry(size * 1.1 * S, 2 * S, 1 * S), INK, V(side * -size * 0.1, size * (spec.eyes === "owl" ? 1.05 : 0.72), 1.2));
      brow.rotation.z = side * 0.4;
      g.add(brow);
    }
    if (spec.blush) {
      const cheek = onSurface(b, head, side * (yaw + 0.3), pitch - 0.3, 0.2);
      dot(b, cheek, KANAGAWA.sakuraPink, 0, 0, 0, size * 0.9, size * 0.45, 1, 0.85);
    }
  }

  // ---- the mouth
  const m = spec.mouthOn ?? { e: head, yaw: 0, pitch: pitch - 0.42 };
  const mw = spec.mouthWidth ?? size * 0.9;
  const kind = spec.mouth;
  if (kind !== "none" && kind !== "beak") {
    const g = onSurface(b, m.e, m.yaw, m.pitch, 0.3);
    const closed = new THREE.Group();
    g.add(closed);
    talkHide.push(closed);
    switch (kind) {
      case "smile":
        arc(b, closed, 0, 0, mw * 0.4, 1.1, Math.PI * 0.62, 1);
        break;
      case "cat":
        for (const side of [-1, 1]) arc(b, closed, side * mw * 0.22, 0, mw * 0.24, 1, Math.PI * 0.8, 1);
        break;
      case "grin":
        arc(b, closed, 0, mw * 0.2, mw * 0.7, 1.2, Math.PI * 0.5, 1);
        break;
      case "wide":
        arc(b, closed, 0, mw * 0.5, mw * 1.4, 1.2, Math.PI * 0.32, 1);
        break;
      case "teeth": {
        dot(b, closed, shade(KANAGAWA.samuraiRed, -30), 0, 0, 0, mw * 1.3, mw * 0.4, 1);
        for (let i = 0; i < 5; i++) {
          const t = b.flat(new THREE.ConeGeometry(1.4 * S, 3.4 * S, 4), KANAGAWA.washi, V((i - 2) * mw * 0.22, mw * 0.12, 1));
          t.rotation.z = Math.PI;
          closed.add(t);
        }
        break;
      }
      case "buck": {
        arc(b, closed, 0, mw * 0.1, mw * 0.36, 1, Math.PI * 0.6, 1);
        for (const side of [-1, 1]) {
          const t = b.flat(new THREE.BoxGeometry(mw * 0.2 * S, mw * 0.3 * S, 1 * S), KANAGAWA.washi, V(side * mw * 0.11, -mw * 0.2, 0.8));
          closed.add(t);
          const edge = b.flat(new THREE.BoxGeometry(mw * 0.22 * S, mw * 0.32 * S, 0.6 * S), INK, V(side * mw * 0.11, -mw * 0.2, 0.4));
          closed.add(edge);
        }
        break;
      }
      case "tusks":
        arc(b, closed, 0, 0, mw * 0.5, 1.1, Math.PI * 0.6, 1);
        break;
    }
    if (kind === "tusks") {
      // The tusks stay out when it cries.
      for (const side of [-1, 1]) {
        const t = b.part(new THREE.ConeGeometry(1.8 * S, 7 * S, 6), KANAGAWA.washi, V(side * mw * 0.55, 1, 1.4), 1, true, false);
        t.rotation.z = -side * 0.35;
        g.add(t);
      }
    }
    if (spec.fang && (kind === "smile" || kind === "cat")) {
      const fang = b.flat(new THREE.ConeGeometry(1.5 * S, 4 * S, 4), KANAGAWA.washi, V(mw * 0.2, -2.2, 1));
      fang.rotation.z = Math.PI;
      closed.add(fang);
    }
    // Crying: the mouth wide open, a pink tongue in it.
    const cry = new THREE.Group();
    g.add(cry);
    cry.visible = false;
    talkShow.push(cry);
    const ow = kind === "wide" ? mw * 1.6 : mw * 0.9;
    dot(b, cry, shade(KANAGAWA.samuraiRed, -45), 0, -mw * 0.1, 0, ow, ow * 0.8, 1.4);
    dot(b, cry, KANAGAWA.sakuraPink, 0, -mw * 0.32, 0.8, ow * 0.55, ow * 0.3, 1);
    const rim = b.flat(new THREE.TorusGeometry(0.5, 0.06, 5, 20), INK, V(0, -mw * 0.1, 0.5), V(ow * 1.02, ow * 0.82, 1));
    cry.add(rim);
  }

  return (face) => {
    for (const o of open) o.visible = face !== "blink";
    for (const o of shut) o.visible = face === "blink";
    for (const o of talkHide) o.visible = face !== "talk";
    for (const o of talkShow) o.visible = face === "talk";
  };
}
