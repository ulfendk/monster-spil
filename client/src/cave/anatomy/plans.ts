import * as THREE from "three";
import type { CreatureForm } from "@shared";
import { KANAGAWA } from "../../ui/theme";
import { INK, type MountRig, S, bodyGeometry, shade } from "../monster-model";
import { has, type Ctx } from "./context";
import type { Plan } from "./index";
import { Ell, GROUND as G, Q, V, blob, decal, flame, flicker, halo, lathe, leafShape, mix, plate, smallSphere, smooth, sphereGeo, spike, taper, teardrop, tube } from "./kit";

const K = KANAGAWA;
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

/** How big it is from its stats: bulk from HP, width from defence, pace from speed (each 0..1). */
function sizes(ctx: Ctx): { bulk: number; wide: number; fast: number } {
  const s = ctx.species.baseStats;
  return { bulk: clamp((s.hp - 30) / 20), wide: clamp((s.forsvar - 6) / 9), fast: clamp((s.fart - 6) / 10) };
}

/** A paw on the ground at (x, z) px: a rounded pad with toe bumps (and claws, or a hoof). */
function paw(ctx: Ctx, x: number, z: number, size: number, colour: number): THREE.Mesh[] {
  const { b } = ctx;
  if (has(ctx, "hooves")) {
    const hoof = b.part(new THREE.CylinderGeometry(size * 0.42 * S, size * 0.5 * S, size * 0.55 * S, 14), K.sumiInk4, V(x, G + size * 0.27, z));
    return [hoof];
  }
  const pad = b.part(sphereGeo(), colour, V(x, G + size * 0.3, z + 1), V(size, size * 0.62, size * 1.1));
  const out = [pad];
  for (const t of [-1, 0, 1]) {
    out.push(b.part(smallSphere(), shade(colour, 6), V(x + t * size * 0.3, G + size * 0.2, z + size * 0.5), V(size * 0.34, size * 0.3, size * 0.34), false));
    if (has(ctx, "claws")) out.push(b.part(new THREE.ConeGeometry(size * 0.08 * S, size * 0.34 * S, 5), K.washi, V(x + t * size * 0.3, G + size * 0.18, z + size * 0.72), 1, false));
  }
  for (const c of out.slice(1)) if (c.geometry.type === "ConeGeometry") c.rotation.x = Math.PI / 2;
  return out;
}

/** A wing of layered feathers (px, from the shoulder, pointing out to +x·side). */
function featherWing(ctx: Ctx, shoulder: THREE.Vector3, side: number, span: number, colour: number): MountRig["wings"][number] {
  const { b } = ctx;
  const parts: THREE.Object3D[] = [];
  // Three rows: long flight feathers, then shorter coverts, then the small ones at the shoulder.
  for (const [k, shadeBy, depth] of [[1, -10, 2], [0.72, 0, 2.6], [0.45, 10, 3.2]] as const) {
    const pts: Array<[number, number]> = [[0, 4]];
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = 0.25 + (i / (n - 1)) * 1.05;
      const r = span * k * (1 - i * 0.1);
      pts.push([Math.cos(a) * r * 0.55 + r * 0.45, -Math.sin(a) * r * 0.55 + 6], [Math.cos(a + 0.12) * r * 0.5 + r * 0.38, -Math.sin(a + 0.12) * r * 0.5 + 4]);
    }
    pts.push([2, -6]);
    const m = b.part(plate(pts.map(([x, y]) => [x * side, y] as [number, number]), depth), shade(colour, shadeBy), shoulder.clone().add(V(0, 0, (1 - k) * 3)));
    parts.push(m);
  }
  const rest = new THREE.Euler(0.2, side * 1.05, side * -0.35);
  const pivot = b.pivot(parts, shoulder);
  pivot.rotation.copy(rest);
  return { pivot, side, rest };
}

/** A clear bug's wing (px) from the back, pointing back and out. */
function bugWing(ctx: Ctx, at: THREE.Vector3, side: number, length: number, width: number, back: number): MountRig["wings"][number] {
  const { b } = ctx;
  const shape = smooth([[0, 0], [width * 0.5, length * 0.3], [width * 0.45, length * 0.8], [0, length], [-width * 0.25, length * 0.6], [-width * 0.2, length * 0.2]], 30);
  const m = b.flat(plate(shape.map(([x, y]) => [x * side, y] as [number, number]), 0.6, 0.3), mix(K.washi, K.springBlue, 0.35), at.clone(), 1, 0.55);
  for (const [a, k] of [[0, 0.9], [0.35, 0.7], [-0.3, 0.6]] as const) {
    const vein = b.flat(new THREE.BoxGeometry(0.5 * S, length * k * S, 0.4 * S), K.sumiInk6, V(Math.sin(a) * side * length * k * 0.5, Math.cos(a) * length * k * 0.5, 0.5), 1, 0.55);
    vein.rotation.z = -a * side;
    m.add(vein);
  }
  const rim = b.flat(plate(shape.map(([x, y]) => [x * side * 1.04, y * 1.03 - 0.3] as [number, number]), 0.3, 0.1), INK, V(0, 0, -0.3), 1, 0.3);
  m.add(rim);
  // Raised in a V over the back, tips out and back.
  const rest = new THREE.Euler(-Math.PI / 2 + 1.0, side * back, side * -0.5);
  const pivot = b.pivot([m], at);
  pivot.rotation.copy(rest);
  return { pivot, side, rest };
}

// ------------------------------------------------------------ blob: a round little yokai, head and body in one

function blobPlan(ctx: Ctx): Plan {
  const { b } = ctx;
  const { bulk, wide } = sizes(ctx);
  const shape = ctx.form.shape ?? "egg";
  const w = 58 + wide * 24;
  const h = 50 + bulk * 18;
  const d = Math.min(w, h) * 0.85;
  const body = new Ell(0, G + 5 + h / 2, 0, w / 2, h / 2, d / 2);
  let head = body;
  let feet = true;
  let bellyOn = true;
  let crown: THREE.Vector3 | undefined;
  switch (shape) {
    case "drop": {
      const hh = h * 1.3;
      b.part(lathe([[0, 0], [0.42, 0.05], [0.5, 0.2], [0.47, 0.38], [0.34, 0.58], [0.16, 0.8], [0.03, 0.97], [0, 1]].map(([r, y]) => [r! * w * 1.02, y! * hh] as [number, number]), 32), ctx.colour, V(0, G + 3, 0), new THREE.Vector3(1, 1, d / w));
      head = new Ell(0, G + 3 + hh * 0.3, 0, w * 0.5, hh * 0.3, d * 0.5);
      crown = V(0, G + 3 + hh * 0.62, 0);
      // A glint of water.
      b.flat(sphereGeo(), K.washi, V(-w * 0.2, G + 3 + hh * 0.62, d * 0.2), V(5, 11, 2), 0.7);
      break;
    }
    case "rock": {
      const rock = b.part(new THREE.DodecahedronGeometry(0.5, 1), ctx.colour, body.centre, V(w, h, d));
      rock.rotation.y = 0.3;
      for (const [x, y, s] of [[-w * 0.35, h * 0.3, 16], [w * 0.3, h * 0.35, 13], [w * 0.1, -h * 0.35, 12]] as const) b.part(new THREE.DodecahedronGeometry(0.5, 0), shade(ctx.colour, -8), V(x, body.y + y, -d * 0.2), V(s, s, s));
      head = new Ell(0, body.y, 0, w * 0.46, h * 0.46, d * 0.5);
      bellyOn = false;
      break;
    }
    case "puffball": {
      blob(b, body, ctx.colour, true, bodyGeometry());
      for (let i = 0; i < 9; i++) {
        const a = body.at((i / 9) * Math.PI * 2, 0.75 + (i % 2) * 0.25, -2);
        b.part(sphereGeo(), shade(ctx.colour, 8), a.p, V(8, 6, 8), false);
      }
      // A frilly skirt round the bottom.
      b.part(new THREE.TorusGeometry(w * 0.36 * S, 4 * S, 8, 24), shade(ctx.colour, -10), V(0, G + 7, 0)).rotation.x = Math.PI / 2;
      bellyOn = false;
      break;
    }
    case "mushroom": {
      // A stem for a body (the face on it) under a big cap.
      const stem = new Ell(0, G + 4 + h * 0.34, 0, w * 0.34, h * 0.36, w * 0.32);
      blob(b, stem, ctx.belly, true, bodyGeometry());
      const capY = stem.y + stem.ry * 0.62;
      const cap = b.part(lathe([[0, -2], [w * 0.62, -2], [w * 0.66, 2], [w * 0.56, 12], [w * 0.4, 22], [w * 0.2, 28], [0, 30]], 32), ctx.colour, V(0, capY, 0));
      cap.rotation.x = -0.1;
      const capEll = new Ell(0, capY + 12, 0, w * 0.56, 16, w * 0.56);
      const rnd = [0.2, 1.3, 2.4, 3.5, 4.6, 5.6, 0.8, 3.0];
      rnd.forEach((yaw, i) => decal(b, capEll, yaw, 0.2 + (i % 3) * 0.3, 8 - (i % 3), 7 - (i % 3), ctx.accent));
      b.part(lathe([[w * 0.6, 0], [w * 0.3, -1.5], [0, -2]], 28), shade(ctx.belly, -12), V(0, capY - 1, 0), 1, false);
      head = stem;
      bellyOn = false;
      break;
    }
    case "star": {
      const R = h * 0.62;
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
        const r = i % 2 ? R * 0.52 : R;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      const star = b.part(plate(pts, d * 0.45, 5), ctx.colour, V(0, G + 4 + R * 0.95, 0));
      ctx.ticks.push((t) => (star.rotation.z = Math.sin(t * 1.2) * 0.06));
      head = new Ell(0, G + 4 + R * 0.9, 0, R * 0.5, R * 0.5, d * 0.26 + 4);
      bellyOn = false;
      feet = false;
      break;
    }
    case "cone": {
      // A stalagmite: rings of stone where it grew, and a drop of water on its tip.
      const hh = h * 1.35;
      const prof: Array<[number, number]> = [[0, 0], [w * 0.5, 0], [w * 0.5, hh * 0.1]];
      for (const [k, r] of [[0.3, 0.44], [0.5, 0.33], [0.7, 0.22], [0.86, 0.12]] as const) prof.push([w * (r + 0.05), hh * (k - 0.03)], [w * r, hh * k]);
      prof.push([w * 0.04, hh], [0, hh * 1.02]);
      b.part(lathe(prof, 11), ctx.colour, V(0, G + 3, 0), new THREE.Vector3(1, 1, d / w));
      const drop = b.part(teardrop(10, 7), ctx.accent, V(0, G + 3 + hh * 1.02 + 1, 0));
      ctx.ticks.push((t) => drop.scale.setScalar(0.85 + ((t * 0.5) % 1) * 0.3));
      head = new Ell(0, G + 3 + hh * 0.26, 0, w * 0.46, hh * 0.24, d * 0.46);
      crown = V(0, G + 3 + hh * 0.72, 0);
      bellyOn = false;
      break;
    }
    default:
      blob(b, body, ctx.colour, true, bodyGeometry());
  }
  if (bellyOn) b.part(sphereGeo(), ctx.belly, V(0, body.y - h * 0.2, d * 0.22), V(w * 0.6, h * 0.46, d * 0.56), false);
  const feetGroups: THREE.Group[] = [];
  const arms: THREE.Group[] = [];
  if (feet) {
    for (const side of [-1, 1]) {
      const fx = side * w * 0.26;
      feetGroups.push(b.pivot(paw(ctx, fx, head.z + d * 0.14, 20, ctx.dark), V(fx, G + 5, d * 0.14)));
      const armAt = head.at(side * 1.25, -0.25, -3);
      const arm = b.part(sphereGeo(), shade(ctx.colour, -6), armAt.p, V(11, 19, 12));
      arm.rotation.set(-0.5, 0, side * 0.55);
      arms.push(b.pivot([arm], armAt.p.clone().add(V(0, 6, -2))));
    }
  }
  return {
    body,
    head,
    feet: feetGroups,
    arms,
    wings: wingsFor(ctx, body),
    tailBase: body.at(Math.PI, -0.35, -2).px,
    seat: V(0, body.y + body.ry * 0.8, -body.rz * 0.4),
    feetY: G,
    gait: "waddle",
    face: { eyeSize: head.ry * 0.34, eyeYaw: 0.4 },
    ...(crown ? { crown } : shape === "mushroom" ? { crown: null } : {}),
  };
}

/** A species' own wings (from its JSON "wings"): bat or feather, joined to the upper back. */
function wingsFor(ctx: Ctx, body: Ell): MountRig["wings"] {
  const kind = ctx.species.wings;
  if (!kind) return [];
  const { b } = ctx;
  const wings: MountRig["wings"] = [];
  for (const side of [-1, 1]) {
    const shoulder = body.at(side * 2.2, 0.35, -3).p;
    if (kind === "feather") {
      wings.push(featherWing(ctx, shoulder, side, 40, mix(ctx.colour, K.washi, 0.25)));
      continue;
    }
    const pts: Array<[number, number]> = [[0, -2], [16, 22], [44, 36], [38, 16], [48, 4], [32, -2], [30, -16], [10, -12]];
    const colour = shade(ctx.colour, -24);
    const m = b.part(plate(pts.map(([x, y]) => [x * side, y] as [number, number]), 2.4), colour, shoulder.clone());
    for (const [x, y] of [[44, 36], [48, 4], [30, -16]] as const) {
      const bone = tube(b, [Q(0, 0, 1.6), Q(x * side * 0.5, y * 0.5 + 2, 1.8), Q(x * side, y, 1.6)], 1, 0.6, shade(colour, -20), false, { radial: 5, segments: 6 });
      m.add(bone);
    }
    const rest = new THREE.Euler(0, side * 0.55, side * 0.1);
    const pivot = b.pivot([m], shoulder);
    pivot.rotation.copy(rest);
    wings.push({ pivot, side, rest });
  }
  return wings;
}

// ------------------------------------------------------------ beast: four legs, a head in front

function beastPlan(ctx: Ctx): Plan {
  const { b } = ctx;
  const { bulk, wide } = sizes(ctx);
  const f = ctx.form;
  const stocky = f.build === "stocky";
  const legs = f.legs ?? "short";
  const legLen = legs === "long" ? 22 : legs === "stubby" ? 6 : 12;
  const H = 28 + bulk * 10 + (stocky ? 8 : 0);
  const W = 34 + wide * 12 + (stocky ? 10 : 0);
  const L = 50 + bulk * 10 + (f.build === "long" ? 14 : 0) + (stocky ? 6 : 0);
  const body = new Ell(0, G + legLen + H * 0.44, -8, W / 2, H / 2, L / 2);
  blob(b, body, ctx.colour, true, bodyGeometry());
  b.part(sphereGeo(), ctx.belly, V(0, body.y - body.ry * 0.32, body.z + body.rz * 0.1), V(body.rx * 1.5, body.ry * 1.1, body.rz * 1.6), false);
  const shell = has(ctx, "carapace");
  const lizard = legs === "stubby" && f.build === "long";
  // A tortoise's head is small, poking out in front; a lizard's flat and wide.
  const hr = clamp(H * 0.7, 19, 27) * (stocky ? 0.9 : 1) * (shell ? 0.62 : 1);
  const lift = legs === "long" ? 12 : 0;
  const head = shell
    ? new Ell(0, body.y + body.ry * 0.1, body.z + body.rz * 1.15, hr * 1.05, hr, hr * 1.05)
    : lizard
      ? new Ell(0, body.y + body.ry * 0.25, body.z + body.rz * 0.95, hr * 1.1, hr * 0.72, hr * 1.1)
      : new Ell(0, body.y + body.ry * 0.5 + hr * 0.4 + lift, body.z + body.rz * 0.82, hr * 1.04, hr * 0.94, hr * 0.94);
  if (shell) tube(b, [Q(0, body.y, body.z + body.rz * 0.5), Q(0, head.y - 2, head.z - hr * 0.5)], hr * 0.55, hr * 0.5, ctx.colour);
  blob(b, head, ctx.colour, true, bodyGeometry());
  // A lighter chest under the chin.
  if (!shell) b.part(sphereGeo(), ctx.belly, V(0, body.y + body.ry * 0.05, body.z + body.rz * 0.78), V(body.rx * 1.1, body.ry * 1.2, body.rz * 0.5), false);
  if (lift) {
    // A neck up to the raised head.
    tube(b, [Q(0, body.y + body.ry * 0.4, body.z + body.rz * 0.6), Q(0, head.y - hr * 0.3, head.z - hr * 0.35)], hr * 0.45, hr * 0.4, ctx.colour);
  }

  // Legs: front left, front right, back right, back left — a trot steps the diagonals together.
  const feet: THREE.Group[] = [];
  const legR = 4.5 + bulk * 2 + (stocky ? 2 : 0);
  const splay = legs === "stubby" ? 8 : 0;
  for (const [sx, sz] of [[-1, 1], [1, 1], [1, -1], [-1, -1]] as const) {
    const hip = V(sx * body.rx * 0.55, body.y - body.ry * 0.2, body.z + sz * body.rz * 0.52);
    const x = sx * (body.rx * 0.6 + splay);
    const z = body.z + sz * body.rz * 0.52;
    const leg = tube(b, [Q(hip.x / S, hip.y / S, hip.z / S), Q(x * 0.95, G + legLen * 0.5 + 3, z + 1), Q(x, G + 4, z + 1)], legR, legR * 0.8, mix(ctx.colour, ctx.dark, 0.35));
    feet.push(b.pivot([leg, ...paw(ctx, x, z + 1, legR * 2.6, ctx.dark)], hip));
  }

  if (has(ctx, "carapace")) {
    // A tortoise's domed shell of plates, with a rim.
    const shellColour = ctx.form.accent ? ctx.accent : K.boatYellow1;
    const dome = new Ell(0, body.y - body.ry * 0.25, body.z, body.rx * 1.3, body.ry * 1.55, body.rz * 1.18);
    b.part(new THREE.SphereGeometry(0.5, 30, 16, 0, Math.PI * 2, 0, Math.PI / 2), shellColour, dome.centre, V(dome.rx * 2, dome.ry * 2, dome.rz * 2));
    b.part(new THREE.TorusGeometry(0.5, 0.06, 8, 36), shade(shellColour, -18), dome.centre, V(dome.rx * 2, dome.rz * 2, 20)).rotation.x = Math.PI / 2;
    const plateAt: Array<[number, number]> = [[0, 1.4], [0.9, 0.9], [-0.9, 0.9], [2.2, 0.9], [-2.2, 0.9], [Math.PI, 0.9], [0, 0.45], [1.2, 0.35], [-1.2, 0.35], [2.2, 0.35], [-2.2, 0.35], [Math.PI, 0.35]];
    for (const [yaw, pitch] of plateAt) decal(b, dome, yaw, pitch, 16, 13, shade(shellColour, 14), 0, 2.4, true);
  }
  if (has(ctx, "ridge")) {
    // A row down the spine: flames on a fiery one, plates on the rest.
    const fl: THREE.Group[] = [];
    for (let i = 0; i < 5; i++) {
      const a = body.at(0, Math.PI / 2 - 0.3 - i * 0.28, -2);
      const at = V(0, a.px.y, body.z + body.rz * (0.45 - i * 0.26));
      if (ctx.type === "ild") fl.push(flame(b, at, 13 - i, 8 - i * 0.6, 0));
      else b.part(plate([[-5, 0], [5, 0], [0, 11 - i]], 2.5), ctx.accent, at).rotation.y = Math.PI / 2;
    }
    if (fl.length) ctx.ticks.push(flicker(fl));
  }
  if (has(ctx, "backfin")) {
    const fin = b.part(plate(smooth([[-L * 0.4, 0], [-L * 0.3, 8], [-L * 0.1, 14], [L * 0.05, 10], [L * 0.2, 16], [L * 0.35, 6], [L * 0.4, 0]], 40), 2.2), mix(ctx.colour, ctx.accent, 0.5), V(0, body.y + body.ry * 0.85, body.z));
    fin.rotation.y = Math.PI / 2;
  }
  return {
    body,
    head,
    feet,
    arms: [],
    wings: wingsFor(ctx, body),
    tailBase: body.at(Math.PI, 0.25, -2).px,
    seat: V(0, body.y + body.ry - 1, body.z - body.rz * 0.12),
    feetY: G,
    gait: "trot",
    hips: true,
    face: lizard ? { eyeSize: hr * 0.5, eyePitch: 0.38, eyeYaw: 0.5, mouthWidth: hr * 0.9 } : { eyeSize: hr * 0.36, eyePitch: 0.12 },
  };
}

// ------------------------------------------------------------ biped: standing on two legs, a head on top

function bipedPlan(ctx: Ctx): Plan {
  const { b } = ctx;
  const { bulk, wide } = sizes(ctx);
  const build = ctx.form.build ?? "normal";
  const stocky = build === "stocky";
  const chibi = build === "chibi";
  const bw = (chibi ? 34 : stocky ? 50 : 38) + wide * (stocky ? 12 : 10);
  const bh = (chibi ? 30 : stocky ? 44 : 36) + bulk * (stocky ? 10 : 8);
  const hr = chibi ? 23 : stocky ? 17 : 20;
  const legLen = chibi ? 6 : stocky ? 12 : 9;
  const body = new Ell(0, G + legLen + bh / 2 - 2, 0, bw / 2, bh / 2, bw * 0.42);
  blob(b, body, ctx.colour, true, bodyGeometry());
  b.part(sphereGeo(), ctx.belly, V(0, body.y - bh * 0.08, body.rz * 0.42), V(bw * 0.62, bh * 0.66, body.rz * 1.2), false);
  const head = stocky
    ? new Ell(0, body.y + bh * 0.42 + hr * 0.6, body.rz * 0.45, hr * 1.05, hr, hr * 0.95)
    : new Ell(0, body.y + bh * 0.5 + hr * 0.72, 1, hr * 1.04, hr * 0.96, hr * 0.94);
  blob(b, head, ctx.colour, true, bodyGeometry());

  const feet: THREE.Group[] = [];
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const hipX = side * bw * 0.26;
    const hip = V(hipX, body.y - bh * 0.3, 0);
    const legR = stocky ? 7 : 5;
    const leg = tube(b, [Q(hipX, body.y - bh * 0.3, 0), Q(hipX * 1.05, G + 5, 2)], legR, legR * 0.85, shade(ctx.colour, -6));
    feet.push(b.pivot([leg, ...paw(ctx, hipX * 1.05, 4, legR * 3, ctx.dark)], hip));
    // Arms from the shoulders: long and low for a troll, little ones held forward for the rest.
    const sh = stocky ? body.at(side * 1.35, 0.35, -3).px : body.at(side * 1.15, 0.2, -4).px;
    const hand = stocky ? Q(sh.x + side * 6, G + 18, sh.z + 8) : Q(sh.x + side * 3, sh.y - 7, sh.z + 11);
    const armColour = shade(ctx.colour, -8);
    const arm = tube(b, [sh, Q((sh.x + hand.x) / 2 + side * 2, (sh.y + hand.y) / 2 + 1, (sh.z + hand.z) / 2), hand], stocky ? 6 : 4.5, stocky ? 5 : 4, armColour);
    const fist = b.part(sphereGeo(), armColour, V(hand.x, hand.y, hand.z), V(stocky ? 14 : 9, stocky ? 13 : 8, stocky ? 14 : 9));
    const parts: THREE.Object3D[] = [arm, fist];
    if (has(ctx, "claws")) for (const t of [-1, 0, 1]) parts.push(spike(b, V(hand.x + t * 3, hand.y - 3, hand.z + 4), new THREE.Vector3(0, -0.5, 1), 5, 1.2, K.washi, false, 5));
    arms.push(b.pivot(parts, V(sh.x, sh.y, sh.z)));
  }
  return {
    body,
    head,
    feet,
    arms,
    wings: wingsFor(ctx, body),
    tailBase: body.at(Math.PI, -0.35, -2).px,
    seat: stocky ? V(0, body.y + body.ry - 2, body.z - body.rz * 0.45) : V(0, head.y + head.ry * 0.8, head.z - head.rz * 0.3),
    feetY: G,
    gait: stocky ? "stomp" : "waddle",
    hips: true,
    face: { eyeSize: hr * (chibi ? 0.38 : 0.34), eyePitch: 0.1 },
  };
}

// ------------------------------------------------------------ bird: feathered, beaked, on thin legs

function birdPlan(ctx: Ctx): Plan {
  const { b } = ctx;
  const { bulk, wide } = sizes(ctx);
  const chibi = ctx.form.build === "chibi";
  const neck = has(ctx, "neck");
  const legLen = chibi ? 8 : 12;
  const body = chibi
    ? new Ell(0, G + legLen + 24 + bulk * 4, 0, 26 + wide * 6, 26 + bulk * 5, 25)
    : new Ell(0, G + legLen + 20 + bulk * 3, -6, 21 + wide * 6, 21 + bulk * 5, 27);
  blob(b, body, ctx.colour, true, bodyGeometry());
  b.part(sphereGeo(), ctx.belly, V(0, body.y - body.ry * 0.2, body.z + body.rz * 0.35), V(body.rx * 1.3, body.ry * 1.4, body.rz * 1.1), false);
  let head = body;
  if (!chibi) {
    head = neck ? new Ell(0, body.y + body.ry + 34, body.z + body.rz + 6, 14, 13, 14) : new Ell(0, body.y + body.ry * 0.85 + 10, body.z + body.rz * 0.55, 17, 16, 16);
    if (neck) tube(b, [Q(0, body.y + body.ry * 0.5, body.z + body.rz * 0.6), Q(0, body.y + body.ry + 10, body.z + body.rz + 8), Q(0, head.y - 10, head.z - 10), Q(0, head.y - 4, head.z - 3)], 7, 6, ctx.colour, true, { segments: 24 });
    blob(b, head, ctx.colour, true, bodyGeometry());
  }
  const feet: THREE.Group[] = [];
  const legColour = ctx.type === "vand" || ctx.type === "lyn" ? K.surimiOrange : K.carpYellow;
  for (const side of [-1, 1]) {
    const x = side * body.rx * 0.4;
    const hip = V(x, body.y - body.ry * 0.7, body.z + 2);
    const leg = tube(b, [Q(x, body.y - body.ry * 0.7, body.z + 2), Q(x, G + 2, body.z + 4)], 2, 1.6, legColour, true, { radial: 6 });
    const toes = [-0.5, 0, 0.5].map((a) => tube(b, [Q(x, G + 1.5, body.z + 4), Q(x + Math.sin(a) * 8, G + 1, body.z + 4 + Math.cos(a) * 8)], 1.6, 1, legColour, true, { radial: 6, segments: 4 }));
    feet.push(b.pivot([leg, ...toes], hip));
  }
  const wings: MountRig["wings"] = [];
  for (const side of [-1, 1]) {
    const shoulder = body.at(side * 1.45, 0.3, -2).p;
    wings.push(featherWing(ctx, shoulder, side, chibi ? 26 : 36, shade(ctx.colour, -6)));
  }
  return {
    body,
    head,
    feet,
    arms: [],
    wings,
    tailBase: body.at(Math.PI, 0.05, -2).px,
    seat: V(0, body.y + body.ry - 2, body.z - body.rz * 0.2),
    feetY: G,
    gait: "fly",
    hips: true,
    face: { eyeSize: head.ry * (chibi ? 0.36 : 0.4), eyeYaw: chibi ? 0.4 : 0.5, eyePitch: chibi ? 0.1 : 0.2 },
  };
}

// ------------------------------------------------------------ fish: swimming in the air, fins and a tail fin

function fishPlan(ctx: Ctx): Plan {
  const { b } = ctx;
  const { bulk, wide } = sizes(ctx);
  const long = ctx.form.snout === "long" || ctx.form.build === "long";
  const body = new Ell(0, -4, 0, 15 + wide * 5, (long ? 15 : 20) + bulk * 5, (long ? 38 : 30) + bulk * 4);
  blob(b, body, ctx.colour, true, bodyGeometry());
  b.part(sphereGeo(), ctx.belly, V(0, body.y - body.ry * 0.35, body.z + 2), V(body.rx * 1.7, body.ry * 1.2, body.rz * 1.8), false);
  const veil = has(ctx, "veil");
  const finColour = mix(ctx.colour, ctx.accent, 0.5);
  // The fin along the back.
  const dorsal = b.part(plate(smooth([[-body.rz * 0.5, 0], [-body.rz * 0.2, veil ? 22 : 13], [body.rz * 0.25, veil ? 16 : 10], [body.rz * 0.4, 0]], 30), 2), finColour, V(0, body.y + body.ry * 0.8, body.z - 3));
  dorsal.rotation.y = Math.PI / 2;
  // Fins at the sides, paddling.
  const fins: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const at = body.at(side * 1.1, -0.25, -1);
    const shape = smooth([[0, 0], [side * 6, -4], [side * (veil ? 24 : 14), -12], [side * (veil ? 20 : 10), 2]], 24);
    const fin = b.part(plate(shape, 1.8), finColour, at.p);
    fin.rotation.set(0.7, -side * 0.5, side * 0.2);
    const g = b.pivot([fin], at.p);
    fins.push(g);
    const under = body.at(side * 2.2, -0.75, -1);
    const small = b.part(plate(smooth([[0, 0], [side * 4, -8], [side * (veil ? 14 : 9), -12], [side * 2, -3]], 20), 1.6), finColour, under.p);
    small.rotation.y = -side * 1.2;
  }
  ctx.ticks.push((t) => fins.forEach((f, i) => (f.rotation.y = Math.sin(t * 5 + i * Math.PI) * 0.35)));
  return {
    body,
    head: body,
    feet: [],
    arms: [],
    wings: [],
    tailBase: body.at(Math.PI, 0, -3).px,
    tailSize: veil ? 1.35 : 1,
    seat: V(0, body.y + body.ry, body.z),
    feetY: G,
    gait: "swim",
    face: { eyeYaw: 0.62, eyePitch: 0.22, eyeSize: body.ry * 0.4 },
    hover: true,
  };
}

// ------------------------------------------------------------ bug: head, thorax, abdomen, six legs

function bugPlan(ctx: Ctx): Plan {
  const { b } = ctx;
  const { bulk } = sizes(ctx);
  const strider = has(ctx, "strider");
  const winged = has(ctx, "bugwings");
  const pincers = has(ctx, "pincers");
  const hover = winged && !has(ctx, "elytra") && !pincers;
  const y0 = hover ? -6 : G + (strider ? 12 : 18);
  const round = ctx.form.pattern === "bands";
  const head = new Ell(0, y0 + 6, 20, 15, 14, 13);
  const thorax = new Ell(0, y0 + 1, 6, 12, 11, 11);
  const abdomen = round ? new Ell(0, y0 + 4, -16, 21 + bulk * 3, 20 + bulk * 3, 22) : new Ell(0, y0 + 3, strider ? -22 : -18, strider ? 9 : 17 + bulk * 4, strider ? 8 : 14 + bulk * 3, strider ? 22 : 22 + bulk * 3);
  blob(b, abdomen, ctx.colour, true, bodyGeometry());
  blob(b, thorax, shade(ctx.colour, -10));
  blob(b, head, ctx.colour, true, bodyGeometry());
  if (round) {
    // Fuzz round a bee's middle.
    for (let i = 0; i < 10; i++) {
      const a = thorax.at((i / 10) * Math.PI * 2, 0.3, -1);
      b.part(sphereGeo(), mix(ctx.colour, K.washi, 0.3), a.p, V(6, 6, 6), false);
    }
  }
  // Six legs: up to the knee, down to the ground (a water strider's long and spread out).
  const legColour = ctx.form.accent && !round ? ctx.accent : K.sumiInk4;
  const legs = new Map<string, THREE.Group>();
  for (const side of [-1, 1]) {
    for (const [i, z] of [[0, 12], [1, 5], [2, -2]] as const) {
      const reach = strider ? (i === 0 ? 20 : 44) : 24 + i * 2;
      const hip = Q(side * 8, y0 - 3, z);
      // (A flier's legs hang tucked under it, bent.)
      const knee = hover ? Q(side * 14, y0 - 6, z + (i - 1) * 5) : Q(side * (reach * 0.6), y0 + (strider ? 12 : 8), z + (i - 1) * (strider ? 16 : 6));
      const foot = hover ? Q(side * 12, y0 - 14, z + (i - 1) * 6 + 4) : Q(side * reach, G + 1, z + (i - 1) * (strider ? 30 : 10));
      const leg = tube(b, [hip, knee, foot], hover ? 1.2 : 1.8, hover ? 0.8 : 1.1, hover ? K.sumiInk4 : legColour, true, { radial: 6, segments: 10 });
      legs.set(`${side}${i}`, b.pivot([leg], V(hip.x, hip.y, hip.z)));
    }
  }
  // Three at a time step together: front and back on one side, the middle on the other.
  const feet = ["-10", "10", "11", "-11", "-12", "12"].map((k) => legs.get(k)!);
  if (pincers) {
    for (const side of [-1, 1]) {
      const sh = Q(side * 10, y0, 16);
      const wrist = Q(side * 22, y0 + 6, 32);
      tube(b, [sh, Q(side * 20, y0 + 2, 22), wrist], 4, 3.4, ctx.colour);
      const claw = new Ell(side * 24, y0 + 7, 38, 8, 6, 9);
      blob(b, claw, shade(ctx.colour, 6));
      spike(b, V(side * 21, y0 + 11, 41), new THREE.Vector3(side * -0.2, 0.1, 1), 12, 3.4, shade(ctx.colour, -8));
      spike(b, V(side * 27, y0 + 5, 41), new THREE.Vector3(side * -0.3, 0, 1), 11, 3.2, shade(ctx.colour, -8));
    }
  }
  if (has(ctx, "elytra")) {
    // Hard wing covers over the back, split down the middle.
    for (const side of [-1, 1]) {
      const cover = b.part(new THREE.SphereGeometry(0.5, 24, 16, side > 0 ? 0 : Math.PI, Math.PI, 0, Math.PI * 0.62), shade(ctx.colour, 6), abdomen.centre.clone().add(V(side * 0.8, 1, 0)), V(abdomen.rx * 2.14, abdomen.ry * 2.2, abdomen.rz * 2.12));
      cover.rotation.z = side * 0.05;
    }
    // Its pattern on the covers (bark ridges, spots).
    const covers = new Ell(abdomen.x, abdomen.y + 1, abdomen.z, abdomen.rx * 1.07, abdomen.ry * 1.1, abdomen.rz * 1.06);
    ctx.body = covers;
    b.flat(new THREE.BoxGeometry(1.4 * S, 2 * S, abdomen.rz * 2 * S), INK, V(0, abdomen.y + abdomen.ry * 1.08, abdomen.z));
  }
  const wings: MountRig["wings"] = [];
  if (winged) {
    for (const side of [-1, 1]) {
      wings.push(bugWing(ctx, V(side * 4, thorax.y + thorax.ry * 0.8, thorax.z - 2), side, 30, 16, 0.5));
      wings.push(bugWing(ctx, V(side * 4, thorax.y + thorax.ry * 0.7, thorax.z - 6), side, 22, 12, 0.9));
    }
  }
  if (has(ctx, "glow")) {
    // A glowing end (a firefly's).
    const end = new Ell(0, abdomen.y - 2, abdomen.z - abdomen.rz * 0.45, abdomen.rx * 0.75, abdomen.ry * 0.7, abdomen.rz * 0.55);
    b.flat(sphereGeo(), K.carpYellow, end.centre, V(end.rx * 2, end.ry * 2, end.rz * 2));
    ctx.ticks.push(halo(b, end.centre, end.rx * 1.4, end.ry * 1.4, end.rz * 1.4, K.carpYellow, 1.5));
  }
  if (!has(ctx, "antennae")) {
    for (const side of [-1, 1]) {
      const p = head.at(side * 0.3, 0.9, -1).px;
      const tip = Q(p.x + side * 8, p.y + 14, p.z + 8);
      tube(b, [p, Q(p.x + side * 4, p.y + 10, p.z + 2), tip], 1.2, 0.8, INK, false, { radial: 5 });
      b.part(sphereGeo(), ctx.accent, V(tip.x, tip.y, tip.z), V(4.5, 4.5, 4.5));
    }
  }
  return {
    body: abdomen,
    head,
    feet,
    arms: [],
    wings,
    tailBase: abdomen.at(Math.PI, 0.2, -2).px,
    seat: V(0, abdomen.y + abdomen.ry, abdomen.z),
    feetY: G,
    gait: hover ? "drift" : "skitter",
    hips: true,
    face: { eyeYaw: 0.55, eyePitch: 0.18, eyeSize: head.ry * 0.5 },
    hover,
  };
}

// ------------------------------------------------------------ frog: squat and wide, eyes up on top

function frogPlan(ctx: Ctx): Plan {
  const { b } = ctx;
  const { bulk, wide } = sizes(ctx);
  const body = new Ell(0, G + 19 + bulk * 3, 0, 30 + wide * 6, 19 + bulk * 4, 25);
  blob(b, body, ctx.colour, true, bodyGeometry());
  // A pale throat.
  b.part(sphereGeo(), ctx.belly, V(0, body.y - body.ry * 0.35, body.rz * 0.35), V(body.rx * 1.4, body.ry * 1.1, body.rz * 1.2), false);
  // The eye bumps.
  const eyeYaw = 0.42;
  const eyePitch = 0.55;
  for (const side of [-1, 1]) {
    const a = body.at(side * eyeYaw, eyePitch, -6);
    b.part(sphereGeo(), ctx.colour, a.p, V(20, 18, 16));
  }
  const bumpHead = new Ell(0, body.y + 4, body.z + 2, body.rx * 1.02, body.ry * 1.2, body.rz * 1.05);
  const feet: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    // Folded back legs: a big thigh and a long webbed foot pointing forward.
    const thigh = new Ell(side * body.rx * 0.8, G + 12, -body.rz * 0.35, 11, 12, 16);
    const t = blob(b, thigh, shade(ctx.colour, -4), true, bodyGeometry());
    const foot = b.part(plate(smooth([[0, 0], [6, 4], [9, 16], [4, 13], [0, 18], [-4, 13], [-9, 16], [-6, 4]], 30), 2), shade(ctx.colour, -12), V(side * (body.rx * 0.8 + 3), G + 1.5, -body.rz * 0.2));
    foot.rotation.x = -Math.PI / 2;
    feet.push(b.pivot([t, foot], V(thigh.x, thigh.y, thigh.z)));
    // Little front legs.
    const sh = body.at(side * 0.7, -0.4, -2).px;
    tube(b, [sh, Q(sh.x + side * 3, G + 3, sh.z + 6)], 3.5, 3, ctx.colour);
    for (const a of [-0.5, 0, 0.5]) b.part(sphereGeo(), shade(ctx.colour, -8), V(sh.x + side * 3 + Math.sin(a) * 4, G + 1.5, sh.z + 7 + Math.cos(a) * 4), V(4, 3, 4), false);
  }
  return {
    body,
    head: bumpHead,
    feet,
    arms: [],
    wings: [],
    tailBase: undefined,
    seat: V(0, body.y + body.ry, -4),
    feetY: G,
    gait: "bound",
    hips: true,
    face: { eyeYaw: 0.4, eyePitch: 0.62, eyeSize: 12, mouthWidth: body.rx * 0.8, mouthOn: { e: body, yaw: 0, pitch: -0.05 } },
  };
}

// ------------------------------------------------------------ eyes on stalks (a snail's, a crab's)

function stalkEyes(ctx: Ctx, from: Array<THREE.Vector3>, length: number, lean: number): (shut: boolean) => void {
  const { b } = ctx;
  const lids: THREE.Object3D[] = [];
  from.forEach((p, i) => {
    const side = i === 0 ? -1 : 1;
    const tip = Q(p.x + side * lean, p.y + length, p.z + 3);
    tube(b, [p, Q(p.x + side * lean * 0.3, p.y + length * 0.6, p.z + 1), tip], 2.4, 2, ctx.colour, true, { radial: 8 });
    b.part(sphereGeo(), K.washi, V(tip.x, tip.y + 3, tip.z), V(10, 10, 10));
    b.flat(sphereGeo(), INK, V(tip.x, tip.y + 3, tip.z + 3.4), V(5.2, 6, 3));
    b.flat(sphereGeo(), K.washi, V(tip.x - 1, tip.y + 4.6, tip.z + 5), V(1.8, 1.8, 1));
    const lid = b.part(sphereGeo(), ctx.colour, V(tip.x, tip.y + 3, tip.z), V(11, 11, 11), false);
    lid.visible = false;
    lids.push(lid);
  });
  return (shut) => lids.forEach((l) => (l.visible = shut));
}

// ------------------------------------------------------------ snail: a foot, a shell coiled on its back, eyes on stalks

function snailPlan(ctx: Ctx): Plan {
  const { b } = ctx;
  const foot = new Ell(0, G + 8, 0, 17, 9, 36);
  blob(b, foot, ctx.colour, true, bodyGeometry());
  const head = new Ell(0, G + 20, 26, 14, 15, 12);
  blob(b, head, ctx.colour, true, bodyGeometry());
  // The shell: round, standing up on the back like a wheel, a spiral groove winding in on each
  // side (glowing with lava on a fiery one).
  const shellColour = ctx.form.accent ? ctx.accent : mix(K.katanaGray, ctx.colour, 0.3);
  const cy = G + 38;
  const cz = -8;
  const R = 28;
  const shell = new Ell(0, cy, cz, 15, R, R);
  blob(b, shell, shellColour);
  b.part(sphereGeo(), shade(shellColour, 10), V(0, cy + R * 0.4, cz + R * 0.1), V(24, R * 0.9, R * 1.2), false);
  const groove = ctx.type === "ild" ? K.surimiOrange : shade(shellColour, -24);
  for (const side of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 60; i++) {
      const a = (i / 60) * Math.PI * 4.4;
      const r = R * 0.9 * (1 - i / 64);
      const y = Math.sin(a) * r;
      const z = -Math.cos(a) * r;
      // On the shell's surface at that point.
      const x = side * 15 * Math.sqrt(Math.max(0.02, 1 - (y / R) ** 2 - (z / R) ** 2));
      pts.push(Q(x + side * 0.6, cy + y, cz + z));
    }
    // (Lava glows: flat colour, untouched by light.)
    if (ctx.type === "ild") b.flat(taper(pts, 2.2, 1.2, { segments: 120, radial: 6 }), groove, new THREE.Vector3());
    else tube(b, pts, 2, 1.2, groove, false, { segments: 120, radial: 6 });
  }
  const blink = stalkEyes(ctx, [head.at(-0.35, 0.8, -2).px, head.at(0.35, 0.8, -2).px], 16, 5);
  // Little feelers below.
  for (const side of [-1, 1]) {
    const p = head.at(side * 0.5, -0.3, -1).px;
    tube(b, [p, Q(p.x + side * 5, p.y - 2, p.z + 7)], 2, 1.4, ctx.colour, true, { radial: 6, segments: 4 });
  }
  return {
    body: foot,
    head,
    feet: [],
    arms: [],
    wings: [],
    seat: V(0, cy + 26, cz),
    feetY: G,
    gait: "glide",
    face: { eyes: "stalks", eyePitch: 0.2, mouthOn: { e: head, yaw: 0, pitch: -0.25 } },
    blink,
  };
}

// ------------------------------------------------------------ shell: a mussel, peeking out between its valves

function shellPlan(ctx: Ctx): Plan {
  const { b } = ctx;
  const shellColour = ctx.colour;
  const W = 34;
  const hinge = V(0, G + 12, -20);
  // Each valve a deep scallop: a dome with ribs fanning out from the hinge.
  const valve = (up: boolean) => {
    const g = new THREE.Group();
    g.position.copy(hinge);
    b.root.add(g);
    const dome = new Ell(0, 0, 21, W, up ? 20 : 15, 23);
    const colour = up ? shellColour : shade(shellColour, -10);
    const m = b.part(new THREE.SphereGeometry(0.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), colour, dome.centre, V(dome.rx * 2, dome.ry * 2, dome.rz * 2));
    if (!up) m.rotation.x = Math.PI;
    g.add(m);
    for (let i = 0; i < 9; i++) {
      const yaw = -Math.PI / 2 + ((i + 0.5) / 9) * Math.PI;
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 8; k++) {
        const p = dome.at(yaw, (up ? 1 : -1) * (Math.PI / 2) * (1 - k / 8) * 0.98, 0.4).px;
        pts.push(Q(p.x, p.y, p.z));
      }
      g.add(tube(b, pts, 0.6, 1.8, shade(colour, i % 2 ? 16 : 8), false, { radial: 6, segments: 16 }));
    }
    return g;
  };
  valve(false);
  const upper = valve(true);
  upper.rotation.x = -0.7;
  // The soft body inside, with the face.
  const body = new Ell(0, G + 16, 4, 20, 13, 16);
  blob(b, body, ctx.belly, true, bodyGeometry());
  // A pearl.
  b.part(sphereGeo(), K.washi, V(-12, G + 10, 20), V(11, 11, 11));
  b.flat(sphereGeo(), K.carpYellow, V(-14, G + 13, 25), V(3, 3, 1), 0.7);
  return {
    body,
    head: body,
    feet: [],
    arms: [],
    wings: [],
    seat: V(0, G + 40, 0),
    feetY: G,
    gait: "bound",
    bare: true,
    face: { eyeSize: 9, eyePitch: 0.2 },
    talk: (open) => (upper.rotation.x = open ? -0.95 : -0.7),
  };
}

// ------------------------------------------------------------ crab: wide and flat, claws up, eyes on stalks

function crabPlan(ctx: Ctx): Plan {
  const { b } = ctx;
  const { bulk, wide } = sizes(ctx);
  const body = new Ell(0, G + 22, 0, 30 + wide * 6, 14 + bulk * 3, 22);
  blob(b, body, ctx.colour, true, bodyGeometry());
  b.part(sphereGeo(), ctx.belly, V(0, body.y - body.ry * 0.45, body.z + 3), V(body.rx * 1.6, body.ry * 1.0, body.rz * 1.6), false);
  const crabLegs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    // Three legs a side, out and down.
    for (let i = 0; i < 3; i++) {
      const z = 6 - i * 9;
      const hip = Q(side * body.rx * 0.8, body.y - 4, z);
      const leg = tube(b, [hip, Q(side * (body.rx + 14), body.y + 8, z - 3), Q(side * (body.rx + 24), G + 1, z - 8)], 3, 2, shade(ctx.colour, -8), true, { radial: 8, segments: 10 });
      crabLegs.push(b.pivot([leg], V(hip.x, hip.y, hip.z)));
    }
    // A big claw held up in front.
    const sh = Q(side * body.rx * 0.7, body.y, body.rz * 0.5);
    const wrist = Q(side * (body.rx + 4), body.y + 14, body.rz + 10);
    tube(b, [sh, Q(side * (body.rx + 2), body.y + 4, body.rz + 2), wrist], 4.5, 4, ctx.colour);
    // The claw: a swollen palm, and two curved fingers opening forward like pincers.
    const claw = new Ell(wrist.x + side * 2, wrist.y + 3, wrist.z + 5, 9, 8, 11);
    blob(b, claw, shade(ctx.colour, 6), true, bodyGeometry());
    const fx = claw.x;
    tube(b, [Q(fx, claw.y + 3, claw.z + 7), Q(fx - side * 1, claw.y + 9, claw.z + 14), Q(fx - side * 3, claw.y + 6, claw.z + 21)], 4, 0.8, shade(ctx.colour, 6));
    tube(b, [Q(fx, claw.y - 3, claw.z + 8), Q(fx - side * 1, claw.y - 6, claw.z + 14), Q(fx - side * 3, claw.y - 2, claw.z + 19)], 3.2, 0.8, shade(ctx.colour, -6));
  }
  const blink = stalkEyes(ctx, [body.at(-0.3, 0.8, -2).px, body.at(0.3, 0.8, -2).px], 12, 4);
  return {
    body,
    head: body,
    feet: [0, 3, 4, 1, 2, 5].map((k) => crabLegs[k]!),
    arms: [],
    wings: [],
    seat: V(0, body.y + body.ry, 0),
    feetY: G,
    gait: "skitter",
    hips: true,
    sideways: true,
    face: { eyes: "stalks", mouthOn: { e: body, yaw: 0, pitch: 0.05 }, mouthWidth: 10 },
    blink,
  };
}

// ------------------------------------------------------------ worm: segments curving up to a head

function wormPlan(ctx: Ctx): Plan {
  const { b } = ctx;
  const eel = has(ctx, "backfin");
  const n = 8;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    pts.push(eel ? Q(Math.sin(k * Math.PI * 1.5) * 10, -8 + Math.sin(k * Math.PI) * 6, -40 + k * 58) : Q(Math.sin(k * Math.PI * 1.3) * 12, G + 7 + Math.pow(k, 2.2) * 30, -34 + k * 50));
  }
  const glow = has(ctx, "glow");
  const segs: THREE.Object3D[] = [];
  let bodyTube: THREE.Mesh | undefined;
  const hp = pts[n - 1]!;
  const head = eel ? new Ell(hp.x, hp.y + 2, hp.z + 4, 15, 13, 18) : new Ell(hp.x, hp.y + 4, hp.z, 17, 16, 16);
  if (glow) {
    // A glow-worm: round segments, the last ones lit.
    for (let i = 0; i < n - 1; i++) {
      const p = pts[i]!;
      const r = 6 + (i / (n - 1)) * 7;
      const lit = i < 3;
      const colour = lit ? K.carpYellow : i % 2 ? shade(ctx.colour, -8) : ctx.colour;
      segs.push(lit ? b.flat(sphereGeo(), colour, V(p.x, p.y, p.z), V(r * 2.1, r * 1.9, r * 2.1)) : b.part(sphereGeo(), colour, V(p.x, p.y, p.z), V(r * 2.1, r * 1.9, r * 2.1)));
    }
  } else {
    // A snake or an eel: one smooth body tapering to the tail, a paler belly line, rings of the accent colour.
    const body = [...pts.slice(0, n - 1), Q(hp.x, hp.y, hp.z - 6)];
    bodyTube = tube(b, body, 3, 12, ctx.colour, true, { segments: 40, radial: 14 });
    segs.push(bodyTube);
    const curve = new THREE.CatmullRomCurve3(body);
    // Bands all along (an eel's); stripes: a bright collar behind the head (a grass snake's).
    const rings = ctx.form.pattern === "bands" ? [0.3, 0.45, 0.6, 0.75] : ctx.form.pattern === "stripes" ? [0.84] : [];
    for (const k of rings) {
      const p = curve.getPointAt(k);
      const r = 3 + 9 * k + 0.4;
      const ring = b.part(new THREE.TorusGeometry(r * S, (k > 0.8 ? 3 : 1.3) * S, 6, 20), ctx.accent, V(p.x, p.y, p.z), 1, false);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), curve.getTangentAt(k));
    }
  }
  blob(b, head, ctx.colour, true, bodyGeometry());
  if (glow) {
    ctx.ticks.push(halo(b, V(pts[1]!.x, pts[1]!.y, pts[1]!.z), 16, 14, 18, K.carpYellow, 1.4));
  }
  if (eel) {
    // A ribbon of fin along the back, and one under the tail.
    const curve = new THREE.CatmullRomCurve3(pts);
    for (const [from, to, up, h] of [[0.15, 0.8, 1, 7], [0.05, 0.4, -1, 5]] as const) {
      for (let i = 0; i < 10; i++) {
        const k = from + ((to - from) * i) / 10;
        const p = curve.getPointAt(k);
        const r = 3 + 9 * k;
        const fin = b.part(plate([[-3, 0], [3, 0], [2, h], [-2, h * 0.8]], 1.2), mix(ctx.colour, ctx.accent, 0.4), V(p.x, p.y + up * r * 0.8, p.z), 1, false);
        fin.rotation.set(up > 0 ? 0 : Math.PI, Math.PI / 2 + Math.atan2(curve.getTangentAt(k).x, curve.getTangentAt(k).z), 0);
      }
    }
  }
  const tail0 = pts[0]!;
  const tubeAt = bodyTube;
  const ink = bodyTube?.children[0] as THREE.Mesh | undefined;
  return {
    // It bends: joints from behind the head to the tail; the smooth body is drawn through them anew.
    spine: {
      points: pts.slice(0, n - 1).reverse(),
      headEnd: Q(hp.x - head.x, hp.y - head.y, hp.z - 6 - head.z),
      ...(tubeAt
        ? {
            tube: tubeAt,
            redraw: (at: THREE.Vector3[]) => {
              taper(at, 3, 12, { segments: 40, radial: 14 }, tubeAt.geometry);
              if (ink) taper(at, 3 + b.outlinePx * 0.8, 12 + b.outlinePx * 0.8, { segments: 40, radial: 8 }, ink.geometry);
            },
          }
        : {}),
    },
    body: new Ell(pts[3]!.x, pts[3]!.y, pts[3]!.z, 12, 11, 12),
    head,
    feet: [],
    arms: [],
    wings: [],
    tailBase: Q(tail0.x, tail0.y, tail0.z - 4),
    tailSize: 0.8,
    seat: V(pts[4]!.x, pts[4]!.y + 12, pts[4]!.z),
    feetY: G,
    gait: "slither",
    face: { eyeSize: 12, eyePitch: 0.15 },
    hover: eel,
  };
}

// ------------------------------------------------------------ spirit: floating things with a face

function spiritPlan(ctx: Ctx): Plan {
  const { b } = ctx;
  const shape = ctx.form.shape ?? "cloud";
  let body = new Ell(0, -2, 0, 26, 24, 22);
  let head = body;
  const arms: THREE.Group[] = [];
  switch (shape) {
    case "cloud": {
      body = new Ell(0, 0, 0, 30, 22, 24);
      blob(b, body, ctx.colour);
      for (const [x, y, z, r] of [[-26, -4, -4, 16], [26, -3, -4, 17], [-12, 16, -6, 16], [12, 18, -8, 18], [0, 8, -14, 20], [-20, 8, -12, 13], [22, 10, -12, 13]] as const) b.part(sphereGeo(), shade(ctx.colour, y > 10 ? 8 : 0), V(x, y, z), V(r * 2, r * 1.7, r * 2));
      // A darker, flatter underside.
      b.part(sphereGeo(), shade(ctx.colour, -14), V(0, -14, -4), V(66, 14, 44), false);
      break;
    }
    case "flame": {
      const fl = [flame(b, V(0, -44, -2), 96, 60, 0, [ctx.colour, ctx.accent, K.autumnRed])];
      for (const [x, hh, lean] of [[-18, 50, 0.5], [18, 54, -0.45], [-8, 64, 0.2], [10, 62, -0.2]] as const) fl.push(flame(b, V(x, -30, -10), hh, 26, lean, [shade(ctx.colour, -8), ctx.accent, K.autumnRed]));
      ctx.ticks.push(flicker(fl));
      head = new Ell(0, -17, -2, 30.5, 26, 31);
      body = head;
      for (const side of [-1, 1]) {
        const hand = b.flat(sphereGeo(), ctx.accent, V(side * 30, -22, 10), V(9, 9, 9));
        arms.push(b.pivot([hand], V(side * 30, -22, 10)));
      }
      break;
    }
    case "jelly": {
      body = new Ell(0, 4, 0, 30, 22, 30);
      b.part(lathe([[0, 0], [31, 0], [32, 4], [29, 14], [22, 24], [12, 30], [0, 32]], 30), ctx.colour, V(0, -10, 0));
      b.part(new THREE.TorusGeometry(31 * S, 3 * S, 8, 36), shade(ctx.colour, -10), V(0, -10, 0)).rotation.x = Math.PI / 2;
      b.flat(sphereGeo(), ctx.accent, V(0, 2, -4), V(34, 24, 34), 0.35);
      const tentacles: THREE.Mesh[] = [];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const x = Math.cos(a) * 20;
        const z = Math.sin(a) * 20;
        const t = tube(b, [Q(x, -10, z), Q(x * 1.05, -24, z * 1.05), Q(x * 0.9 + 3, -38, z * 0.9), Q(x * 1.1, -50 + (i % 3) * 4, z * 1.1)], 2.6, 0.8, i % 2 ? shade(ctx.colour, 10) : ctx.accent, false, { radial: 6 });
        tentacles.push(t);
      }
      ctx.ticks.push((t) => tentacles.forEach((m, i) => (m.rotation.x = Math.sin(t * 2 + i) * 0.06)));
      head = new Ell(0, 2, 0, 29, 20, 30);
      break;
    }
    case "crystal": {
      body = new Ell(0, -2, 0, 20, 21, 18);
      blob(b, body, ctx.colour);
      const ice = mix(K.springBlue, K.washi, 0.45);
      for (const [x, y, z, len, w, ax, az] of [[0, 20, -4, 26, 9, 0, 0], [-18, 12, -4, 18, 7, 0, 0.6], [18, 12, -4, 20, 7, 0, -0.6], [-22, -6, -2, 16, 6, 0, 1.4], [22, -6, -2, 16, 6, 0, -1.4], [-10, -22, 0, 20, 6, Math.PI, 0.3], [10, -22, 0, 22, 6, Math.PI, -0.3], [0, -24, -2, 16, 5, Math.PI, 0]] as const) {
        const s = b.part(new THREE.OctahedronGeometry(0.5, 0), ice, V(x, y, z), V(w, len, w));
        s.rotation.set(ax, 0, az);
        b.flat(new THREE.OctahedronGeometry(0.5, 0), K.washi, V(x - 1, y + 1, z + w * 0.4), V(w * 0.3, len * 0.5, 1), 0.7).rotation.set(ax, 0, az);
      }
      break;
    }
    case "whirl": {
      body = new Ell(0, -4, 0, 22, 21, 20);
      blob(b, body, ctx.colour, true, bodyGeometry());
      const ring = new THREE.Group();
      ring.position.copy(V(0, -4, 0));
      ring.rotation.x = 0.35;
      b.root.add(ring);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const leaf = b.part(plate(leafShape(16, 9), 1.8), i % 3 ? K.springGreen : K.autumnGreen, V(Math.cos(a) * 34, Math.sin(i * 1.7) * 6, Math.sin(a) * 34));
        leaf.rotation.set(Math.PI / 2, 0, -a);
        ring.add(leaf);
      }
      const swirl = b.part(new THREE.TorusGeometry(28 * S, 1.6 * S, 6, 40, Math.PI * 1.4), mix(K.washi, ctx.colour, 0.3), new THREE.Vector3(), 1, false);
      swirl.rotation.x = Math.PI / 2;
      ring.add(swirl);
      ctx.ticks.push((t) => (ring.rotation.y = t * 1.6));
      break;
    }
    case "snowflake": {
      body = new Ell(0, 0, 0, 22, 22, 18);
      const flake = new THREE.Group();
      flake.position.copy(V(0, 0, -8));
      b.root.add(flake);
      for (let i = 0; i < 6; i++) {
        const arm = new THREE.Group();
        arm.rotation.z = (i / 6) * Math.PI * 2;
        flake.add(arm);
        arm.add(b.part(new THREE.BoxGeometry(4 * S, 46 * S, 3 * S), K.washi, V(0, 23, 0)));
        for (const [y, len] of [[24, 12], [34, 9]] as const) {
          for (const s of [-1, 1]) {
            const twig = b.part(new THREE.BoxGeometry(3 * S, len * S, 2.6 * S), K.washi, V(s * len * 0.3, y + len * 0.3, 0));
            twig.rotation.z = -s * 0.8;
            arm.add(twig);
          }
        }
        arm.add(b.part(new THREE.OctahedronGeometry(0.5, 0), mix(K.springBlue, K.washi, 0.5), V(0, 48, 0), V(7, 9, 5)));
      }
      ctx.ticks.push((t) => (flake.rotation.z = t * 0.3));
      blob(b, body, ctx.colour);
      break;
    }
    default:
      blob(b, body, ctx.colour, true, bodyGeometry());
  }
  if (shape === "cloud" || shape === "whirl" || shape === "crystal" || shape === "snowflake") {
    for (const side of [-1, 1]) {
      const at = body.at(side * 1.4, -0.2, -2);
      const hand = b.part(sphereGeo(), shade(ctx.colour, 6), at.p, V(10, 10, 10));
      arms.push(b.pivot([hand], at.p));
    }
  }
  return {
    body,
    head,
    feet: [],
    arms,
    wings: wingsFor(ctx, body),
    tailBase: body.at(Math.PI, -0.3, -2).px,
    seat: V(0, body.y + body.ry, 0),
    feetY: G,
    gait: "drift",
    face: { eyeSize: head.ry * 0.4, eyePitch: 0.1 },
    hover: true,
    crown: shape === "cloud" ? V(0, 30, -6) : shape === "flame" ? V(0, 20, 6) : shape === "jelly" ? V(0, 23, 0) : undefined,
  };
}

export const PLANS: Record<CreatureForm["body"], (ctx: Ctx, pose?: "ride") => Plan> = {
  blob: blobPlan,
  beast: beastPlan,
  biped: bipedPlan,
  bird: birdPlan,
  fish: fishPlan,
  bug: bugPlan,
  frog: frogPlan,
  spirit: spiritPlan,
  snail: snailPlan,
  shell: shellPlan,
  crab: crabPlan,
  worm: wormPlan,
};

