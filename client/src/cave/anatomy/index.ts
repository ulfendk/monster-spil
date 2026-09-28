import * as THREE from "three";
import type { CreatureForm, CreatureSpecies, FormEyes, FormMouth } from "@shared";
import { KANAGAWA } from "../../ui/theme";
import { TYPE_COLOURS, speciesShade } from "../../gfx/placeholder-sprites";
import { type Builder, type Built, type MountRig, S, shade } from "../monster-model";
import type { Ctx } from "./context";
import { makeFace, type FaceSpec } from "./face";
import { crest, ears, horns, snout } from "./head";
import { type Ell, V, colourOf, mix, sphereGeo } from "./kit";
import { PLANS } from "./plans";
import type { Gait } from "../../world3d/mount-gaits";
import { extras, pattern } from "./surface";
import { tail } from "./tail";

const K = KANAGAWA;

/** What a body plan makes: the body and head (px ellipsoids), the moving parts and where things go. */
export interface Plan {
  body: Ell;
  /** Where the face goes (the body itself for a blob). */
  head: Ell;
  feet: THREE.Group[];
  arms: THREE.Group[];
  wings: MountRig["wings"];
  /** Where the tail starts (px), if it has one. */
  tailBase?: THREE.Vector3;
  tailSize?: number;
  /** Where a rider sits (model units). */
  seat: THREE.Vector3;
  /** The ground under its feet (px), for the riding pivot. */
  feetY: number;
  face?: Partial<FaceSpec>;
  /** Parts on the head (ears, horns, crest) are left out (a mussel has no head to speak of). */
  bare?: boolean;
  /** It floats: bobs gently up and down. */
  hover?: boolean;
  /** Its own face (a mussel's opening shell): replaces the drawn mouth's crying. */
  talk?: (open: boolean) => void;
  /** Eyes it made itself (on stalks) shutting. */
  blink?: (shut: boolean) => void;
  /** How far round its picture is turned (radians): long ones more from the side. */
  view?: number;
  /** Where a stage-3 crown sits (default: on top of the head), or null for none. */
  crown?: THREE.Vector3 | null;
  /** Its feet are legs turning at the hip. */
  hips?: boolean;
  /** How it goes about by itself (in the garden). */
  gait?: Gait;
  /** It walks sideways (a crab). */
  sideways?: boolean;
  /**
   * A long body that bends: its joints from just behind the head to the tail (px), where the
   * body meets the head (px from the head's middle), and — for a smooth one — its tube and how
   * to draw it through new points (px, tail first).
   */
  spine?: { points: THREE.Vector3[]; headEnd: THREE.Vector3; tube?: THREE.Mesh; redraw?: (at: THREE.Vector3[]) => void };
}

const VIEWS: Partial<Record<CreatureForm["body"], number>> = { beast: -0.78, fish: -1.05, bug: -0.8, snail: -0.95, worm: -0.8, crab: -0.5, frog: -0.5 };

const DEFAULT_EYES: Partial<Record<CreatureForm["body"], FormEyes>> = { bug: "bug" };
const DEFAULT_MOUTH: Partial<Record<CreatureForm["body"], FormMouth>> = { bird: "beak", frog: "wide", fish: "smile" };

/** Builds a monster from its `form` (see CreatureForm in shared/src/types/creature.ts). */
export function buildForm(b: Builder, species: CreatureSpecies, form: CreatureForm, stage: number, pose?: "ride"): Built {
  const typeColour = TYPE_COLOURS[species.type];
  // Later stages: a deeper, richer colour.
  const colour = shade(colourOf(form.colour, shade(typeColour, speciesShade(species.id) * 0.6)), -(stage - 1) * 6);
  const ctx: Ctx = {
    b,
    species,
    form,
    type: species.type,
    stage,
    grow: 1 + 0.2 * (stage - 1),
    colour,
    belly: colourOf(form.belly, mix(colour, K.washi, 0.5)),
    accent: colourOf(form.accent, shade(typeColour, 18)),
    // (Towards ink, so a bright red's paws are dark red, not neon.)
    dark: mix(shade(colour, -16), K.sumiInk4, 0.3),
    ticks: [],
    headParts: [],
  };
  const plan = PLANS[form.body](ctx, pose);
  ctx.body ??= plan.body;
  ctx.head = plan.head;

  // What's on the head.
  let sn: ReturnType<typeof snout> = {};
  if (!plan.bare) {
    sn = snout(ctx, plan.head, form.snout ?? (form.body === "bird" ? "beak" : "none"));
    ears(ctx, plan.head, form.ears ?? "none");
    horns(ctx, plan.head, form.horns ?? "none");
  }
  const tailKind = form.tail ?? (form.body === "fish" ? "fin" : form.body === "bird" ? "fan" : "none");
  const tailPivot = plan.tailBase ? tail(ctx, plan.tailBase, tailKind, plan.tailSize ?? 1) : undefined;

  // The face.
  const eyes = plan.face?.eyes ?? form.eyes ?? DEFAULT_EYES[form.body] ?? "kawaii";
  const mouth = sn.ownMouth ? "none" : (form.mouth ?? DEFAULT_MOUTH[form.body] ?? "smile");
  const faceSwitch = makeFace(b, {
    head: plan.head,
    eyes,
    mouth,
    iris: eyes === "fierce" || eyes === "glow" || eyes === "owl" ? (form.accent ? ctx.accent : K.carpYellow) : shade(colour, -35),
    skin: colour,
    blush: eyes === "kawaii" || eyes === "sleepy",
    fang: species.baseStats.angreb >= 13,
    ...(sn.mouthOn ? { mouthOn: sn.mouthOn } : {}),
    ...(sn.mouthWidth ? { mouthWidth: sn.mouthWidth } : {}),
    ...(sn.eyeLift ? { eyePitch: (plan.face?.eyePitch ?? 0.1) + sn.eyeLift } : {}),
    ...Object.fromEntries(Object.entries(plan.face ?? {}).filter(([k]) => !(k === "eyePitch" && sn.eyeLift))),
  });

  // (A worm's pattern is its own: rings along it.)
  if (form.body !== "worm") pattern(ctx, ctx.body ?? plan.body, form.pattern ?? "none", plan.head === plan.body ? plan.head : undefined);
  extras(ctx, plan.body, plan.head);
  if (!plan.bare) crest(ctx, plan.head, form.crest ?? "none");

  // Evolved: a mark on the chest, and at stage 3 a small golden crown.
  if (stage >= 2 && !plan.bare) {
    const chest = plan.body.at(0, plan.head === plan.body ? -0.45 : 0.05, -0.5);
    const mark = b.part(new THREE.OctahedronGeometry(0.5, 0), shade(typeColour, 22), chest.p, V(9, 12, 4), false);
    mark.lookAt(chest.p.clone().add(chest.n));
    mark.rotateZ(Math.PI / 4);
  }
  if (stage >= 3 && !plan.bare && plan.crown !== null) {
    const h = plan.head;
    const crown = new THREE.Group();
    crown.position.copy(plan.crown ?? h.at(0, 1.3, -2).p);
    crown.rotation.x = -0.2;
    b.root.add(crown);
    crown.add(b.part(new THREE.CylinderGeometry(9 * S, 8 * S, 4 * S, 16, 1, true), K.carpYellow, new THREE.Vector3()));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spike = b.part(new THREE.ConeGeometry(2.4 * S, 7 * S, 5), K.carpYellow, V(Math.sin(a) * 8.5, 5, Math.cos(a) * 8.5));
      crown.add(spike);
    }
    crown.add(b.flat(sphereGeo(), K.autumnRed, V(0, 1, 9.5), V(3.5, 3.5, 2)));
  }

  // A long body: the head into a group of its own, everything else onto the joint nearest it.
  let spine: THREE.Group[] | undefined;
  let headGroup: THREE.Group | undefined;
  if (plan.spine) {
    b.root.updateMatrixWorld(true);
    const { tube } = plan.spine;
    const h = plan.head;
    const centre = (o: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(o);
      return box.isEmpty() ? undefined : box.getCenter(new THREE.Vector3()).divideScalar(S);
    };
    const movable = (o: THREE.Object3D) => o !== tube && !o.userData.noFit;
    const inHead = b.root.children.filter((o) => {
      const c = movable(o) && centre(o);
      return c && ((c.x - h.x) / h.rx) ** 2 + ((c.y - h.y) / h.ry) ** 2 + ((c.z - h.z) / h.rz) ** 2 < 1.7 ** 2;
    });
    headGroup = b.pivot(inHead, h.centre);
    const joints = plan.spine.points;
    const onJoint = joints.map(() => [] as THREE.Object3D[]);
    for (const o of b.root.children.slice()) {
      const c = o !== headGroup && movable(o) ? centre(o) : undefined;
      if (!c) continue;
      let best = 0;
      joints.forEach((j, i) => (c.distanceTo(j) < c.distanceTo(joints[best]!) ? (best = i) : 0));
      onJoint[best]!.push(o);
    }
    spine = joints.map((j, i) => b.pivot(onJoint[i]!, V(j.x, j.y, j.z)));
  }

  // Fitted to the picture's box: as big as fits (a fly as big on the page as a troll, give or
  // take), feet on the ground — or, floating, in the middle.
  const ticks = ctx.ticks;
  const fit = fitToBox(b, plan);
  const seat = plan.seat.clone().sub(new THREE.Vector3(0, plan.feetY * S, 0)).multiplyScalar(fit.scale.x).add(fit.position);
  // Floating: everything bobs in a group of its own (the stages move the root).
  const inner = plan.hover ? b.pivot(fit.children.slice(), new THREE.Vector3(), fit) : fit;
  if (plan.hover) ticks.push((t) => (inner.position.y = Math.sin(t * 2) * 2.5 * S));

  const rig: MountRig = {
    body: b.pivot(inner.children.filter((c) => !plan.feet.includes(c as THREE.Group)), new THREE.Vector3(0, plan.feetY * S, 0), inner),
    feet: plan.feet,
    arms: plan.arms,
    wings: plan.wings,
    ...(tailPivot ? { tail: tailPivot } : {}),
    ...(plan.hips ? { hips: true } : {}),
    ...(spine ? { spine } : {}),
    ...(headGroup ? { head: headGroup } : {}),
  };
  const { tube, redraw, headEnd } = plan.spine ?? {};
  if (spine && headGroup && tube && redraw && headEnd) {
    // The smooth body follows its joints (and the head) wherever they've gone this frame.
    ticks.push(() => {
      const at = [...spine].reverse().map((g) => g.position.clone().sub(tube.position).divideScalar(S));
      at.push(headGroup.position.clone().sub(tube.position).divideScalar(S).add(headEnd));
      redraw(at);
    });
  }
  if (plan.wings.length) {
    ticks.push((t) => {
      for (const w of plan.wings) {
        if (w.pivot.userData.driven) continue;
        const flap = Math.sin(t * (form.body === "bug" ? 40 : 3) + (w.side > 0 ? 0 : 0)) * (form.body === "bug" ? 0.35 : 0.12);
        w.pivot.rotation.set(w.rest.x, w.rest.y + w.side * flap, w.rest.z + w.side * flap * 0.5);
      }
    });
  }
  return {
    face: (face) => {
      faceSwitch(face);
      sn.talk?.(face === "talk");
      plan.talk?.(face === "talk");
      plan.blink?.(face === "blink");
    },
    seat,
    rig,
    view: plan.view ?? VIEWS[form.body] ?? -0.42,
    // (Anything with wings of its own flies about — a bat too.)
    ...(species.wings && form.body !== "bug" ? { gait: "fly" as const } : plan.gait ? { gait: plan.gait } : {}),
    ...(plan.sideways ? { sideways: true } : {}),
    ...(ticks.length ? { tick: (t: number) => ticks.forEach((f) => f(t)) } : {}),
  };
}

/**
 * Everything into one group, scaled to fill the picture's 128-px box (leaving a little room)
 * and centred across it; its feet stay on the ground, or a floating one hangs in the middle.
 * Drifting sparks and glows (marked `noFit`) don't count.
 */
function fitToBox(b: Builder, plan: Plan): THREE.Group {
  b.root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const part = new THREE.Box3();
  b.root.traverse((o) => {
    if (o === b.root || !(o instanceof THREE.Mesh)) return;
    for (let p: THREE.Object3D | null = o; p && p !== b.root; p = p.parent) if (p.userData.noFit) return;
    if ((o.material as THREE.Material).side === THREE.BackSide) return; // (ink outlines)
    o.geometry.computeBoundingBox();
    part.copy(o.geometry.boundingBox!).applyMatrix4(o.matrixWorld);
    box.union(part);
  });
  const ground = plan.feetY * S;
  const size = box.getSize(new THREE.Vector3());
  const fit = b.pivot(b.root.children.slice(), new THREE.Vector3(0, ground, 0));
  if (box.isEmpty()) return fit;
  const k = plan.hover
    ? Math.min(0.9 / size.x, 0.86 / size.y, 1.5)
    : Math.min(0.9 / size.x, (0.5 - 0.03 - ground) / Math.max(0.05, box.max.y - ground), 1.5);
  fit.scale.setScalar(Math.max(0.6, k));
  const s = fit.scale.x;
  fit.position.x = -s * (box.min.x + box.max.x) / 2;
  if (plan.hover) fit.position.y = -0.02 - s * ((box.min.y + box.max.y) / 2 - ground);
  return fit;
}
