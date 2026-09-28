import * as THREE from "three";
import { KANAGAWA } from "../ui/theme";

/**
 * A player's figure on the 3D map: their animal (fox, frog, panda, calico cat, moon rabbit,
 * bear — the same six as the 2D faces in gfx/avatar-sprites.ts) as a little chibi figure,
 * toon-shaded with an ink outline: a big round head with its ears, markings and kawaii face on
 * a small round body with paws. On the head the headwear their level has unlocked (headband,
 * straw hat, samurai helmet, crown), and on the chest their newest badges as golden medals.
 *
 * Units: about 0.9 tall (tiles) at scale 1, standing on y = 0, facing +z.
 */
export interface AvatarSpec {
  id: string;
  look?: string;
  /** Badge icons (drawn icon names), newest first; up to three are worn. */
  badges: string[];
}

const K = KANAGAWA;
const INK = K.sumiInk0;

let gradient: THREE.DataTexture | undefined;
function toon(): THREE.DataTexture {
  if (gradient) return gradient;
  gradient = new THREE.DataTexture(new Uint8Array([110, 185, 255]), 3, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

class Parts {
  readonly root = new THREE.Group();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly ink = this.keep(new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));

  keep<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  /** A toon-shaded part with an ink rim (unless `outline` is false). */
  add(geometry: THREE.BufferGeometry, colour: number, at: [number, number, number], scale: [number, number, number] = [1, 1, 1], outline = true, parent: THREE.Object3D = this.root): THREE.Mesh {
    this.geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, this.keep(new THREE.MeshToonMaterial({ color: colour, gradientMap: toon() })));
    mesh.position.set(...at);
    mesh.scale.set(...scale);
    if (outline) {
      const edge = new THREE.Mesh(geometry, this.ink);
      geometry.computeBoundingSphere();
      const r = geometry.boundingSphere!.radius * Math.max(...scale);
      edge.scale.setScalar(1 + 0.016 / Math.max(r, 0.01));
      mesh.add(edge);
    }
    parent.add(mesh);
    return mesh;
  }

  /** A flat-coloured part (eyes, cheeks, marks) that doesn't take the light. */
  flat(geometry: THREE.BufferGeometry, colour: number, at: [number, number, number], scale: [number, number, number] = [1, 1, 1], parent: THREE.Object3D = this.root): THREE.Mesh {
    this.geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, this.keep(new THREE.MeshBasicMaterial({ color: colour })));
    mesh.position.set(...at);
    mesh.scale.set(...scale);
    parent.add(mesh);
    return mesh;
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}

const ball = () => new THREE.SphereGeometry(0.5, 18, 12);

/** Where the head is: its middle and its radii (x, y, z). */
const HEAD = { y: 0.52, rx: 0.3, ry: 0.26, rz: 0.27 };
/** How far the head's surface sticks out at (x, y) on its front — to put the face on it. */
const front = (x: number, y: number) => HEAD.rz * Math.sqrt(Math.max(0, 1 - (x / HEAD.rx) ** 2 - ((y - HEAD.y) / HEAD.ry) ** 2));

interface Animal {
  head: number;
  body: number;
  belly?: number;
  ears(p: Parts): void;
  /** Markings on the face, before the eyes (patches, muzzles). */
  marks?(p: Parts): void;
  /** Eye spacing and height, and whether the eyes are on bumps (frog). */
  eyes?: { gap: number; y: number };
  nose?: number;
}

const ANIMALS: Record<string, Animal> = {
  figur1: {
    // Kitsune: orange, tall ears with dark tips, a white muzzle and a red mark on the brow.
    head: K.surimiOrange,
    body: K.surimiOrange,
    belly: K.washi,
    ears(p) {
      for (const side of [-1, 1]) {
        const ear = p.add(new THREE.ConeGeometry(0.09, 0.22, 5), K.surimiOrange, [side * 0.17, 0.78, -0.02]);
        ear.rotation.z = -side * 0.35;
        p.flat(new THREE.ConeGeometry(0.045, 0.08, 5), INK, [0, 0.08, 0], [1, 1, 1], ear);
      }
    },
    marks(p) {
      p.add(ball(), K.washi, [0, 0.44, front(0, 0.44) - 0.08], [0.3, 0.16, 0.16], false);
      const mark = p.flat(new THREE.ConeGeometry(0.03, 0.06, 3), K.autumnRed, [0, 0.69, front(0, 0.69) + 0.003]);
      mark.rotation.x = Math.PI + 0.5;
    },
    nose: 0.46,
  },
  figur2: {
    // Frog: wide and green, the eyes on bumps on top, a big smile.
    head: K.springGreen,
    body: K.springGreen,
    belly: new THREE.Color(K.springGreen).lerp(new THREE.Color(K.washi), 0.4).getHex(),
    ears(p) {
      for (const side of [-1, 1]) p.add(ball(), K.springGreen, [side * 0.14, 0.72, 0.06], [0.17, 0.15, 0.15]);
    },
    eyes: { gap: 0.14, y: 0.74 },
  },
  figur3: {
    // Panda: white, black round ears and eye patches.
    head: K.washi,
    body: INK,
    belly: K.washi,
    ears(p) {
      for (const side of [-1, 1]) p.add(ball(), INK, [side * 0.21, 0.73, -0.02], [0.13, 0.13, 0.08]);
    },
    marks(p) {
      for (const side of [-1, 1]) {
        const patch = p.flat(ball(), INK, [side * 0.1, 0.55, front(side * 0.1, 0.55) - 0.005], [0.1, 0.13, 0.04]);
        patch.rotation.z = side * 0.5;
      }
    },
    nose: 0.47,
  },
  figur4: {
    // Calico cat: white with an orange and an ink patch, pointed ears, whiskers.
    head: K.washi,
    body: K.washi,
    ears(p) {
      for (const side of [-1, 1]) {
        const ear = p.add(new THREE.ConeGeometry(0.09, 0.16, 4), side < 0 ? K.surimiOrange : K.washi, [side * 0.18, 0.76, -0.02]);
        ear.rotation.z = -side * 0.4;
      }
    },
    marks(p) {
      p.flat(ball(), K.surimiOrange, [-0.15, 0.63, front(-0.15, 0.63) - 0.03], [0.16, 0.12, 0.08]);
      p.flat(ball(), INK, [0.18, 0.64, front(0.18, 0.64) - 0.03], [0.11, 0.08, 0.06]);
      for (const side of [-1, 1]) {
        for (const dy of [0.01, -0.03]) {
          const w = p.flat(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 3), INK, [side * 0.2, 0.46 + dy, front(0.16, 0.46) + 0.02]);
          w.rotation.z = Math.PI / 2 + side * dy * 3;
        }
      }
    },
  },
  figur5: {
    // Moon rabbit: white, long ears with pink insides.
    head: K.washi,
    body: K.washi,
    ears(p) {
      for (const side of [-1, 1]) {
        const ear = p.add(ball(), K.washi, [side * 0.1, 0.9, -0.03], [0.1, 0.34, 0.07]);
        ear.rotation.z = -side * 0.15;
        p.flat(ball(), K.sakuraPink, [0, 0, 0.3], [0.5, 0.8, 0.4], ear);
      }
    },
    nose: 0.47,
  },
  figur6: {
    // Bear: brown, round ears, a lighter muzzle.
    head: K.boatYellow1,
    body: K.boatYellow1,
    belly: K.boatYellow2,
    ears(p) {
      for (const side of [-1, 1]) {
        const ear = p.add(ball(), K.boatYellow1, [side * 0.21, 0.74, -0.02], [0.14, 0.14, 0.08]);
        p.flat(ball(), K.boatYellow2, [0, 0, 0.3], [0.5, 0.5, 0.5], ear);
      }
    },
    marks(p) {
      p.add(ball(), K.boatYellow2, [0, 0.44, front(0, 0.44) - 0.07], [0.2, 0.13, 0.13], false);
    },
    nose: 0.46,
  },
};

/** How the figure moves where it is: walking, swimming (in water), climbing (on a mountain), or resting to get its breath back. */
export type AvatarMotion = "walk" | "swim" | "climb" | "rest";

export interface AvatarModel {
  root: THREE.Group;
  /**
   * Walking: `phase` runs on with the steps (radians), `amount` (0–1) is how much it's walking —
   * the feet step, the arms swing, the body bobs and rocks from side to side.
   */
  walk(phase: number, amount: number): void;
  /**
   * Moving the way the ground asks (eased from one way to the next over `dt` seconds; `t` is the
   * clock): walking as `walk`; swimming — low in the water, lying forward, arms pulling crawl
   * strokes, feet kicking (treading water when still); climbing — a backpack with a coiled rope,
   * an ice axe in hand, leaning into the slope, hand over hand with knees high; resting — sat
   * down, panting, sweat flying off.
   */
  animate(motion: AvatarMotion, phase: number, amount: number, dt: number, t: number): void;
  dispose(): void;
}

export function buildAvatarModel(spec: AvatarSpec, badgeTexture: (icon: string) => THREE.Texture | undefined): AvatarModel {
  const p = new Parts();
  const a = ANIMALS[spec.id] ?? { head: K.oldWhite, body: K.oldWhite, ears() {} };

  // The body with its belly and paws, then the head.
  p.add(ball(), a.body, [0, 0.19, 0], [0.34, 0.3, 0.3]);
  if (a.belly) p.add(ball(), a.belly, [0, 0.18, 0.08], [0.22, 0.2, 0.18], false);
  const feet = [-1, 1].map((side) => p.add(ball(), a.body, [side * 0.1, 0.035, 0.06], [0.12, 0.07, 0.14]));
  const arms = [-1, 1].map((side) => p.add(ball(), a.body, [side * 0.18, 0.2, 0.06], [0.09, 0.12, 0.09]));
  a.ears(p);
  p.add(ball(), a.head, [0, HEAD.y, 0], [HEAD.rx * 2, HEAD.ry * 2, HEAD.rz * 2]);
  a.marks?.(p);

  // The kawaii face: ink eyes with a glint, pink cheeks, a small smile.
  const eyes = a.eyes ?? { gap: 0.1, y: 0.55 };
  for (const side of [-1, 1]) {
    const x = side * eyes.gap;
    const z = a.eyes ? 0.2 : front(x, eyes.y);
    p.flat(ball(), INK, [x, eyes.y, z], [0.055, 0.07, 0.03]);
    p.flat(ball(), K.washi, [x + 0.012, eyes.y + 0.018, z + 0.013], [0.018, 0.018, 0.01]);
    p.flat(ball(), K.sakuraPink, [side * (eyes.gap + 0.06), eyes.y - 0.07, front(side * (eyes.gap + 0.06), eyes.y - 0.07)], [0.06, 0.03, 0.01]);
  }
  if (a.nose) p.flat(ball(), INK, [0, a.nose, front(0, a.nose) + (a.marks ? 0.03 : 0)], [0.04, 0.028, 0.02]);
  const smileY = a.eyes ? 0.47 : 0.44;
  const smile = p.flat(new THREE.TorusGeometry(a.eyes ? 0.07 : 0.03, 0.007, 4, 10, Math.PI * 0.7), INK, [0, smileY + (a.eyes ? 0.03 : 0.012), front(0, smileY) + 0.012]);
  smile.rotation.z = Math.PI * 1.15;

  headwear(p, spec.look);
  medals(p, spec.badges.slice(0, 3), badgeTexture);

  // Everything but the feet moves together when it walks (the feet stay on the ground).
  const upper = new THREE.Group();
  for (const child of [...p.root.children]) if (!feet.includes(child as THREE.Mesh)) upper.add(child);
  // (Swimming sinks all of it — the root itself is left alone: a rider's seat puts it there.)
  const whole = new THREE.Group();
  for (const child of [...p.root.children]) whole.add(child);
  whole.add(upper);
  p.root.add(whole);
  const armHome = arms.map((arm) => arm.position.clone());

  // Climbing gear, worn only on a mountain: a backpack with a coiled rope, and an ice axe in the right paw.
  const gear = new THREE.Group();
  upper.add(gear);
  p.add(new THREE.BoxGeometry(0.22, 0.24, 0.12), K.waveBlue2, [0, 0.24, -0.21], [1, 1, 1], true, gear);
  p.add(new THREE.BoxGeometry(0.2, 0.07, 0.13), K.crystalBlue, [0, 0.35, -0.21], [1, 1, 1], true, gear);
  const coil = p.add(new THREE.TorusGeometry(0.09, 0.025, 6, 16), K.boatYellow2, [0, 0.2, -0.29], [1, 1, 1], true, gear);
  coil.rotation.y = Math.PI / 2;
  for (const side of [-1, 1]) {
    const strap = p.flat(new THREE.BoxGeometry(0.035, 0.26, 0.02), K.waveBlue2, [side * 0.1, 0.24, 0.12], [1, 1, 1], gear);
    strap.rotation.x = -0.2;
  }
  const axe = new THREE.Group();
  gear.add(axe);
  p.add(new THREE.CylinderGeometry(0.014, 0.016, 0.34, 6), K.boatYellow1, [0, 0.13, 0], [1, 1, 1], true, axe);
  const pick = p.add(new THREE.BoxGeometry(0.2, 0.035, 0.03), K.katanaGray, [0.02, 0.3, 0], [1, 1, 1], true, axe);
  pick.rotation.z = -0.25;
  p.add(new THREE.ConeGeometry(0.02, 0.06, 4), K.katanaGray, [0, -0.06, 0], [1, 1, 1], false, axe).rotation.x = Math.PI;

  // Sweat flying off while resting.
  const drops = [-1, 1, -1, 1].map((side) => p.flat(new THREE.SphereGeometry(0.04, 8, 6), K.crystalBlue, [side * 0.3, 0.7, 0.05], [0.8, 1.3, 0.8], upper));

  /** How far each way of moving is blended in (eased, so one flows into the next). */
  const weight = { swim: 0, climb: 0, rest: 0 };
  const feetAt = feet.map(() => new THREE.Vector3());
  const armsAt = arms.map(() => new THREE.Vector3());

  const pose = (phase: number, amount: number, t: number) => {
    const k = Math.max(0, Math.min(1, amount));
    const { swim: sw, climb: cl, rest: re } = weight;
    const wk = Math.max(0, 1 - sw - cl - re);
    let upperY = 0, rotX = 0, rotZ = 0, sink = 0, breathe = 0;
    for (const v of [...feetAt, ...armsAt]) v.set(0, 0, 0);
    const mix = (v: THREE.Vector3, w: number, x: number, y: number, z: number) => v.set(v.x + w * x, v.y + w * y, v.z + w * z);

    // Walking: feet step, arms swing against them, a bob and a rock.
    if (wk > 0) {
      feet.forEach((_, i) => {
        const s = Math.sin(phase + i * Math.PI);
        mix(feetAt[i]!, wk, feet[i]!.position.x, 0.035 + Math.max(0, s) * 0.05 * k, 0.06 + s * 0.09 * k);
      });
      arms.forEach((_, i) => {
        const s = Math.sin(phase + i * Math.PI + Math.PI);
        mix(armsAt[i]!, wk, armHome[i]!.x, armHome[i]!.y + Math.abs(s) * 0.02 * k, armHome[i]!.z + s * 0.07 * k);
      });
      upperY += wk * Math.abs(Math.sin(phase)) * 0.045 * k;
      rotZ += wk * Math.sin(phase) * 0.09 * k;
    }
    // Swimming: low in the water, lying forward, crawl strokes and kicking feet; still, treading water.
    if (sw > 0) {
      const ps = phase * 0.6;
      arms.forEach((_, i) => {
        const a = ps + i * Math.PI;
        const tread = Math.sin(t * 5 + i * Math.PI) * 0.035 * (1 - k);
        // Front crawl: the hand swings forward through the air (up) and pulls back under the water (down).
        // (Wide of the big head, so the strokes show from the camera up above.)
        mix(armsAt[i]!, sw, armHome[i]!.x * (1.6 + 0.4 * Math.max(0, Math.sin(a)) * k), armHome[i]!.y + 0.12 + Math.sin(a) * 0.22 * k + tread, armHome[i]!.z - Math.cos(a) * 0.26 * k + 0.04 * (1 - k));
      });
      feet.forEach((_, i) => mix(feetAt[i]!, sw, feet[i]!.position.x, 0.1 + Math.sin(t * 9 + i * Math.PI) * 0.05, 0.02 - 0.12 * k));
      upperY += sw * (Math.sin(t * 2.2) * 0.02);
      rotX += sw * (0.1 + 0.7 * k);
      rotZ += sw * Math.sin(ps) * 0.12 * k;
      sink += sw * -0.12;
    }
    // Climbing: leaning into the slope, hand over hand (the axe bites in), knees high.
    let reach = 0;
    if (cl > 0) {
      const pc = phase * 0.8;
      arms.forEach((_, i) => {
        const up = Math.max(0, Math.sin(pc + i * Math.PI));
        if (i === 1) reach = up;
        mix(armsAt[i]!, cl, armHome[i]!.x * 0.9, armHome[i]!.y + 0.05 + up * 0.22 * k + 0.04 * (1 - k), armHome[i]!.z + 0.08 + up * 0.05);
      });
      feet.forEach((_, i) => {
        const s = Math.sin(pc + i * Math.PI);
        mix(feetAt[i]!, cl, feet[i]!.position.x, 0.035 + Math.max(0, -s) * 0.1 * k, 0.06 - s * 0.05 * k);
      });
      upperY += cl * Math.max(0, Math.sin(pc * 2)) * 0.04 * k;
      rotX += cl * 0.3;
      rotZ += cl * Math.sin(pc) * 0.06 * k;
    }
    // Resting: sat down, feet out in front, paws on the knees, panting.
    if (re > 0) {
      feet.forEach((_, i) => mix(feetAt[i]!, re, feet[i]!.position.x, 0.03, 0.17));
      arms.forEach((_, i) => mix(armsAt[i]!, re, armHome[i]!.x * 1.05, armHome[i]!.y - 0.06, armHome[i]!.z + 0.09));
      upperY += re * -0.09;
      rotX += re * -0.12;
      breathe += re * Math.sin(t * 10) * 0.035;
    }

    feet.forEach((foot, i) => foot.position.set(foot.position.x, feetAt[i]!.y, feetAt[i]!.z));
    arms.forEach((arm, i) => arm.position.copy(armsAt[i]!));
    upper.position.y = upperY;
    upper.rotation.set(rotX, 0, rotZ);
    upper.scale.set(1, 1 + breathe, 1);
    whole.position.y = sink;
    gear.visible = cl > 0.4;
    if (gear.visible) {
      axe.position.copy(arms[1]!.position).add(new THREE.Vector3(0.02, -0.02, 0.04));
      axe.rotation.set(0.3 + reach * 0.7 * k, 0, -0.2);
    }
    drops.forEach((drop, j) => {
      drop.visible = re > 0.5;
      if (!drop.visible) return;
      const c = (t * 1.3 + j * 0.27) % 1;
      const side = j % 2 ? 1 : -1;
      drop.position.set(side * (0.28 + c * 0.22), 0.8 + c * 0.14 - c * c * 0.3, 0.05);
      drop.scale.setScalar(1 - c * 0.6);
    });
  };

  const walk = (phase: number, amount: number) => {
    weight.swim = weight.climb = weight.rest = 0;
    pose(phase, amount, 0);
  };
  const animate = (motion: AvatarMotion, phase: number, amount: number, dt: number, t: number) => {
    const ease = Math.min(1, dt * 6);
    for (const key of ["swim", "climb", "rest"] as const) weight[key] += ((motion === key ? 1 : 0) - weight[key]) * ease;
    pose(phase, amount, t);
  };
  return { root: p.root, walk, animate, dispose: () => p.dispose() };
}

/** The headwear a level has unlocked, on the head. */
function headwear(p: Parts, look: string | undefined): void {
  const top = HEAD.y + HEAD.ry;
  if (look === "hachimaki") {
    // A red headband round the brow, knotted at the back with two tails.
    const band = p.add(new THREE.TorusGeometry(0.285, 0.03, 6, 24), K.autumnRed, [0, HEAD.y + 0.1, 0]);
    band.rotation.x = Math.PI / 2;
    band.scale.set(1, 0.95, 1);
    for (const side of [-1, 1]) {
      const tail = p.add(new THREE.BoxGeometry(0.03, 0.14, 0.02), K.autumnRed, [side * 0.05, HEAD.y + 0.02, -0.28]);
      tail.rotation.z = side * 0.5;
    }
  } else if (look === "kasa") {
    // A wide conical straw hat with woven rings.
    // (Worn at the back of the head, so the face shows under its brim.)
    const hat = new THREE.Group();
    hat.position.set(0, top + 0.02, -0.06);
    hat.rotation.x = -0.35;
    p.root.add(hat);
    p.add(new THREE.ConeGeometry(0.36, 0.17, 18), K.boatYellow2, [0, 0, 0], [1, 1, 1], true, hat);
    for (const k of [0.45, 0.75]) {
      const ring = p.flat(new THREE.TorusGeometry(0.36 * k, 0.006, 3, 20), K.boatYellow1, [0, 0.085 - 0.17 * k, 0], [1, 1, 1], hat);
      ring.rotation.x = Math.PI / 2;
    }
  } else if (look === "kabuto") {
    // A samurai helmet: a dark dome, side flaps and a golden crescent crest.
    p.add(new THREE.SphereGeometry(0.31, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), K.sumiInk5, [0, HEAD.y + 0.11, -0.03], [1, 0.75, 1]);
    for (const side of [-1, 1]) {
      const flap = p.add(new THREE.BoxGeometry(0.16, 0.1, 0.03), K.autumnRed, [side * 0.3, HEAD.y + 0.04, 0]);
      flap.rotation.set(0, side * 1.2, side * 0.4);
    }
    const crest = p.add(new THREE.TorusGeometry(0.14, 0.022, 5, 14, Math.PI), K.carpYellow, [0, top + 0.06, 0.12]);
    crest.rotation.x = -0.2;
    p.add(ball(), K.carpYellow, [0, top + 0.05, 0.2], [0.06, 0.06, 0.03]);
  } else if (look === "krone") {
    // A golden crown with three points and red jewels.
    p.add(new THREE.CylinderGeometry(0.17, 0.18, 0.1, 16, 1, true), K.carpYellow, [0, top + 0.02, 0]);
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const x = Math.sin(angle) * 0.17, z = Math.cos(angle) * 0.17;
      p.add(new THREE.ConeGeometry(0.04, 0.1, 4), K.carpYellow, [x, top + 0.11, z]);
      p.flat(ball(), K.waveRed, [x * 1.04, top + 0.02, z * 1.04], [0.035, 0.035, 0.035]);
    }
  }
}

/** Golden medals on the chest, each with its badge's icon. */
function medals(p: Parts, icons: string[], badgeTexture: (icon: string) => THREE.Texture | undefined): void {
  icons.forEach((icon, i) => {
    const x = (i - (icons.length - 1) / 2) * 0.09;
    const y = 0.22 - Math.abs(x) * 0.3;
    const medal = p.add(new THREE.CylinderGeometry(0.042, 0.042, 0.012, 14), K.carpYellow, [x, y, 0.165], [1, 1, 1], false);
    medal.rotation.x = Math.PI / 2;
    // The ribbon above it.
    p.flat(new THREE.BoxGeometry(0.03, 0.05, 0.004), i % 2 ? K.crystalBlue : K.autumnRed, [x, y + 0.05, 0.16]);
    const texture = badgeTexture(icon);
    if (texture) {
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.034, 14), p.keep(new THREE.MeshBasicMaterial({ map: texture, transparent: true })));
      face.position.set(x, y, 0.173);
      p.root.add(face);
    }
  });
}
