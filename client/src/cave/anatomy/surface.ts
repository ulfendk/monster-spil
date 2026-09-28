import * as THREE from "three";
import type { FormPattern } from "@shared";
import { KANAGAWA } from "../../ui/theme";
import { type Builder, INK, S, shade } from "../monster-model";
import { has, type Ctx } from "./context";
import { Ell, Q, V, band, decal, halo, mix, seeded, smallSphere, sphereGeo, spike, tube } from "./kit";

const K = KANAGAWA;

/**
 * What's painted on a body: stripes, spots, a bee's bands, a pine cone's scales, glowing
 * cracks, moss patches, speckles, a badger's mask, bark ridges, shaggy fur, rock layers —
 * scattered the same way every time (seeded from the species id), and kept off the face.
 */
export function pattern(ctx: Ctx, e: Ell, kind: FormPattern, face?: Ell): void {
  if (kind === "none") return;
  const { b } = ctx;
  const rnd = seeded(ctx.species.id);
  const mark = ctx.form.accent ? ctx.accent : ctx.dark;
  /** Away from the front, where the face is (when the body is the head). */
  const clearOfFace = (yaw: number, pitch: number) => !face || Math.abs(Math.atan2(Math.sin(yaw), Math.cos(yaw))) > 0.9 || pitch > 0.75 || pitch < -0.45;
  switch (kind) {
    case "stripes": {
      for (const yaw of [0.95, 1.4, 1.85, 2.3, 2.75]) {
        for (const side of [-1, 1]) decal(b, e, side * yaw, 0.35, 4.5, e.ry * 0.9, mark, side * 0.15, 2.4);
      }
      decal(b, e, Math.PI, 0.9, 5, e.rz * 0.8, mark, Math.PI / 2, 2.4);
      break;
    }
    case "spots": {
      for (let i = 0; i < 14; i++) {
        const yaw = rnd() * Math.PI * 2;
        const pitch = -0.2 + rnd() * 1.2;
        if (!clearOfFace(yaw, pitch)) continue;
        const s = 5 + rnd() * 6;
        decal(b, e, yaw, pitch, s, s * 0.9, mark, rnd() * 3, 2.4);
      }
      break;
    }
    case "bands": {
      for (const [from, to] of [[0.45, 0.62], [0.05, 0.25], [-0.36, -0.16]] as const) band(b, e, from, to, mark, 0.5);
      break;
    }
    case "layers": {
      for (const [from, to] of [[0.3, 0.42], [-0.05, 0.06], [-0.42, -0.3]] as const) band(b, e, from, to, shade(ctx.colour, -14), 0.4);
      break;
    }
    case "scales": {
      // Rows of overlapping scales over the back and sides, like a pine cone.
      for (let row = 0; row < 6; row++) {
        const pitch = 1.2 - row * 0.28;
        const n = 6 + row * 2;
        for (let i = 0; i < n; i++) {
          const yaw = ((i + (row % 2) * 0.5) / n) * Math.PI * 2;
          if (!clearOfFace(yaw, pitch) || (Math.cos(yaw) > 0.4 && pitch < 0.4)) continue;
          const s = decal(b, e, yaw, pitch, 10, 8, row % 2 ? ctx.dark : shade(ctx.dark, 10), 0, 3.2);
          s.scale.z *= 1.2;
        }
      }
      break;
    }
    case "cracks": {
      // Glowing cracks: jagged lines over the body.
      const glow = ctx.form.accent ? ctx.accent : K.surimiOrange;
      for (let c = 0; c < 7; c++) {
        let yaw = rnd() * Math.PI * 2;
        let pitch = -0.3 + rnd() * 1.1;
        if (!clearOfFace(yaw, pitch)) yaw += Math.PI;
        let dir = rnd() * Math.PI * 2;
        for (let s = 0; s < 4; s++) {
          const len = 6 + rnd() * 4;
          const seg = decal(b, e, yaw, pitch, 1.8, len, glow, dir, 1.4, false, true);
          seg.scale.z = 0.4 * S;
          const step = (len / Math.max(e.rx, e.rz)) * 0.9;
          yaw += Math.cos(dir) * step * 0.2 - Math.sin(dir) * step;
          pitch += Math.cos(dir) * step;
          dir += (rnd() - 0.5) * 1.8;
        }
      }
      break;
    }
    case "patches": {
      const moss = ctx.form.accent ? ctx.accent : K.autumnGreen;
      for (let i = 0; i < 5; i++) {
        const yaw = Math.PI + (rnd() - 0.5) * 3;
        const pitch = 0.3 + rnd() * 0.9;
        for (let j = 0; j < 3; j++) decal(b, e, yaw + (rnd() - 0.5) * 0.4, pitch + (rnd() - 0.5) * 0.3, 8 + rnd() * 6, 6 + rnd() * 5, j ? shade(moss, 8) : moss, rnd() * 3, 3);
      }
      break;
    }
    case "speckles": {
      for (let i = 0; i < 30; i++) {
        const yaw = rnd() * Math.PI * 2;
        const pitch = -0.4 + rnd() * 1.5;
        if (!clearOfFace(yaw, pitch)) continue;
        decal(b, e, yaw, pitch, 2.2, 2.2, rnd() > 0.5 ? shade(ctx.colour, -22) : shade(ctx.colour, 20), 0, 1.4);
      }
      break;
    }
    case "mask": {
      // A badger's face: a white stripe up the middle, dark bands over the eyes.
      const h = ctx.head ?? e;
      decal(b, h, 0, 0.55, h.rx * 0.36, h.ry * 1.1, K.washi, 0, 2.6);
      for (const side of [-1, 1]) decal(b, h, side * 0.45, 0.12, h.rx * 0.6, h.ry * 0.5, K.sumiInk4, side * 0.4, 2.2);
      break;
    }
    case "bark": {
      for (let i = 0; i < 12; i++) {
        const yaw = (i / 12) * Math.PI * 2 + rnd() * 0.2;
        if (!clearOfFace(yaw, 0.2) && Math.cos(yaw) > 0.5) continue;
        decal(b, e, yaw, 0.1 + (rnd() - 0.5) * 0.4, 2.4, e.ry * (0.8 + rnd() * 0.5), shade(ctx.colour, -22), (rnd() - 0.5) * 0.3, 1.8);
      }
      break;
    }
    case "fur": {
      // Shaggy tufts hanging round the sides.
      for (let row = 0; row < 3; row++) {
        const pitch = 0.5 - row * 0.4;
        for (let i = 0; i < 12; i++) {
          const yaw = ((i + row * 0.5) / 12) * Math.PI * 2;
          if (Math.cos(yaw) > 0.55 && row < 2 && face) continue;
          const a = e.at(yaw, pitch, -1);
          spike(b, a.p, new THREE.Vector3(a.n.x * 0.5, -1, a.n.z * 0.5), 8, 3.4, row % 2 ? shade(ctx.colour, -8) : ctx.colour, false, 5);
        }
      }
      break;
    }
  }
}

/**
 * Little things drifting about it, looping for ever: sparks, bubbles, embers, spores, steam,
 * dust, raindrops, mist. Each drifts along its own path and shrinks away before it starts over.
 */
function drift(ticks: Array<(t: number) => void>, count: number, make: (i: number) => THREE.Object3D, move: (o: THREE.Object3D, k: number, i: number) => void, period = 2): void {
  const items = Array.from({ length: count }, (_, i) => make(i));
  for (const o of items) o.userData.noFit = true;
  for (const [i, o] of items.entries()) move(o, i / count, i);
  ticks.push((t) => items.forEach((o, i) => move(o, (t / period + i / count) % 1, i)));
}

/** The extras that go on any body: whiskers, antennae, a lantern, a beard, drifting things, moss… */
export function extras(ctx: Ctx, body: Ell, head: Ell): void {
  const { b } = ctx;
  const rnd = seeded(ctx.species.id + "x");
  const top = body.y + body.ry;
  if (has(ctx, "whiskers")) {
    const m = head.at(0, -0.2, 0).px;
    for (const side of [-1, 1]) {
      for (const k of [-1, 0, 1]) {
        const from = Q(m.x + side * head.rx * 0.25, m.y + k * 1.5, m.z - 1);
        tube(b, [from, Q(from.x + side * 9, from.y + k * 2.5 + 1, from.z - 1), Q(from.x + side * 18, from.y + k * 5, from.z - 3)], 0.6, 0.3, INK, false, { radial: 5, segments: 8 });
      }
    }
  }
  if (has(ctx, "antennae")) {
    for (const side of [-1, 1]) {
      const p = head.at(side * 0.35, 1.0, -1).px;
      const tip = Q(p.x + side * 9, p.y + 16, p.z + 4);
      tube(b, [p, Q(p.x + side * 3, p.y + 9, p.z + 1), tip], 1.4, 1, INK, false, { radial: 6 });
      const glowTip = ctx.type === "lyn";
      (glowTip ? b.flat(sphereGeo(), K.carpYellow, V(tip.x, tip.y, tip.z), V(6, 6, 6)) : b.part(sphereGeo(), ctx.accent, V(tip.x, tip.y, tip.z), V(5, 5, 5))).name = "antenna-tip";
    }
  }
  if (has(ctx, "beard")) {
    const chin = head.at(0, -0.75, -2);
    // White — or, on a grass monster, a tangle of pale roots.
    const beard = b.part(new THREE.ConeGeometry(head.rx * 0.5 * S, head.ry * 0.9 * S, 10), ctx.type === "graes" ? mix(ctx.colour, K.washi, 0.45) : K.fujiWhite, chin.p.clone().add(V(0, -head.ry * 0.3, 2)));
    beard.rotation.x = Math.PI - 0.25;
    ctx.headParts.push(beard);
  }
  if (has(ctx, "wattle")) {
    const chin = head.at(0, -0.55, 0);
    b.part(sphereGeo(), K.autumnRed, chin.p.clone().add(V(0, -5, 2)), V(5, 9, 5));
  }
  if (has(ctx, "cheeks")) {
    for (const side of [-1, 1]) {
      const c = head.at(side * 0.8, -0.3, -2);
      b.part(sphereGeo(), shade(ctx.colour, 6), c.p, V(head.rx * 0.5, head.ry * 0.45, head.rz * 0.45));
    }
  }
  if (has(ctx, "lure")) {
    // An angler's lure: a stalk from the brow bending forward, a glowing bulb.
    const p = head.at(0, 0.7, -1).px;
    const tip = Q(p.x, p.y + 12, p.z + 16);
    tube(b, [p, Q(p.x, p.y + 16, p.z + 3), Q(p.x, p.y + 17, p.z + 12), tip], 1.4, 0.9, shade(ctx.colour, -10), true);
    const bulb = b.flat(sphereGeo(), K.carpYellow, V(tip.x, tip.y - 3, tip.z), V(8, 8, 8));
    ctx.ticks.push(halo(b, bulb.position, 9, 9, 9, K.carpYellow, 1.6));
  }
  if (has(ctx, "lantern")) {
    // A paper lantern hanging from a little stick it holds out in front.
    const hand = body.at(0.5, -0.2, 2).px;
    const end = Q(hand.x + 6, hand.y + 10, hand.z + 12);
    tube(b, [hand, Q(hand.x + 3, hand.y + 8, hand.z + 6), end], 1.2, 1, K.boatYellow1);
    const lantern = new THREE.Group();
    lantern.position.copy(V(end.x, end.y - 2, end.z));
    b.root.add(lantern);
    lantern.add(tube(b, [Q(0, 0, 0), Q(0, -5, 0)], 0.5, 0.5, INK, false, { radial: 4, segments: 2 }));
    lantern.add(b.part(sphereGeo(), K.autumnRed, V(0, -13, 0), V(12, 15, 12)));
    lantern.add(b.flat(sphereGeo(), K.carpYellow, V(0, -13, 3), V(7, 9, 7), 0.9));
    for (const y of [-6, -20]) lantern.add(b.part(new THREE.CylinderGeometry(3.5 * S, 3.5 * S, 2 * S, 12), K.sumiInk4, V(0, y, 0), 1, false));
    ctx.ticks.push((t) => (lantern.rotation.z = Math.sin(t * 1.6) * 0.15));
  }
  if (has(ctx, "moss")) {
    for (let i = 0; i < 4; i++) {
      const a = body.at(Math.PI + (rnd() - 0.5) * 2.2, 0.6 + rnd() * 0.6, -1);
      b.part(sphereGeo(), i % 2 ? K.autumnGreen : shade(K.autumnGreen, 8), a.p, V(10, 5, 9), false);
    }
    // A little mushroom and a sprig.
    const m = body.at(Math.PI * 0.8, 0.9, -1);
    b.part(new THREE.CylinderGeometry(1.2 * S, 1.5 * S, 5 * S, 8), K.washi, m.p.clone().add(V(0, 2, 0)), 1, false);
    b.part(new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), K.autumnRed, m.p.clone().add(V(0, 4.5, 0)), V(8, 6, 8));
  }
  if (has(ctx, "flower")) {
    const at = body.at(0.9, 0.7, 0).p;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.part(sphereGeo(), K.sakuraPink, at.clone().add(V(Math.cos(a) * 3.5, Math.sin(a) * 3.5, 0)), V(5, 5, 2));
    }
    b.part(sphereGeo(), K.carpYellow, at.clone().add(V(0, 0, 1)), V(3.5, 3.5, 2), false);
  }
  if (has(ctx, "icicles")) {
    for (let i = 0; i < 6; i++) {
      const a = body.at((i - 2.5) * 0.5, -0.35, -1);
      spike(b, a.p, new THREE.Vector3(0, -1, 0.1), 8 + (i % 3) * 3, 2.4, mix(K.springBlue, K.washi, 0.5), true, 6);
    }
  }
  if (has(ctx, "acorn")) {
    const at = body.at(0, -0.1, 4).p;
    b.part(sphereGeo(), K.boatYellow1, at, V(9, 11, 9));
    b.part(new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), shade(K.boatYellow1, -20), at.clone().add(V(0, 3, 0)), V(10, 8, 10));
  }
  if (has(ctx, "glow")) {
    // A soft glow about it (a firefly's and a glow-worm's are their own).
    if (ctx.form.body !== "bug" && ctx.form.body !== "worm") ctx.ticks.push(halo(b, body.centre, body.rx * 1.2, body.ry * 1.2, body.rz * 1.2, ctx.accent));
  }

  particles(b, ctx.form.extras ?? [], body, ctx.ticks);
}

/**
 * Little things drifting about a body (px ellipsoid, in the model's own box), looping for ever:
 * sparks, embers, spores, bubbles, steam, dust, mist, raindrops — whichever `kinds` names. For
 * the game's own monsters (`extras`) and sculpted ones alike (blender-model.ts).
 */
export function particles(b: Builder, kinds: readonly string[], body: { x: number; y: number; z: number; rx: number; ry: number; rz: number }, ticks: Array<(t: number) => void>): void {
  const has = (kind: string) => kinds.includes(kind);
  const top = body.y + body.ry;
  if (has("sparks")) {
    drift(
      ticks,
      5,
      () => {
        const g = new THREE.Group();
        const pts: Array<[number, number]> = [[-1.5, 0], [1.5, 0], [0, 5], [3, 5], [-1, 12], [0.5, 6.5], [-2.5, 6.5]];
        g.add(b.flat(new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x * S, y * S))), { depth: 1 * S, bevelEnabled: false }), K.carpYellow, new THREE.Vector3()));
        b.root.add(g);
        return g;
      },
      (o, k, i) => {
        const a = i * 1.3 + k * 2;
        o.position.copy(V(body.x + Math.cos(a) * (body.rx + 8), body.y + body.ry * 0.3 + Math.sin(i * 2.1) * body.ry * 0.6, body.z + Math.sin(a) * (body.rz + 8)));
        o.scale.setScalar(Math.sin(k * Math.PI) * 1.1);
        o.rotation.z = i;
      },
      1.4,
    );
  }
  const rising = (colour: number, n: number, size: number, speed: number, opacity: number, spread = 1) =>
    drift(
      ticks,
      n,
      () => b.flat(smallSphere(), colour, new THREE.Vector3(), V(size, size, size), opacity),
      (o, k, i) => {
        const x = body.x + ((i * 0.37) % 1 - 0.5) * body.rx * 2 * spread + Math.sin(k * 6 + i) * 3;
        const z = body.z + (((i * 0.61) % 1) - 0.5) * body.rz * 1.6 * spread;
        o.position.copy(V(x, top - body.ry * 0.3 + k * 40, z));
        o.scale.setScalar(Math.sin(k * Math.PI) * size * S);
      },
      speed,
    );
  if (has("embers")) rising(K.surimiOrange, 6, 3, 2.2, 1);
  if (has("spores")) rising(mix(K.carpYellow, K.washi, 0.5), 7, 3, 3.4, 0.9, 1.3);
  if (has("bubbles")) {
    drift(
      ticks,
      5,
      () => {
        const g = new THREE.Group();
        g.add(b.flat(new THREE.TorusGeometry(0.5, 0.08, 6, 16), K.washi, new THREE.Vector3(), 1, 0.9));
        g.add(b.flat(sphereGeo(), K.springBlue, new THREE.Vector3(), 0.9, 0.25));
        g.add(b.flat(sphereGeo(), K.washi, V(-0.25 / S, 0.25 / S, 0.3 / S), 0.2, 0.9));
        b.root.add(g);
        return g;
      },
      (o, k, i) => {
        o.position.copy(V(body.x + body.rx * 0.6 + Math.sin(k * 8 + i) * 3 + i * 2, body.y + k * 50, body.z + body.rz * 0.8));
        o.scale.setScalar(Math.sin(k * Math.PI) * (4 + (i % 3) * 2) * S);
      },
      2.6,
    );
  }
  if (has("steam") || has("dust") || has("mist")) {
    const colour = has("dust") ? mix(K.boatYellow2, K.washi, 0.4) : K.washi;
    const low = has("mist") || has("dust");
    drift(
      ticks,
      6,
      () => b.flat(smallSphere(), colour, new THREE.Vector3(), 1, low ? 0.45 : 0.6),
      (o, k, i) => {
        const a = i * 1.05 + k * (low ? 2.5 : 0.5);
        const r = low ? body.rx + 6 + k * 6 : 4 + k * 8;
        const y = low ? -48 + Math.sin(k * Math.PI) * 5 : top - 4 + k * 30;
        o.position.copy(V(body.x + Math.cos(a) * r + (low ? 0 : (i - 2.5) * 5), y, body.z + Math.sin(a) * r * (low ? 1 : 0.5) - (low ? 0 : body.rz * 0.3)));
        o.scale.setScalar(Math.sin(k * Math.PI) * (low ? 14 : 10 + k * 8) * S);
      },
      low ? 3.5 : 2.4,
    );
  }
  if (has("raindrops")) {
    drift(
      ticks,
      6,
      () => {
        const d = b.flat(new THREE.ConeGeometry(0.5, 1.6, 8), K.springBlue, new THREE.Vector3(), 1, 0.9);
        return d;
      },
      (o, k, i) => {
        o.position.copy(V(body.x + (i - 2.5) * body.rx * 0.32, body.y - body.ry * 0.8 - k * 34, body.z + ((i * 7) % 3 - 1) * 6));
        o.scale.setScalar(k < 0.9 ? 3.2 * S : 0.001);
      },
      1.1,
    );
  }
}
