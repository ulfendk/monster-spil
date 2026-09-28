import * as THREE from "three";
import type { FormCrest, FormEars, FormHorns, FormSnout } from "@shared";
import { KANAGAWA } from "../../ui/theme";
import { INK, S, shade } from "../monster-model";
import type { Ctx } from "./context";
import { Ell, Q, V, alongY, blob, decal, flame, flicker, lathe, leafShape, mix, plate, smooth, sphereGeo, spike, tube } from "./kit";

const K = KANAGAWA;

/** What a snout does to the face: where the mouth goes, and how it opens when the monster cries. */
export interface SnoutResult {
  mouthOn?: { e: Ell; yaw: number; pitch: number };
  mouthWidth?: number;
  /** A beak or a jaw opens by itself: no drawn mouth. */
  ownMouth?: boolean;
  talk?: (open: boolean) => void;
  /** Eyes a little higher to make room. */
  eyeLift?: number;
}

// ------------------------------------------------------------ snouts

export function snout(ctx: Ctx, h: Ell, kind: FormSnout): SnoutResult {
  const { b } = ctx;
  const nose = (e: Ell, pitch: number, size: number) => {
    const n = e.at(0, pitch, -size * 0.25);
    b.part(sphereGeo(), K.sumiInk4, n.p, V(size * 1.3, size * 0.9, size), false);
    b.flat(sphereGeo(), K.washi, n.p.clone().add(V(-size * 0.2, size * 0.2, size * 0.4)), V(size * 0.35, size * 0.25, 0.5), 0.8);
  };
  switch (kind) {
    case "muzzle": {
      const m = new Ell(h.x, h.y - h.ry * 0.3, h.z + h.rz * 0.6, h.rx * 0.46, h.ry * 0.36, h.rz * 0.46);
      ctx.headParts.push(blob(b, m, ctx.belly));
      nose(m, 0.5, h.rx * 0.2);
      return { mouthOn: { e: m, yaw: 0, pitch: -0.3 }, mouthWidth: h.rx * 0.34, eyeLift: 0.08 };
    }
    case "long": {
      const m = new Ell(h.x, h.y - h.ry * 0.24, h.z + h.rz * 0.9, h.rx * 0.3, h.ry * 0.27, h.rz * 0.62);
      ctx.headParts.push(blob(b, m, mix(ctx.colour, ctx.belly, 0.6)));
      const tip = m.at(0, 0.1, -1);
      b.part(sphereGeo(), K.sumiInk4, tip.p, V(h.rx * 0.2, h.rx * 0.16, h.rx * 0.16), false);
      return { mouthOn: { e: m, yaw: 0, pitch: -0.55 }, mouthWidth: h.rx * 0.26, eyeLift: 0.1 };
    }
    case "pig": {
      const r = h.rx * 0.3;
      const at = h.at(0, -0.15, -1);
      const disc = b.part(new THREE.CylinderGeometry(r * S, r * 1.1 * S, h.rz * 0.36 * S, 22), mix(ctx.colour, K.sakuraPink, 0.45), at.p);
      alongY(disc, at.n);
      for (const side of [-1, 1]) {
        const nostril = b.flat(sphereGeo(), INK, V(side * r * 0.35, h.rz * 0.18 + 0.6, 0), V(r * 0.28, r * 0.5, 1));
        nostril.rotation.x = -Math.PI / 2;
        disc.add(nostril);
      }
      ctx.headParts.push(disc);
      return { mouthOn: { e: h, yaw: 0, pitch: -0.62 }, mouthWidth: h.rx * 0.4 };
    }
    case "big": {
      const n = h.at(0, -0.12, -h.rz * 0.1);
      const e = new Ell(n.px.x, n.px.y, n.px.z, h.rx * 0.3, h.ry * 0.26, h.rz * 0.28);
      ctx.headParts.push(blob(b, e, mix(shade(ctx.colour, 8), K.sakuraPink, 0.3)));
      b.flat(sphereGeo(), K.washi, V(e.x - e.rx * 0.3, e.y + e.ry * 0.3, e.z + e.rz * 0.8), V(e.rx * 0.4, e.ry * 0.3, 1), 0.6);
      return { mouthOn: { e: h, yaw: 0, pitch: -0.6 }, mouthWidth: h.rx * 0.5 };
    }
    case "star": {
      const at = h.at(0, -0.1, 0);
      const r = h.rx * 0.16;
      b.part(sphereGeo(), K.sakuraPink, at.p, V(r * 2, r * 2, r * 1.6));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0.9).normalize();
        spike(b, at.p.clone().add(V(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8, r * 0.3)), dir, r * 1.5, r * 0.35, K.sakuraPink, false, 6);
      }
      return { mouthOn: { e: h, yaw: 0, pitch: -0.5 }, mouthWidth: h.rx * 0.3 };
    }
    case "beak":
    case "hook":
    case "chisel": {
      // Upper and lower halves: the lower one drops when it cries.
      // A beak is its accent colour when that's a beak's (yellow to red-orange), else yellow; a woodpecker's chisel is grey.
      const hue = new THREE.Color(ctx.accent).getHSL({ h: 0, s: 0, l: 0 });
      const beaky = ctx.form.accent && hue.s > 0.35 && hue.h > 0.04 && hue.h < 0.17;
      const colour = kind === "chisel" ? K.katanaGray : beaky ? ctx.accent : K.carpYellow;
      const base = h.at(0, kind === "hook" ? 0 : -0.12, -h.rz * 0.12);
      const len = kind === "chisel" ? h.rz * 1.15 : kind === "hook" ? h.rz * 0.5 : h.rz * 0.72;
      const wide = kind === "chisel" ? h.rx * 0.2 : h.rx * 0.3;
      const bp = base.px;
      if (kind === "hook") {
        tube(b, [Q(bp.x, bp.y + 2, bp.z - 1), Q(bp.x, bp.y + 2, bp.z + len * 0.5), Q(bp.x, bp.y - len * 0.3, bp.z + len * 0.8), Q(bp.x, bp.y - len * 0.8, bp.z + len * 0.55)], wide, 0.4, colour);
      } else {
        const upper = spike(b, V(bp.x, bp.y + 1, bp.z), new THREE.Vector3(0, -0.12, 1), len, wide, colour);
        upper.scale.set(1, 1, 0.75);
      }
      const jaw = new THREE.Group();
      jaw.position.copy(V(bp.x, bp.y - wide * 0.4, bp.z));
      b.root.add(jaw);
      const lower = spike(b, new THREE.Vector3(), new THREE.Vector3(0, -0.3, 1), len * 0.7, wide * 0.7, shade(colour, -12));
      lower.scale.set(1, 1, 0.7);
      jaw.add(lower);
      return { ownMouth: true, talk: (open) => (jaw.rotation.x = open ? 0.5 : 0), eyeLift: 0.1 };
    }
    case "jaw": {
      // A big lower jaw jutting out, a row of teeth along it.
      const jaw = new THREE.Group();
      jaw.position.copy(V(h.x, h.y - h.ry * 0.35, h.z + h.rz * 0.15));
      b.root.add(jaw);
      const e = new Ell(0, -h.ry * 0.18, h.rz * 0.42, h.rx * 0.82, h.ry * 0.34, h.rz * 0.72);
      jaw.add(blob(b, e, shade(ctx.colour, -6)));
      for (let i = 0; i < 7; i++) {
        const yaw = (i - 3) * 0.3;
        const t = e.at(yaw, 0.55, -0.5);
        jaw.add(spike(b, t.p, new THREE.Vector3(0, 1, 0.15), h.ry * 0.22, h.rx * 0.07, K.washi, true, 5));
      }
      return { ownMouth: true, talk: (open) => (jaw.rotation.x = open ? 0.35 : 0), eyeLift: 0.12 };
    }
    case "none":
    default:
      return {};
  }
}

// ------------------------------------------------------------ ears

/** A rounded triangle (px, y up), base on y = 0. */
function triangle(w: number, len: number): Array<[number, number]> {
  return smooth([[-w / 2, 0], [0, -w * 0.08], [w / 2, 0], [w * 0.22, len * 0.62], [0, len], [-w * 0.22, len * 0.62]], 30);
}
function ellipse(w: number, len: number): Array<[number, number]> {
  return smooth([[-w / 2, len * 0.35], [0, 0], [w / 2, len * 0.35], [w * 0.4, len * 0.8], [0, len], [-w * 0.4, len * 0.8]], 30);
}
function circle(r: number): Array<[number, number]> {
  return Array.from({ length: 28 }, (_, i) => [Math.cos((i / 28) * Math.PI * 2) * r, r + Math.sin((i / 28) * Math.PI * 2) * r] as [number, number]);
}

export function ears(ctx: Ctx, h: Ell, kind: FormEars): void {
  if (kind === "none") return;
  const { b } = ctx;
  const inner = mix(ctx.colour, K.sakuraPink, 0.6);
  // yaw, pitch (where on the head), outward lean, backward lean, the outline, inner scale, depth.
  const spec = (): { yaw: number; pitch: number; out: number; back: number; shape: Array<[number, number]>; inner: number; depth: number; tip?: number } => {
    const rx = h.rx;
    const ry = h.ry;
    switch (kind) {
      case "cat": return { yaw: 0.6, pitch: 0.9, out: 0.28, back: -0.1, shape: triangle(rx * 0.66, ry * 0.62), inner: 0.6, depth: 3.5 };
      case "fox": return { yaw: 0.55, pitch: 0.95, out: 0.3, back: -0.12, shape: triangle(rx * 0.72, ry * 0.92), inner: 0.62, depth: 3.5, tip: 0.3 };
      case "fennec": return { yaw: 0.65, pitch: 0.82, out: 0.5, back: -0.1, shape: triangle(rx * 1.05, ry * 1.35), inner: 0.68, depth: 3.5 };
      case "long": return { yaw: 0.35, pitch: 1.05, out: 0.14, back: -0.2, shape: ellipse(rx * 0.46, ry * 1.5), inner: 0.7, depth: 4 };
      case "round": return { yaw: 0.78, pitch: 0.8, out: 0.35, back: -0.05, shape: circle(rx * 0.3), inner: 0.6, depth: 4 };
      case "bear": return { yaw: 0.6, pitch: 1.0, out: 0.3, back: -0.1, shape: circle(rx * 0.25), inner: 0.55, depth: 5 };
      case "mouse": return { yaw: 0.85, pitch: 0.72, out: 0.42, back: -0.05, shape: circle(rx * 0.46), inner: 0.7, depth: 3 };
      case "tufts": return { yaw: 0.55, pitch: 0.95, out: 0.5, back: -0.05, shape: triangle(rx * 0.3, ry * 0.5), inner: 0, depth: 3 };
      case "bat": return { yaw: 0.62, pitch: 0.85, out: 0.42, back: -0.08, shape: triangle(rx * 0.82, ry * 1.2), inner: 0.66, depth: 3 };
      case "floppy": return { yaw: 0.9, pitch: 0.55, out: 2.3, back: 0.2, shape: ellipse(rx * 0.5, ry * 0.7), inner: 0.65, depth: 3 };
      case "clover": return { yaw: 0.4, pitch: 1.05, out: 0.3, back: -0.1, shape: [], inner: 0, depth: 3 };
    }
  };
  const s = spec();
  for (const side of [-1, 1]) {
    const at = h.at(side * s.yaw, s.pitch, -1.5);
    const ear = new THREE.Group();
    ear.position.copy(at.p);
    ear.rotation.set(s.back, side * 0.3, -side * s.out);
    b.root.add(ear);
    ctx.headParts.push(ear);
    if (kind === "clover") {
      // A stem and a three-leaved clover.
      ear.add(tube(b, [Q(0, 0, 0), Q(0, h.ry * 0.35, 0), Q(side * 2, h.ry * 0.6, 0)], 1.4, 1.2, K.autumnGreen));
      for (let i = 0; i < 3; i++) {
        const a = Math.PI / 2 + (i - 1) * 2.1;
        const leaf = b.part(plate(smooth([[0, 0], [7, 6], [4, 12], [0, 9], [-4, 12], [-7, 6]], 24), 2.5), ctx.colour, V(side * 2 + Math.cos(a) * 2, h.ry * 0.6 + Math.sin(a) * 2, 0));
        leaf.rotation.z = a - Math.PI / 2;
        ear.add(leaf);
      }
      continue;
    }
    const colour = kind === "tufts" ? shade(ctx.colour, -10) : ctx.colour;
    ear.add(b.part(plate(s.shape, s.depth), colour, new THREE.Vector3()));
    if (s.inner) {
      const inside = b.part(plate(s.shape.map(([x, y]) => [x * s.inner, y * s.inner + (kind === "floppy" ? 2 : 1.5)] as [number, number]), 1), inner, V(0, 0, s.depth * 0.55), 1, false, false);
      ear.add(inside);
    }
    if (s.tip) {
      // Dark tips (a fox's).
      const tipShape = s.shape.filter(([, y]) => y > 0).map(([x, y]) => [x, y] as [number, number]);
      const top = Math.max(...tipShape.map(([, y]) => y));
      const tip = b.part(plate(triangle(h.rx * 0.72 * 0.45, top * 0.4), s.depth + 0.6), K.sumiInk4, V(0, top * 0.6, 0), 1, false);
      ear.add(tip);
    }
    if (kind === "bat") {
      // Ridges inside.
      for (const k of [0.3, 0.55]) ear.add(b.flat(new THREE.BoxGeometry(h.rx * 0.5 * S, 1 * S, 1 * S), shade(inner, -20), V(0, h.ry * 1.2 * k, s.depth * 0.9)));
    }
  }
}

// ------------------------------------------------------------ horns

export function horns(ctx: Ctx, h: Ell, kind: FormHorns): void {
  if (kind === "none") return;
  const { b } = ctx;
  const g = ctx.grow;
  const bone = ctx.form.accent && (kind === "crystal" || kind === "antlers") ? ctx.accent : kind === "zigzag" ? K.carpYellow : kind === "hook" ? K.sumiInk5 : mix(K.oldWhite, ctx.colour, 0.12);
  const parts: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const add = (o: THREE.Object3D) => parts.push(o);
    switch (kind) {
      case "goat": {
        const p = h.at(side * 0.38, 1.0, -2).px;
        add(tube(b, [Q(p.x, p.y, p.z), Q(p.x + side * 2 * g, p.y + 9 * g, p.z - 3 * g), Q(p.x + side * 5 * g, p.y + 14 * g, p.z - 11 * g), Q(p.x + side * 7 * g, p.y + 12 * g, p.z - 18 * g)], 4.2, 0.3, bone));
        break;
      }
      case "ram": {
        // A heavy horn curling back, down and round beside the head, ridged.
        const p = h.at(side * 0.55, 0.9, -2).px;
        const c = (dx: number, dy: number, dz: number) => Q(p.x + side * dx * g, p.y + dy * g, p.z + dz * g);
        add(tube(b, [c(0, 0, 0), c(5, 7, -6), c(12, 3, -11), c(16, -6, -7), c(14, -13, 1), c(9, -12, 6)], 5.5, 1.6, bone, true, { segments: 30 }));
        break;
      }
      case "hook": {
        const p = h.at(side * 0.3, 1.05, -2).px;
        add(tube(b, [Q(p.x, p.y, p.z), Q(p.x + side * 1.5, p.y + 10 * g, p.z), Q(p.x + side * 2, p.y + 17 * g, p.z - 2 * g), Q(p.x + side * 2, p.y + 18 * g, p.z - 7 * g), Q(p.x + side * 1.5, p.y + 14 * g, p.z - 9 * g)], 2.8, 0.5, bone));
        break;
      }
      case "antlers": {
        const p = h.at(side * 0.42, 1.0, -2).px;
        const c = (dx: number, dy: number, dz: number) => Q(p.x + side * dx * g, p.y + dy * g, p.z + dz * g);
        const beam = [c(0, 0, 0), c(5, 10, -2), c(12, 20, -4), c(15, 30, -2)];
        add(tube(b, beam, 2.8, 1.1, bone));
        add(tube(b, [c(3.5, 7, -1.5), c(4, 13, 4), c(4, 17, 6)], 1.8, 0.8, bone));
        add(tube(b, [c(11, 18, -3.5), c(10, 25, 1), c(9, 29, 2)], 1.6, 0.7, bone));
        add(tube(b, [c(8, 14, -3), c(15, 17, -8), c(19, 20, -10)], 1.5, 0.7, bone));
        if (ctx.type === "lyn" || kind === "antlers" && ctx.form.horns === "antlers" && ctx.form.accent) {
          // Crystal points at the tips, glinting.
          for (const t of [c(15, 30, -2), c(4, 17, 6), c(9, 29, 2), c(19, 20, -10)]) {
            const shard = b.part(new THREE.OctahedronGeometry(0.5, 0), shade(bone, 18), V(t.x, t.y + 2, t.z), V(5, 9, 5), true, false);
            add(shard);
          }
        }
        break;
      }
      case "crystal": {
        const p = h.at(side * 0.4, 0.95, -2);
        const shard = b.part(new THREE.OctahedronGeometry(0.5, 0), bone, p.p, V(8 * g, 22 * g, 8 * g));
        shard.rotation.z = -side * 0.35;
        add(shard);
        const small = b.part(new THREE.OctahedronGeometry(0.5, 0), shade(bone, 15), p.p.clone().add(V(side * 6, -2, 2)), V(5 * g, 12 * g, 5 * g));
        small.rotation.z = -side * 0.8;
        add(small);
        break;
      }
      case "zigzag": {
        const pts: Array<[number, number]> = [[-5, -8], [side * 2, 8], [-side * 5, 8], [side * 4, 26], [side * 2, 12], [side * 9, 12], [5, -8]];
        const p = h.at(side * 0.4, 1.0, -3);
        const z = b.part(plate(pts, 5), bone, p.p.clone().add(V(0, 4, 0)), g);
        add(z);
        break;
      }
      case "nubs": {
        const p = h.at(side * 0.4, 1.0, -1.5);
        add(spike(b, p.p, new THREE.Vector3(side * 0.3, 1, 0), 7 * g, 3.2 * g, bone));
        break;
      }
      case "beetle": {
        if (side === 1) break;
        const p = h.at(0, 0.5, -2).px;
        const c = (dx: number, dy: number, dz: number) => Q(p.x + dx * g, p.y + dy * g, p.z + dz * g);
        add(tube(b, [c(0, 0, 0), c(0, 8, 6), c(0, 18, 8), c(0, 26, 3)], 4.5, 1.2, ctx.dark));
        for (const s2 of [-1, 1]) add(tube(b, [c(0, 24, 4), c(s2 * 4, 29, 3), c(s2 * 6, 31, 0)], 1.4, 0.4, ctx.dark));
        break;
      }
    }
  }
  ctx.headParts.push(...parts);
}

// ------------------------------------------------------------ crests: what grows on top of the head

export function crest(ctx: Ctx, h: Ell, kind: FormCrest): THREE.Group | undefined {
  if (kind === "none") return undefined;
  const { b } = ctx;
  const top = h.at(0, Math.PI / 2 - 0.02, -1);
  const pivot = top.p.clone();
  const before = b.root.children.length;
  const T = (dx: number, dy: number, dz = 0) => pivot.clone().add(V(dx, dy, dz));
  const r = h.rx;
  switch (kind) {
    case "flames": {
      const fl: THREE.Group[] = [];
      for (const [dx, hh, w, lean, dz] of [[-r * 0.32, 22, 12, 0.35, -2], [r * 0.32, 22, 12, -0.35, -2], [0, 32, 15, 0, -4], [-r * 0.15, 18, 10, 0.15, 3], [r * 0.16, 18, 10, -0.15, 3]] as const) {
        fl.push(flame(b, T(dx, -4, dz), hh, w, lean));
      }
      ctx.ticks.push(flicker(fl));
      break;
    }
    case "waves": {
      for (const [dx, rr, dz] of [[-r * 0.3, 11, 0], [r * 0.3, 11, 0], [0, 14, -3]] as const) {
        const scale = b.part(new THREE.CylinderGeometry(rr * S, rr * S, 6 * S, 18, 1, false, -Math.PI / 2, Math.PI), K.waveBlue2, T(dx, -2, dz));
        scale.rotation.x = Math.PI / 2;
        for (const k of [0.72, 0.42]) b.flat(new THREE.TorusGeometry(rr * k * S, 1 * S, 4, 14, Math.PI), K.fujiWhite, T(dx, -2, dz + 3.5));
      }
      break;
    }
    case "leaves": {
      for (const side of [-1, 1]) {
        const leaf = b.part(plate(leafShape(26, 13), 2.5), K.autumnGreen, T(side * 3, -3, 0));
        leaf.rotation.z = -side * 0.9;
        leaf.add(b.flat(new THREE.BoxGeometry(0.8 * S, 18 * S, 0.6 * S), K.winterGreen, V(0, 12, 1.7)));
      }
      b.part(sphereGeo(), K.sakuraPink, T(0, 2, 1), V(9, 9, 9));
      break;
    }
    case "sprout": {
      // A stem with two big leaves opening, like a seedling.
      const stemTop = T(0, 16);
      tube(b, [Q(pivot.x / S, pivot.y / S - 3, pivot.z / S), Q(pivot.x / S + 1, pivot.y / S + 8, pivot.z / S), Q(stemTop.x / S, stemTop.y / S, stemTop.z / S)], 2.4, 2, K.autumnGreen);
      for (const side of [-1, 1]) {
        const leaf = b.part(plate(leafShape(30, 18), 2.5), ctx.form.accent ? ctx.accent : K.springGreen, stemTop.clone());
        leaf.rotation.set(0.2, 0, -side * 1.15);
        const vein = b.flat(new THREE.BoxGeometry(1 * S, 24 * S, 0.5 * S), K.autumnGreen, V(0, 13, 1.8));
        leaf.add(vein);
      }
      break;
    }
    case "mushroom": {
      // A spotted cap worn like a hat.
      const capColour = ctx.form.accent ? ctx.accent : K.autumnRed;
      const cap = b.part(lathe([[0, 0], [r * 1.25, 0], [r * 1.3, 3], [r * 1.12, 10], [r * 0.8, 17], [r * 0.4, 21], [0, 22]], 28), capColour, T(0, -h.ry * 0.28));
      const capEll = new Ell(cap.position.x / S, cap.position.y / S + 9, cap.position.z / S, r * 1.2, 12, r * 1.2);
      for (let i = 0; i < 7; i++) decal(b, capEll, (i / 7) * Math.PI * 2 + 0.3, 0.3 + (i % 2) * 0.35, 6, 5, K.washi);
      b.part(sphereGeo(), K.washi, capEll.at(0, 1.2, -1).p, V(6, 3, 6), false);
      b.part(lathe([[r * 1.2, 0], [r * 0.5, -1], [0, -1]], 24), K.oldWhite, T(0, -h.ry * 0.28), 1, false);
      break;
    }
    case "crystals": {
      const colour = ctx.form.accent ? ctx.accent : K.oniViolet;
      for (const [dx, hh, w, lean, dz] of [[0, 24, 9, 0, -2], [-r * 0.35, 16, 7, 0.45, 0], [r * 0.35, 17, 7, -0.4, -1], [-r * 0.12, 12, 6, 0.2, 5], [r * 0.2, 11, 5, -0.25, 5]] as const) {
        const s = b.part(new THREE.OctahedronGeometry(0.5, 0), colour, T(dx, hh * 0.3, dz), V(w, hh, w));
        s.rotation.z = lean;
        b.flat(new THREE.OctahedronGeometry(0.5, 0), K.washi, s.position.clone().add(V(-w * 0.12, hh * 0.08, w * 0.3)), V(w * 0.25, hh * 0.35, 0.5), 0.6).rotation.z = lean;
      }
      break;
    }
    case "rocks": {
      const cap = b.part(new THREE.DodecahedronGeometry(0.5), K.katanaGray, T(0, -2), V(r * 1.4, 20, r * 1.3));
      cap.rotation.y = 0.4;
      b.part(new THREE.DodecahedronGeometry(0.5), shade(K.katanaGray, 12), T(-r * 0.3, 7, 3), V(10, 9, 9));
      b.part(sphereGeo(), K.autumnGreen, T(-r * 0.4, 3, r * 0.4), V(9, 5, 7), false);
      b.part(sphereGeo(), K.autumnGreen, T(r * 0.45, 0, r * 0.3), V(7, 4, 6), false);
      break;
    }
    case "comb": {
      // A rooster's comb: red lobes in a row, front to back.
      const colour = K.autumnRed;
      for (const [dz, hh] of [[5, 9], [1, 13], [-4, 12], [-8, 9]] as const) b.part(sphereGeo(), colour, T(0, hh * 0.35, dz), V(4, hh, 7));
      break;
    }
    case "cap": {
      // A bright cap over the top of the head (a woodpecker's).
      const cap = b.part(new THREE.SphereGeometry(0.5, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.36), ctx.form.accent ? ctx.accent : K.autumnRed, h.centre, V(h.rx * 2.06, h.ry * 2.06, h.rz * 2.06), false);
      cap.rotation.x = -0.35;
      break;
    }
    case "spikes": {
      // Quills over the top of the head (and down the back: below).
      for (let i = 0; i < 7; i++) quill(ctx, h, (i - 3) * 0.3, 1.05 - Math.abs(i - 3) * 0.1, 13);
      break;
    }
    case "sun": {
      // A ring of rays round the head, like a rising sun.
      const halo = new THREE.Group();
      halo.position.copy(h.centre.clone().add(V(0, 0, -h.rz * 0.3)));
      b.root.add(halo);
      for (let i = 0; i < 9; i++) {
        const a = Math.PI / 2 + (i - 4) * 0.36;
        const ray = b.part(plate([[-4, 0], [4, 0], [0, 12]], 2.5), i % 2 ? K.surimiOrange : K.carpYellow, V(Math.cos(a) * (h.rx + 1), Math.sin(a) * (h.ry + 1), 0));
        ray.rotation.z = a - Math.PI / 2;
        halo.add(ray);
      }
      ctx.ticks.push((t) => (halo.rotation.z = Math.sin(t * 0.8) * 0.08));
      break;
    }
    case "snowflake": {
      const flake = new THREE.Group();
      flake.position.copy(T(0, 12, -2));
      b.root.add(flake);
      for (let i = 0; i < 6; i++) {
        const arm = new THREE.Group();
        arm.rotation.z = (i / 6) * Math.PI * 2;
        flake.add(arm);
        arm.add(b.part(new THREE.BoxGeometry(2.4 * S, 13 * S, 2 * S), K.washi, V(0, 6.5, 0), 1, true, false));
        for (const s of [-1, 1]) {
          const twig = b.part(new THREE.BoxGeometry(1.8 * S, 5 * S, 1.6 * S), K.washi, V(s * 2, 9, 0), 1, false, false);
          twig.rotation.z = -s * 0.8;
          arm.add(twig);
        }
      }
      ctx.ticks.push((t) => (flake.rotation.z = t * 0.4));
      break;
    }
    case "lilypad": {
      // A round lily pad with a notch, tipped back like a hat, and a pink water lily on it.
      const pr = Math.min(r * 0.62, 22);
      const pad = b.part(new THREE.CylinderGeometry(pr * S, pr * S, 2.5 * S, 30, 1, false, 0.35, Math.PI * 2 - 0.7), K.autumnGreen, T(0, 0, -6));
      pad.rotation.set(-0.3, 0.4, -0.12);
      const petals = [K.sakuraPink, mix(K.sakuraPink, K.washi, 0.5)];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const petal = b.part(plate(leafShape(11, 6), 1.5), petals[i % 2]!, T(Math.cos(a) * 2, 4, Math.sin(a) * 2 - 6));
        petal.rotation.set(0, -a + Math.PI / 2, 0);
        petal.rotateX(-0.9 + (i % 2) * 0.3);
      }
      b.part(sphereGeo(), K.carpYellow, T(0, 5, -6), V(5, 4, 5), false);
      break;
    }
    case "hat": {
      // A tall pointed nisse hat, flopping over at the tip.
      const colour = ctx.form.accent ? ctx.accent : K.autumnRed;
      const hat = b.part(lathe([[0, 0], [r * 1.02, 0], [r * 0.95, 4], [r * 0.6, 14], [r * 0.3, 24], [0.5, 31]], 24), colour, T(0, -h.ry * 0.32, -1));
      hat.rotation.x = -0.25;
      b.part(new THREE.TorusGeometry(r * 0.98 * S, 2.6 * S, 8, 28), shade(colour, -16), T(0, -h.ry * 0.3, -1)).rotation.x = Math.PI / 2 - 0.25;
      if (ctx.type === "graes") {
        const leaf = b.part(plate(leafShape(14, 8), 1.5), K.springGreen, T(r * 0.4, 2, 2));
        leaf.rotation.z = -0.9;
      }
      break;
    }
    case "stonehat": {
      const hat = b.part(new THREE.ConeGeometry(r * 1.05 * S, 30 * S, 7), K.katanaGray, T(0, 8, -1));
      hat.rotation.set(-0.2, 0.3, 0.05);
      b.part(new THREE.DodecahedronGeometry(0.5), shade(K.katanaGray, -10), T(0, -h.ry * 0.28, 0), V(r * 2.1, 7, r * 2.1));
      b.part(sphereGeo(), K.autumnGreen, T(r * 0.4, 2, r * 0.5), V(7, 4, 5), false);
      break;
    }
    case "reeds": {
      for (let i = 0; i < 6; i++) {
        const x = (i - 2.5) * r * 0.25;
        const tall = 20 + ((i * 7) % 3) * 6;
        const p = pivot.clone().multiplyScalar(1 / S);
        tube(b, [Q(p.x + x, p.y - 4, p.z - 2), Q(p.x + x * 1.3, p.y + tall * 0.6, p.z - 3), Q(p.x + x * 1.7, p.y + tall, p.z - 2)], 1.2, 0.8, K.autumnGreen, false);
        b.part(new THREE.CapsuleGeometry(1.8 * S, 6 * S, 4, 8), K.boatYellow1, V(p.x + x * 1.6, p.y + tall * 0.85, p.z - 2.2), 1, false).rotation.z = -x * 0.03;
      }
      break;
    }
    case "flower": {
      const at = T(r * 0.35, 1, 3);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const petal = b.part(sphereGeo(), ctx.form.accent ? ctx.accent : K.sakuraPink, at.clone().add(V(Math.cos(a) * 5, Math.sin(a) * 5, 0)), V(7, 7, 2.5));
        petal.rotation.x = -0.3;
      }
      b.part(sphereGeo(), K.carpYellow, at.clone().add(V(0, 0, 1.5)), V(5, 5, 3), false);
      break;
    }
    case "clover": {
      tube(b, [Q(pivot.x / S, pivot.y / S - 2, pivot.z / S), Q(pivot.x / S + 1, pivot.y / S + 8, pivot.z / S), Q(pivot.x / S - 1, pivot.y / S + 13, pivot.z / S)], 1.4, 1.2, K.autumnGreen);
      for (let i = 0; i < 3; i++) {
        const a = Math.PI / 2 + (i - 1) * 2.1;
        const leaf = b.part(plate(smooth([[0, 0], [7, 6], [4, 12], [0, 9], [-4, 12], [-7, 6]], 24), 2.5), K.springGreen, T(-1 + Math.cos(a) * 2, 15 + Math.sin(a) * 2));
        leaf.rotation.z = a - Math.PI / 2;
      }
      break;
    }
    case "tuft": {
      const p = pivot.clone().multiplyScalar(1 / S);
      for (const [dx, lean] of [[-3, -1], [0, 0], [3, 1]] as const) tube(b, [Q(p.x + dx, p.y - 2, p.z), Q(p.x + dx + lean * 2, p.y + 6, p.z + 1), Q(p.x + dx + lean * 5, p.y + 9, p.z - 2)], 2.2, 0.4, ctx.dark);
      break;
    }
    case "icicles": {
      for (let i = 0; i < 7; i++) {
        const a = h.at((i - 3) * 0.32, 1.05 - Math.abs(i - 3) * 0.06, -1);
        spike(b, a.p, new THREE.Vector3(a.n.x * 0.4, 1, a.n.z * 0.3), 10 + (i % 2) * 6 + (i === 3 ? 6 : 0), 2.8, mix(K.springBlue, K.washi, 0.5), true, 6);
      }
      break;
    }
    case "hair": {
      // A shaggy fringe hanging over the brow, and tufts on top.
      for (let i = 0; i < 9; i++) {
        const a = h.at((i - 4) * 0.2, 0.62 + (i % 2) * 0.08, 0);
        spike(b, a.p.clone().add(V(0, 3, 0)), new THREE.Vector3(a.n.x * 0.3, -1, 0.6), 11 + (i % 3) * 2, 3.5, ctx.dark, true, 6);
      }
      for (let i = 0; i < 5; i++) {
        const a = h.at((i - 2) * 0.35, 1.2, 0);
        spike(b, a.p, a.n.clone().add(new THREE.Vector3(0, 0.6, -0.5)), 10, 4, ctx.dark, true, 6);
      }
      break;
    }
  }
  const parts = b.root.children.slice(before);
  if (!parts.length) return undefined;
  const g = b.pivot(parts, pivot);
  g.scale.setScalar(ctx.grow);
  ctx.headParts.push(g);
  if (kind === "spikes" && ctx.body && ctx.body !== h) {
    // A four-legged one has quills all down its back too.
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 9; i++) quill(ctx, ctx.body, Math.PI + (i - 4) * 0.3 + (row % 2) * 0.15, 0.3 + row * 0.32, (14 - row) * ctx.grow);
    }
  }
  return g;
}

/** A quill on a surface, leaning back, tipped with the accent colour (sparks on a lightning one). */
function quill(ctx: Ctx, e: Ell, yaw: number, pitch: number, len: number): void {
  const { b } = ctx;
  const a = e.at(yaw, pitch, -2);
  const dir = a.n.clone().add(new THREE.Vector3(0, 0.2, -0.7)).normalize();
  spike(b, a.p, dir, len, 3.2, ctx.dark, true, 6);
  b.part(new THREE.ConeGeometry(1.6 * S, len * 0.3 * S, 6), ctx.accent, a.p.clone().add(dir.clone().multiplyScalar(len * 0.82 * S)), 1, false).quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
}
