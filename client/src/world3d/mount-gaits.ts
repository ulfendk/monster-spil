import * as THREE from "three";
import type { RideGait } from "@shared";
import type { MonsterModel, MountRig } from "../cave/monster-model";
import { KANAGAWA } from "../ui/theme";

/**
 * A ridden monster moving on the 3D map, each in its own way (shared/src/creature/riding.ts):
 *
 * - waddle: steps from foot to foot, swaying, arms swinging, tail wagging
 * - stomp: slow heavy strides, a big sway and a thump — dust at every footfall
 * - bound: leaps — crouch, spring up nose first, feet tucked, land nose down in a puff of dust
 * - slither: an S-curve running down the snake's body from the head to the tail, the head
 *   steady and looking along the curve; at rest the body lies in lazy waves
 * - glide: a snail's stretch and pull, leaving a shiny trail behind
 * - fly: up it goes with strong wing beats (a gust of wind on the ground at take-off and
 *   landing), leaning into the flight and banking into turns, feet tucked; at rest the wings
 *   fold and flutter now and then
 *
 * Steps are paced by the distance covered, not by time, so feet never skate. The rider sits
 * on the body (or a snake's second segment), so they rise, sway and lean with it. Works on the
 * model's rig (monster-model.ts `MountRig`); a model without one simply stands.
 */

/** How far (tiles) one full cycle of the gait carries it: two steps, one leap, one wave. */
const STRIDE: Record<RideGait, number> = { waddle: 0.9, stomp: 1.3, bound: 1.7, slither: 1.8, glide: 0.8, fly: 1 };

interface Puff {
  object: THREE.Object3D;
  age: number;
  life: number;
  update: (k: number) => void;
}

export class RideAnimator {
  private phase = 0;
  private wave = 0;
  private wavePhase = 0;
  private flap = 0;
  private moving = 0;
  private air = 0;
  private lastCycle = 0;
  private lastStep = 0;
  private trailGap = 0;
  private wasAirborne = false;
  private readonly baseY: number;
  private readonly puffs: Puff[] = [];
  private readonly rest = new Map<THREE.Object3D, { p: THREE.Vector3; r: THREE.Euler; s: THREE.Vector3 }>();

  constructor(
    private readonly model: MonsterModel,
    private readonly gait: RideGait,
    private readonly scene: THREE.Scene,
    private readonly heightAt: (x: number, z: number) => number,
  ) {
    this.baseY = model.root.position.y;
    const rig = model.rig;
    if (!rig) return;
    for (const o of [rig.body, ...rig.feet, ...rig.arms, ...(rig.tail ? [rig.tail] : []), ...rig.wings.map((w) => w.pivot), ...(rig.spine ?? []), ...(rig.head ? [rig.head] : [])]) {
      this.rest.set(o, { p: o.position.clone(), r: o.rotation.clone(), s: o.scale.clone() });
    }
    for (const w of rig.wings) w.pivot.userData.driven = true;
  }

  /** Where the rider goes: onto the body (or a snake's second segment), at the seat. Scale is the rider's size inside the model. */
  seatRider(rider: THREE.Object3D, scale: number): void {
    const rig = this.model.rig;
    const parent = rig?.spine?.[1] ?? rig?.body ?? this.model.root;
    parent.add(rider);
    // The seat is in the model's own coordinates; the parent sits somewhere inside it (at rest),
    // maybe in a group that's scaled.
    const chain: THREE.Object3D[] = [];
    for (let o: THREE.Object3D | null = parent; o && o !== this.model.root; o = o.parent) chain.unshift(o);
    const m = new THREE.Matrix4();
    for (const o of chain) {
      const r = this.rest.get(o);
      m.multiply(new THREE.Matrix4().compose(r?.p ?? o.position, new THREE.Quaternion().setFromEuler(r?.r ?? o.rotation), r?.s ?? o.scale));
    }
    rider.position.copy(this.model.seat).applyMatrix4(m.clone().invert());
    rider.scale.setScalar(scale / new THREE.Vector3().setFromMatrixScale(m).x);
  }

  /** How high above its spot it is now (tiles, for its shadow). */
  get height(): number {
    return (this.model.root.position.y - this.baseY) * this.model.root.parent!.getWorldScale(new THREE.Vector3()).y;
  }

  /**
   * One frame: `moved` is how far (tiles) it went since the last one, `turn` how fast it's
   * turning (radians a second), `t` the time in seconds.
   */
  update(dt: number, moved: number, turn: number, t: number): void {
    const target = moved / Math.max(dt, 1e-3) > 0.3 ? 1 : 0;
    this.moving += (target - this.moving) * Math.min(1, dt * (this.gait === "fly" ? 4 : 8));
    this.phase += (moved * Math.PI * 2) / STRIDE[this.gait];
    this.updatePuffs(dt);
    const rig = this.model.rig;
    if (!rig) return;
    for (const [o, r] of this.rest) {
      o.position.copy(r.p);
      o.rotation.copy(r.r);
      o.scale.copy(r.s);
    }
    this.model.root.position.y = this.baseY;
    const a = this.moving;
    // A little breath, whatever it does.
    const breath = Math.sin(t * 2.4) * 0.018 * (1 - a);
    rig.body.scale.y *= 1 + breath;
    switch (this.gait) {
      case "waddle":
        return this.walk(rig, a, t, { lift: 0.06, reach: 0.07, roll: 0.12, bob: 0.03, arms: 0.5, pitch: 0.05, dust: 0 });
      case "stomp":
        return this.walk(rig, a, t, { lift: 0.12, reach: 0.1, roll: 0.22, bob: 0.05, arms: 0.85, pitch: 0.12, dust: 1 });
      case "bound":
        return this.bound(rig, a);
      case "slither":
        return this.slither(rig, a, dt, t);
      case "glide":
        return this.glide(rig, a, moved);
      case "fly":
        return this.fly(rig, a, dt, turn, t);
    }
  }

  // ------------------------------------------------------------ the gaits

  private walk(rig: MountRig, a: number, t: number, g: { lift: number; reach: number; roll: number; bob: number; arms: number; pitch: number; dust: number }): void {
    const p = this.phase;
    rig.feet.forEach((foot, i) => {
      const s = Math.sin(p + i * Math.PI);
      foot.position.z += s * g.reach * a;
      foot.position.y += Math.max(0, s) * g.lift * a;
      foot.rotation.x = -Math.max(0, s) * 0.5 * a;
    });
    rig.arms.forEach((arm, i) => (arm.rotation.x += Math.sin(p + i * Math.PI + Math.PI) * g.arms * a));
    const s = Math.sin(p);
    rig.body.rotation.z += s * g.roll * a;
    rig.body.rotation.x += g.pitch * a;
    rig.body.rotation.y += s * g.roll * 0.4 * a;
    rig.body.position.y += Math.abs(s) * g.bob * a;
    if (g.dust) {
      // A heavy landing: squashed a little just as each foot comes down.
      const land = Math.pow(1 - Math.abs(s), 6);
      rig.body.scale.y *= 1 - 0.05 * land * a;
      rig.body.scale.x *= 1 + 0.03 * land * a;
    }
    if (rig.tail) rig.tail.rotation.y += Math.sin(p) * 0.4 * a + Math.sin(t * 2) * 0.12;
    // A footfall each half cycle: dust under heavy feet.
    const step = Math.floor(p / Math.PI);
    if (step !== this.lastStep) {
      this.lastStep = step;
      const foot = rig.feet[step & 1];
      if (g.dust && a > 0.5 && foot) this.dust(foot, 0.9);
    }
  }

  private bound(rig: MountRig, a: number): void {
    const u = (((this.phase / (Math.PI * 2)) % 1) + 1) % 1;
    // In the air from 15% to 85% of the cycle; crouched on the ground in between.
    const inAir = u > 0.15 && u < 0.85;
    const k = inAir ? (u - 0.15) / 0.7 : 0;
    const h = inAir ? Math.sin(Math.PI * k) : 0;
    this.model.root.position.y = this.baseY + h * 0.32 * a;
    // Nose up as it springs off, nose down as it lands.
    rig.body.rotation.x += (inAir ? -Math.cos(Math.PI * k) * 0.28 : 0) * a;
    // Stretched in the air, squashed on the ground (most just after landing, and just before the spring).
    const ground = inAir ? 0 : 1 - Math.abs((u < 0.15 ? u + 1 : u) - 1) / 0.15;
    rig.body.scale.y *= 1 + (h * 0.07 - ground * 0.13) * a;
    rig.body.scale.x *= 1 + ground * 0.08 * a;
    rig.body.scale.z *= 1 + ground * 0.08 * a;
    rig.feet.forEach((foot, i) => {
      foot.position.z += (inAir ? -0.06 + i * 0.02 : 0.05) * a;
      foot.position.y += (inAir ? 0.05 : 0) * a;
      foot.rotation.x = (inAir ? 0.7 : -0.2) * a;
    });
    rig.arms.forEach((arm) => (arm.rotation.x += (inAir ? -0.9 : 0.4) * a));
    if (rig.tail) rig.tail.rotation.x += (inAir ? -0.5 : 0.3) * a;
    const cycle = Math.floor(this.phase / (Math.PI * 2) - 0.85);
    if (cycle !== this.lastCycle) {
      this.lastCycle = cycle;
      if (a > 0.5) for (const foot of rig.feet) this.dust(foot, 0.7);
    }
  }

  private slither(rig: MountRig, a: number, dt: number, t: number): void {
    const spine = rig.spine ?? [];
    // The wave runs down the body as it goes; at rest it rolls on slowly by itself.
    this.wave += this.phase - this.wavePhase + dt * (1 - a) * 1.1;
    this.wavePhase = this.phase;
    const w = this.wave;
    const amp = 0.035 + 0.075 * a;
    const n = spine.length;
    const xs = spine.map((_, i) => amp * Math.sin(w - i * 0.8) * (0.35 + (0.65 * i) / Math.max(1, n - 1)));
    spine.forEach((seg, i) => {
      seg.position.x += xs[i]!;
      // Each segment turned along the curve.
      const next = xs[Math.min(n - 1, i + 1)]!;
      seg.rotation.y = Math.atan2(xs[i]! - next, 0.1);
      seg.position.y += Math.sin(w * 2 - i * 1.6) * 0.006 * a;
    });
    if (rig.head) {
      // The head stays steady, swaying a little and looking the way the curve goes; at rest it looks about.
      const hx = amp * 0.3 * Math.sin(w + 0.8);
      rig.head.position.x += hx;
      rig.head.rotation.y = Math.atan2(hx - (xs[0] ?? 0), 0.12) * 0.6 + Math.sin(t * 0.7) * 0.25 * (1 - a);
      rig.head.rotation.x = -0.1 * a + Math.sin(t * 1.3) * 0.04;
      rig.head.position.y += (0.02 + Math.sin(t * 1.9) * 0.01) * (1 - a);
    }
  }

  private glide(rig: MountRig, a: number, moved: number): void {
    const k = Math.sin(this.phase);
    // Stretch forward, then pull the back up after.
    rig.body.scale.z *= 1 + 0.13 * a * k;
    rig.body.scale.y *= 1 - 0.07 * a * k;
    rig.body.scale.x *= 1 - 0.04 * a * k;
    rig.body.position.z += 0.03 * a * k;
    rig.body.rotation.x += 0.03 * a * k;
    rig.feet.forEach((foot) => (foot.scale.y *= 0.8));
    // A shiny trail behind it.
    this.trailGap += moved;
    if (this.trailGap > 0.22) {
      this.trailGap = 0;
      const at = rig.body.getWorldPosition(new THREE.Vector3());
      this.slime(at);
    }
  }

  private fly(rig: MountRig, a: number, dt: number, turn: number, t: number): void {
    // Up when it moves, down when it stops (gently: it glides in to land).
    this.air += (a - this.air) * Math.min(1, dt * (a > this.air ? 2.2 : 1.6));
    const air = this.air;
    const airborne = air > 0.3;
    if (airborne !== this.wasAirborne) {
      this.wasAirborne = airborne;
      this.gust(this.model.root.getWorldPosition(new THREE.Vector3()));
    }
    // Beats: strong and quick in the air; at rest a flutter now and then.
    const rate = 1.1 + 2.4 * air;
    this.flap += dt * Math.PI * 2 * rate;
    const flutter = air > 0.05 ? 1 : Math.max(0, Math.sin(t * 0.9)) ** 8;
    const strength = 0.12 + 0.95 * air;
    const beat = Math.sin(this.flap) * strength * (air > 0.05 ? 1 : flutter);
    for (const w of rig.wings) {
      // Up and down about the shoulder, sweeping back a little on the downstroke; folded back at rest.
      w.pivot.rotation.set(w.rest.x, w.side * (w.rest.y + 0.35 * (1 - air) + 0.15 * Math.cos(this.flap) * air), w.rest.z + w.side * (beat + 0.25 * air));
    }
    // It rises on each downstroke; high up it leans into the flight and banks into turns.
    const bob = -Math.sin(this.flap) * 0.035 * air;
    this.model.root.position.y = this.baseY + air * 0.5 + bob + Math.sin(t * 1.7) * 0.02 * air;
    rig.body.rotation.x += 0.2 * air;
    rig.body.rotation.z += THREE.MathUtils.clamp(-turn * 0.18, -0.45, 0.45) * air;
    rig.feet.forEach((foot) => {
      foot.position.y += 0.05 * air;
      foot.rotation.x = 0.8 * air;
    });
    if (rig.tail) rig.tail.rotation.y += Math.sin(t * 2.2) * 0.25 * air;
  }

  // ------------------------------------------------------------ dust, slime and wind

  private dust(foot: THREE.Object3D, size: number): void {
    const at = foot.getWorldPosition(new THREE.Vector3());
    const y = this.heightAt(at.x, at.z) + 0.03;
    const ring = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ color: KANAGAWA.fujiGray, transparent: true, opacity: 0.55, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(at.x, y, at.z);
    this.scene.add(ring);
    this.add(ring, 0.55, (k) => {
      ring.scale.setScalar(0.12 + k * 0.35 * size);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k);
    });
    for (let i = 0; i < 3; i++) {
      const bit = new THREE.Mesh(BALL, new THREE.MeshBasicMaterial({ color: KANAGAWA.boatYellow2, transparent: true, opacity: 0.7, depthWrite: false }));
      const angle = Math.random() * Math.PI * 2;
      const dx = Math.cos(angle), dz = Math.sin(angle);
      this.scene.add(bit);
      this.add(bit, 0.6, (k) => {
        bit.position.set(at.x + dx * k * 0.22 * size, y + Math.sin(k * Math.PI) * 0.12 * size, at.z + dz * k * 0.22 * size);
        bit.scale.setScalar((0.05 + k * 0.05) * size);
        (bit.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k);
      });
    }
  }

  private slime(at: THREE.Vector3): void {
    const y = this.heightAt(at.x, at.z) + 0.025;
    const drop = new THREE.Mesh(DISC, new THREE.MeshBasicMaterial({ color: KANAGAWA.springBlue, transparent: true, opacity: 0.45, depthWrite: false }));
    drop.rotation.x = -Math.PI / 2;
    drop.position.set(at.x + (Math.random() - 0.5) * 0.05, y, at.z + (Math.random() - 0.5) * 0.05);
    drop.scale.set(0.16, 0.22, 1);
    this.scene.add(drop);
    this.add(drop, 5, (k) => ((drop.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - k) * (0.8 + 0.2 * Math.sin(k * 30))));
  }

  private gust(at: THREE.Vector3): void {
    const y = this.heightAt(at.x, at.z) + 0.04;
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ color: KANAGAWA.washi, transparent: true, opacity: 0.6, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(at.x, y, at.z);
      this.scene.add(ring);
      const delay = i * 0.15;
      this.add(ring, 0.8 + delay, (k) => {
        const q = Math.max(0, (k * (0.8 + delay) - delay) / 0.8);
        ring.scale.setScalar(0.2 + q * 1.1);
        (ring.material as THREE.MeshBasicMaterial).opacity = q > 0 ? 0.6 * (1 - q) : 0;
      });
    }
  }

  private add(object: THREE.Object3D, life: number, update: (k: number) => void): void {
    update(0);
    this.puffs.push({ object, age: 0, life, update });
  }

  private updatePuffs(dt: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]!;
      p.age += dt;
      if (p.age >= p.life) {
        this.scene.remove(p.object);
        ((p.object as THREE.Mesh).material as THREE.Material).dispose();
        this.puffs.splice(i, 1);
      } else p.update(p.age / p.life);
    }
  }

  dispose(): void {
    for (const p of this.puffs) {
      this.scene.remove(p.object);
      ((p.object as THREE.Mesh).material as THREE.Material).dispose();
    }
    this.puffs.length = 0;
  }
}

const RING = new THREE.RingGeometry(0.7, 1, 24);
const DISC = new THREE.CircleGeometry(1, 16);
const BALL = new THREE.SphereGeometry(1, 6, 4);
