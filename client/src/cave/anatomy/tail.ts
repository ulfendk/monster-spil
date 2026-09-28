import * as THREE from "three";
import type { FormTail } from "@shared";
import { KANAGAWA } from "../../ui/theme";
import { S, shade } from "../monster-model";
import { has, type Ctx } from "./context";
import { Q, V, flame, flicker, leafShape, mix, plate, smooth, sphereGeo, spike, tube } from "./kit";

const K = KANAGAWA;

/**
 * Tails, from a point on the back of the body (px) going backwards (-z): a squirrel's bushy
 * plume curling up over its back, a fox's brush (several for a kitsune), a mouse's string, a
 * rabbit's puff, a fish's two-lobed fin, a scorpion's jointed sting, a lizard's taper, a bird's
 * fan, a rooster's sickle feathers, a pig's curl, a lightning bolt, a burst of flames, a leafy
 * whip. Returns its pivot (wagged when ridden).
 */
export function tail(ctx: Ctx, base: THREE.Vector3, kind: FormTail, size = 1): THREE.Group | undefined {
  if (kind === "none") return undefined;
  const { b } = ctx;
  const g = ctx.grow * size;
  const before = b.root.children.length;
  const c = (dx: number, dy: number, dz: number) => Q(base.x + dx * g, base.y + dy * g, base.z + dz * g);
  const colour = ctx.colour;
  switch (kind) {
    case "fluffy": {
      tube(b, [c(0, 0, 2), c(0, 4, -9), c(0, 18, -16), c(0, 32, -13), c(0, 40, -4)], 5, 7, colour, true, { bulge: 9, segments: 28, radial: 14 });
      tube(b, [c(0, 33, -12), c(0, 39, -6), c(0, 42, -1)], 6, 3, mix(colour, K.washi, 0.45), false, { bulge: 3 });
      break;
    }
    case "fox": {
      // One brush — or, for a kitsune, one more pair at each stage, fanned out.
      const count = has(ctx, "kitsune") ? 2 * ctx.stage - 1 : 1;
      for (let i = 0; i < count; i++) {
        // Fanned out like a hand of cards, the middle one tallest.
        const spread = count === 1 ? 0 : (i / (count - 1) - 0.5) * 2;
        const x = Math.sin(spread) * 26;
        const up = 22 - Math.abs(spread) * 6;
        tube(b, [c(0, 0, 2), c(x * 0.3, 2, -9), c(x * 0.8, up * 0.45, -19), c(x, up, -23)], 4.5, 3.5, colour, true, { bulge: count > 1 ? 5 : 7, segments: 24, radial: 12 });
        const tipColour = has(ctx, "flametip") ? K.carpYellow : K.washi;
        const tip = b.part(sphereGeo(), tipColour, V(base.x + x * g, base.y + up * g, base.z - 23 * g), V(9 * g, 11 * g, 9 * g), false);
        if (has(ctx, "flametip")) {
          const f = flame(b, tip.position.clone().add(V(0, 2, 0)), 16 * g, 10 * g, 0);
          ctx.ticks.push(flicker([f]));
        }
      }
      break;
    }
    case "thin": {
      tube(b, [c(0, 0, 1), c(0, -3, -9), c(4, 2, -17), c(0, 8, -23), c(-5, 9, -30)], 2.2, 0.6, shade(colour, -6), true, { segments: 26 });
      break;
    }
    case "puff": {
      b.part(sphereGeo(), K.washi, V(base.x, base.y + 2, base.z - 3), V(14 * g, 13 * g, 12 * g));
      break;
    }
    case "fin": {
      // A two-lobed fin standing up at the end of the body.
      const shape = smooth([[0, -3], [9, -7], [22, -17], [17, -3], [17, 3], [22, 17], [9, 7], [0, 3]], 36);
      const fin = b.part(plate(shape, 2.5), mix(colour, ctx.accent, 0.35), V(base.x, base.y, base.z + 2), g);
      fin.rotation.y = Math.PI / 2;
      for (const k of [-0.5, 0, 0.5]) {
        const ray = b.flat(new THREE.BoxGeometry(14 * S, 0.8 * S, 0.6 * S), shade(colour, -20), V(0, 0, 0));
        ray.position.set(9 * S, k * 10 * S, 1.8 * S);
        ray.rotation.z = k * 0.9;
        fin.add(ray);
      }
      break;
    }
    case "stinger": {
      // Jointed segments arching up over the back, a hooked, glowing sting at the end.
      const pts = [c(0, 0, 0), c(0, 8, -10), c(0, 22, -12), c(0, 32, -4), c(0, 34, 6)];
      const curve = new THREE.CatmullRomCurve3(pts);
      for (let i = 0; i < 6; i++) {
        const p = curve.getPointAt(i / 6);
        const r = 6.5 - i * 0.6;
        b.part(sphereGeo(), i % 2 ? shade(colour, 10) : colour, V(p.x, p.y, p.z), V(r * 2 * g, r * 1.8 * g, r * 2 * g));
      }
      const end = curve.getPointAt(1);
      b.part(sphereGeo(), ctx.accent, V(end.x, end.y, end.z), V(9 * g, 8 * g, 10 * g));
      spike(b, V(end.x, end.y - 1, end.z + 3), new THREE.Vector3(0, -0.6, 1), 10 * g, 2.6 * g, K.sumiInk5);
      break;
    }
    case "lizard": {
      tube(b, [c(0, 0, 2), c(0, -4, -10), c(4, -9, -22), c(-3, -11, -33), c(-6, -11, -40)], 6.5, 0.6, colour, true, { segments: 28 });
      break;
    }
    case "flat": {
      const paddle = b.part(plate(smooth([[0, 0], [7, -8], [6, -22], [0, -26], [-6, -22], [-7, -8]], 28), 4), ctx.dark, V(base.x, base.y - 4, base.z), g);
      paddle.rotation.x = -Math.PI / 2 + 0.3;
      break;
    }
    case "fan": {
      // Tail feathers fanned up behind.
      for (let i = 0; i < 5; i++) {
        const a = (i - 2) * 0.32;
        const f = b.part(plate(leafShape(24, 9), 2), i % 2 ? colour : shade(colour, -12), V(base.x, base.y, base.z - 2), g);
        f.rotation.set(-0.9, 0, a);
        f.rotateX(0);
      }
      break;
    }
    case "sickle": {
      // A rooster's arching tail feathers, dark with a sheen.
      const dark = ctx.form.accent ? ctx.accent : K.sumiInk5;
      for (const [dx, hh, far] of [[-4, 30, 16], [0, 36, 22], [4, 28, 18], [-2, 22, 12]] as const) {
        tube(b, [c(0, 0, 0), c(dx * 0.4, hh * 0.7, -far * 0.4), c(dx, hh, -far * 0.9), c(dx * 1.2, hh * 0.75, -far * 1.3)], 3, 1.2, dx === 0 ? dark : shade(dark, 14), true, { segments: 20 });
      }
      break;
    }
    case "curl": {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 16; i++) {
        const a = (i / 16) * Math.PI * 3;
        const r = 5 - i * 0.2;
        pts.push(c(Math.sin(a) * r, 4 + Math.cos(a) * r - 4, -2 - i * 0.6));
      }
      tube(b, pts, 1.8, 1.2, colour, true, { segments: 40 });
      break;
    }
    case "bolt": {
      const pts: Array<[number, number]> = [[0, 0], [5, 0], [2, 12], [9, 12], [3, 26], [5, 16], [-2, 16], [1, 4], [-3, 4]];
      const bolt = b.part(plate(pts, 3.5), K.carpYellow, V(base.x, base.y, base.z - 2), g);
      bolt.rotation.set(0, Math.PI / 2, -0.5);
      break;
    }
    case "flames": {
      const fl = [flame(b, V(base.x, base.y, base.z - 4), 22 * g, 12 * g, 0), flame(b, V(base.x - 3, base.y - 1, base.z - 2), 14 * g, 9 * g, 0.6), flame(b, V(base.x + 3, base.y - 1, base.z - 2), 14 * g, 9 * g, -0.6)];
      for (const f of fl) f.rotation.x = -0.9;
      ctx.ticks.push(flicker(fl));
      break;
    }
    case "leafy": {
      tube(b, [c(0, 0, 1), c(0, 0, -10), c(0, 8, -18), c(0, 14, -20)], 2.4, 1.4, shade(colour, -8));
      for (const a of [-0.7, 0, 0.7]) {
        const leaf = b.part(plate(leafShape(16, 9), 2), K.autumnGreen, V(base.x, base.y + 14 * g, base.z - 20 * g), g);
        leaf.rotation.set(-0.3, 0, a);
      }
      break;
    }
  }
  const parts = b.root.children.slice(before);
  if (!parts.length) return undefined;
  return b.pivot(parts, V(base.x, base.y, base.z));
}
