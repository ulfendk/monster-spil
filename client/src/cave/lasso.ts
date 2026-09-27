import * as THREE from "three";
import type { TypeId } from "@shared";
import { KANAGAWA } from "../ui/theme";

/**
 * The lasso thrown to catch a monster — made of the element of the monster it's for:
 *
 * - fire (ild): a glowing loop licked by flame tongues, trailing embers
 * - water (vand): a clear blue ring of water with droplets running round it, dripping
 * - grass (graes): a twisted vine with leaves and blossoms, shedding leaves as it flies
 * - lightning (lyn): a crackling loop of electricity with sparks jumping off it
 * - stone (sten): a chain of stones, raising dust
 *
 * It twirls in the hand while you aim, flies open along the throw's arc (the rope trailing
 * back to the hand), drops over the monster and pulls tight, and either glows as the monster
 * is caught or bursts apart as it breaks free (throw-stage.ts plays it; the catching rules
 * are unchanged). Sizes in metres; the loop lies flat (in its own x–y plane) until placed.
 */

const K = KANAGAWA;
const ROPE_BEADS = 30;

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  age: number;
  gravity: number;
  grow: number;
  spin: number;
}

interface Style {
  /** The rope's beads (and their size). */
  bead: number;
  beadSize: number;
  beadAdditive: boolean;
  /** What trails behind while it flies, and bursts out at the end. */
  trail: number[];
  trailGravity: number;
  trailAdditive: boolean;
}

const STYLES: Record<TypeId, Style> = {
  ild: { bead: K.surimiOrange, beadSize: 0.022, beadAdditive: true, trail: [K.surimiOrange, K.carpYellow, K.autumnRed], trailGravity: -0.6, trailAdditive: true },
  vand: { bead: K.crystalBlue, beadSize: 0.024, beadAdditive: false, trail: [K.springBlue, K.crystalBlue, K.fujiWhite], trailGravity: 6, trailAdditive: false },
  graes: { bead: K.autumnGreen, beadSize: 0.02, beadAdditive: false, trail: [K.springGreen, K.autumnGreen, K.sakuraPink], trailGravity: 0.8, trailAdditive: false },
  lyn: { bead: K.carpYellow, beadSize: 0.016, beadAdditive: true, trail: [K.fujiWhite, K.carpYellow, K.springBlue], trailGravity: 0, trailAdditive: true },
  sten: { bead: K.katanaGray, beadSize: 0.03, beadAdditive: false, trail: [K.fujiGray, K.boatYellow2, K.katanaGray], trailGravity: 4, trailAdditive: false },
};

export class Lasso {
  /** Everything of it in the scene (add this to the scene). */
  readonly root = new THREE.Group();
  /** The loop: its centre is where the lasso "is". */
  readonly loop = new THREE.Group();
  private readonly ring = new THREE.Group();
  private kind: TypeId = "sten";
  private radius = 0.16;
  private spin = 0;
  private glowing = 0;
  private flash = 0;
  private hand = new THREE.Vector3();
  /** How far the rope reaches (0 = none: in the hand), and how taut it is. */
  private rope = 0;
  private taut = 0;
  private flying = false;
  private trailTimer = 0;
  private readonly beads: THREE.InstancedMesh;
  private readonly particles: Particle[] = [];
  private readonly parts: THREE.Object3D[] = [];
  private flames: THREE.Mesh[] = [];
  private droplets: THREE.Mesh[] = [];
  private bolts: THREE.LineLoop[] = [];
  private stones: THREE.Mesh[] = [];
  private boltTimer = 0;
  private readonly sparkGeometry = new THREE.SphereGeometry(1, 6, 4);
  private readonly leafGeometry = new THREE.SphereGeometry(1, 8, 4);

  constructor(hand: THREE.Vector3) {
    this.hand.copy(hand);
    this.root.add(this.loop);
    this.loop.add(this.ring);
    this.beads = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: K.katanaGray }), ROPE_BEADS);
    this.beads.frustumCulled = false;
    this.root.add(this.beads);
    this.build();
  }

  get type(): TypeId {
    return this.kind;
  }

  get position(): THREE.Vector3 {
    return this.loop.position;
  }

  get visible(): boolean {
    return this.root.visible;
  }

  set visible(v: boolean) {
    this.root.visible = v;
  }

  /** Made of this element from now on. */
  setType(type: TypeId): void {
    if (type === this.kind) return;
    this.kind = type;
    this.build();
  }

  // ------------------------------------------------------------ where it is

  /** In the hand: a small loop twirling over the hand, no rope out. */
  hold(): void {
    this.flying = false;
    this.rope = 0;
    this.glowing = 0;
    this.radius = 0.24;
    this.loop.position.copy(this.hand).add(new THREE.Vector3(0, 0.1, 0));
    this.loop.rotation.set(-Math.PI / 2 + 0.55, 0, 0);
    this.loop.scale.setScalar(1);
    this.loop.visible = true;
    this.beads.visible = true;
    this.root.visible = true;
  }

  /** In flight at `p`, `k` of the way (it opens as it goes), the rope trailing back to the hand. */
  fly(p: THREE.Vector3, k: number): void {
    this.flying = true;
    this.rope = 1;
    this.taut = 0.2 + 0.5 * k;
    this.radius = 0.24 + 0.36 * Math.min(1, k * 1.6);
    this.loop.position.copy(p);
    // Nearly flat, tipped towards the camera so the ring shows.
    this.loop.rotation.set(-Math.PI / 2 + 0.45, 0, 0);
  }

  /** Round a monster: its middle at `centre`, pulled to `radius`, the rope taut back to the hand. */
  wrap(centre: THREE.Vector3, radius: number): void {
    this.flying = false;
    this.rope = 1;
    this.taut = 1;
    this.radius = radius;
    this.loop.position.copy(centre);
    this.loop.rotation.set(-Math.PI / 2 + 0.2, 0, 0);
  }

  /** Lying on the ground at `p` after a miss (open, the rope slack). */
  lie(p: THREE.Vector3): void {
    this.flying = false;
    this.rope = 1;
    this.taut = 0;
    this.radius = 0.5;
    this.loop.position.copy(p);
    this.loop.rotation.set(-Math.PI / 2, 0, 0);
  }

  /** Gone (burst apart): the loop and rope go, the bits flying off stay. */
  hideLoop(): void {
    this.loop.visible = false;
    this.beads.visible = false;
    this.flying = false;
  }

  /** A flash as it pulls tight (0–1, eased out by itself). */
  pulse(): void {
    this.flash = 1;
  }

  /** Glowing brighter (0–1): the catch is made. */
  glow(k: number): void {
    this.glowing = k;
  }

  /** Bursts apart in its element: `strong` for breaking (more, further). */
  burst(strong: boolean): void {
    const style = STYLES[this.kind];
    const n = strong ? 34 : 22;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const at = this.ringPoint(a);
      const out = at.clone().sub(this.loop.position).normalize();
      const speed = (strong ? 2.6 : 1.4) * (0.6 + Math.random() * 0.8);
      this.emit(at, out.multiplyScalar(speed).add(new THREE.Vector3(0, 0.8 + Math.random(), 0)), style.trail[i % style.trail.length]!, 0.6 + Math.random() * 0.5);
    }
  }

  // ------------------------------------------------------------ every frame

  update(dt: number, time: number): void {
    this.flash = Math.max(0, this.flash - dt * 3);
    // Twirling: fast in the hand and in flight, slowly round a monster.
    this.spin += dt * (this.rope === 0 ? 9 : this.flying ? 7 : 0.8);
    this.ring.rotation.z = this.spin;
    this.ring.scale.setScalar(this.radius);
    const bright = 1 + this.glowing * 1.5 + this.flash * 0.8;
    this.animateElement(dt, time, bright);
    this.updateRope(time);
    // A trail behind it in flight.
    if (this.flying) {
      this.trailTimer -= dt;
      while (this.trailTimer < 0) {
        this.trailTimer += 0.025;
        const style = STYLES[this.kind];
        const at = this.ringPoint(Math.random() * Math.PI * 2);
        const drift = new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.3) * 0.4, (Math.random() - 0.5) * 0.4);
        this.emit(at, drift, style.trail[Math.floor(Math.random() * style.trail.length)]!, 0.5 + Math.random() * 0.4);
      }
    }
    // While it glows (a catch), its element streams up off it.
    if (this.glowing > 0.2 && Math.random() < dt * 40) {
      const style = STYLES[this.kind];
      this.emit(this.ringPoint(Math.random() * Math.PI * 2), new THREE.Vector3(0, 1.2, 0), style.trail[0]!, 0.6);
    }
    this.updateParticles(dt);
  }

  // ------------------------------------------------------------ the loop, by element

  private build(): void {
    for (const p of this.parts) {
      p.parent?.remove(p);
      p.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry && mesh.geometry !== this.sparkGeometry && mesh.geometry !== this.leafGeometry) mesh.geometry.dispose();
        (mesh.material as THREE.Material | undefined)?.dispose();
      });
    }
    this.parts.length = 0;
    this.flames = [];
    this.droplets = [];
    this.bolts = [];
    this.stones = [];
    const style = STYLES[this.kind];
    const beadMaterial = this.beads.material as THREE.MeshBasicMaterial;
    beadMaterial.color.setHex(style.bead);
    beadMaterial.blending = style.beadAdditive ? THREE.AdditiveBlending : THREE.NormalBlending;
    beadMaterial.transparent = style.beadAdditive || this.kind === "vand";
    beadMaterial.opacity = this.kind === "vand" ? 0.8 : 1;
    beadMaterial.depthWrite = !style.beadAdditive;
    beadMaterial.needsUpdate = true;
    // (The ring is built at radius 1 and scaled to the loop's size each frame.)
    const add = (o: THREE.Object3D) => {
      this.ring.add(o);
      this.parts.push(o);
      return o;
    };
    const glow = (colour: number, opacity = 1) => new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    switch (this.kind) {
      case "ild": {
        add(new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 8, 40), glow(K.surimiOrange, 0.85)));
        add(new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 40), glow(K.carpYellow)));
        const cone = new THREE.ConeGeometry(0.09, 0.3, 6);
        cone.translate(0, 0.15, 0);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const f = add(new THREE.Mesh(cone, glow([K.autumnRed, K.surimiOrange, K.carpYellow][i % 3]!, 0.9))) as THREE.Mesh;
          f.position.set(Math.cos(a), Math.sin(a), 0);
          // Pointing outwards and up out of the ring.
          f.rotation.set(0, 0, a - Math.PI / 2);
          f.rotation.x = 0.6;
          this.flames.push(f);
        }
        break;
      }
      case "vand": {
        add(new THREE.Mesh(new THREE.TorusGeometry(1, 0.15, 12, 48), new THREE.MeshStandardMaterial({ color: K.springBlue, transparent: true, opacity: 0.88, roughness: 0.1, metalness: 0.1, emissive: K.crystalBlue, emissiveIntensity: 0.55 })));
        // Foam curling along it, and a bright glint.
        add(new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.05, 6, 48), new THREE.MeshBasicMaterial({ color: K.fujiWhite, transparent: true, opacity: 0.75 })));
        for (let i = 0; i < 14; i++) {
          const d = add(new THREE.Mesh(this.sparkGeometry, new THREE.MeshStandardMaterial({ color: i % 3 ? K.springBlue : K.fujiWhite, transparent: true, opacity: 0.85, roughness: 0.1 }))) as THREE.Mesh;
          d.scale.setScalar(0.045);
          d.userData.a = (i / 14) * Math.PI * 2;
          this.droplets.push(d);
        }
        break;
      }
      case "graes": {
        // A vine of two strands twisted round each other, with leaves and a few blossoms.
        for (const off of [0, Math.PI]) {
          const pts: THREE.Vector3[] = [];
          for (let i = 0; i <= 64; i++) {
            const a = (i / 64) * Math.PI * 2;
            const w = 0.05 * Math.cos(a * 9 + off);
            pts.push(new THREE.Vector3(Math.cos(a) * (1 + w), Math.sin(a) * (1 + w), 0.05 * Math.sin(a * 9 + off)));
          }
          add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, 0.06, 5, true), new THREE.MeshStandardMaterial({ color: off ? K.autumnGreen : K.springGreen, roughness: 0.8 })));
        }
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2 + 0.2;
          const blossom = i % 4 === 1;
          const leaf = add(new THREE.Mesh(this.leafGeometry, new THREE.MeshStandardMaterial({ color: blossom ? K.sakuraPink : K.springGreen, roughness: 0.7 }))) as THREE.Mesh;
          const out = blossom ? 1.02 : 1.12;
          leaf.position.set(Math.cos(a) * out, Math.sin(a) * out, blossom ? 0.06 : 0);
          leaf.scale.set(blossom ? 0.07 : 0.14, blossom ? 0.07 : 0.06, blossom ? 0.05 : 0.02);
          leaf.rotation.z = a + (blossom ? 0 : 0.5);
          leaf.userData.a = a;
          this.flames.push(leaf);
        }
        break;
      }
      case "lyn": {
        add(new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 40), glow(K.carpYellow)));
        add(new THREE.Mesh(new THREE.TorusGeometry(1, 0.16, 6, 40), glow(K.carpYellow, 0.3)));
        for (const colour of [K.fujiWhite, K.carpYellow, K.springBlue]) {
          const geometry = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(48 * 3), 3));
          const bolt = add(new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color: colour, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))) as THREE.LineLoop;
          this.bolts.push(bolt);
        }
        this.zap();
        break;
      }
      case "sten": {
        const stone = new THREE.DodecahedronGeometry(1, 0);
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const s = add(new THREE.Mesh(stone, new THREE.MeshStandardMaterial({ color: [K.katanaGray, K.fujiGray, K.sumiInk6][i % 3], roughness: 0.95, flatShading: true }))) as THREE.Mesh;
          s.position.set(Math.cos(a), Math.sin(a), 0);
          s.scale.setScalar(0.13 + (i % 3) * 0.03);
          s.rotation.set(i, i * 2, i * 3);
          this.stones.push(s);
        }
        // A cord running through them.
        add(new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 5, 40), new THREE.MeshStandardMaterial({ color: K.boatYellow2, roughness: 0.9 })));
        break;
      }
    }
  }

  private animateElement(dt: number, time: number, bright: number): void {
    // The ring is scaled with the loop: undo that on the pieces that shouldn't stretch.
    const inv = 1 / Math.max(0.05, this.radius);
    switch (this.kind) {
      case "ild":
        this.flames.forEach((f, i) => {
          const k = 1 + Math.sin(time * 17 + i * 1.9) * 0.25 + Math.sin(time * 29 + i) * 0.12;
          f.scale.set(inv * 0.5 * bright, inv * 0.5 * k * bright, inv * 0.5 * bright);
        });
        break;
      case "vand":
        // Droplets race round the ring.
        this.droplets.forEach((d, i) => {
          const a = (d.userData.a as number) + time * 2.2;
          d.position.set(Math.cos(a) * (1 + Math.sin(time * 5 + i) * 0.04), Math.sin(a) * (1 + Math.sin(time * 5 + i) * 0.04), 0.06 * Math.sin(a * 3 + time * 4));
          d.scale.setScalar(0.04 * inv * (1 + (bright - 1) * 0.5));
        });
        break;
      case "graes":
        this.flames.forEach((leaf, i) => (leaf.rotation.x = Math.sin(time * 3 + i) * 0.5));
        break;
      case "lyn":
        this.boltTimer -= dt;
        if (this.boltTimer <= 0) {
          this.boltTimer = 0.04 + Math.random() * 0.04;
          this.zap();
        }
        for (const b of this.bolts) (b.material as THREE.LineBasicMaterial).opacity = Math.min(1, (0.6 + Math.random() * 0.4) * bright);
        break;
      case "sten":
        this.stones.forEach((s, i) => {
          s.rotation.x += dt * (1 + (i % 3));
          s.rotation.y += dt * 0.7;
        });
        break;
    }
    // A glow shows as the whole ring brightening (the additive parts) or a lighter tint.
    this.ring.traverse((o) => {
      const material = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (material && "emissiveIntensity" in material && material.emissive) material.emissiveIntensity = 0.3 + (bright - 1) * 0.9;
    });
  }

  /** New jagged lightning round the ring. */
  private zap(): void {
    for (const bolt of this.bolts) {
      const pos = bolt.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const a = (i / pos.count) * Math.PI * 2;
        const r = 1 + (Math.random() - 0.5) * 0.28;
        pos.setXYZ(i, Math.cos(a) * r, Math.sin(a) * r, (Math.random() - 0.5) * 0.2);
      }
      pos.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------ the rope back to the hand

  private updateRope(time: number): void {
    if (this.rope === 0) {
      this.beads.count = 0;
      return;
    }
    // From the hand to the near side of the loop, sagging when slack.
    const end = this.ringPoint(Math.PI * 1.5, false);
    const start = this.hand.clone().add(new THREE.Vector3(0.05, -0.05, 0));
    const mid = start.clone().lerp(end, 0.5);
    mid.y -= (1 - this.taut) * 0.25 * start.distanceTo(end) * 0.5;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const style = STYLES[this.kind];
    let n = 0;
    for (let i = 0; i < ROPE_BEADS; i++) {
      const t = i / (ROPE_BEADS - 1);
      // (A quadratic curve through the sagging middle.)
      p.set(0, 0, 0)
        .addScaledVector(start, (1 - t) * (1 - t))
        .addScaledVector(mid, 2 * t * (1 - t))
        .addScaledVector(end, t * t);
      let size = style.beadSize;
      if (this.kind === "lyn") {
        // Crackling: jumping about, flickering out.
        if (Math.random() < 0.15) continue;
        p.x += (Math.random() - 0.5) * 0.05;
        p.y += (Math.random() - 0.5) * 0.05;
      } else if (this.kind === "ild") size *= 1 + Math.sin(time * 20 + i) * 0.3;
      else if (this.kind === "graes" && i % 5 === 2) size *= 1.8;
      else if (this.kind === "sten") size *= 0.8 + ((i * 7) % 5) * 0.12;
      else if (this.kind === "vand") p.y += Math.sin(time * 8 + i * 0.7) * 0.01;
      m.makeScale(size, size, size).setPosition(p);
      this.beads.setMatrixAt(n++, m);
    }
    this.beads.count = n;
    this.beads.instanceMatrix.needsUpdate = true;
  }

  /** A point on the loop's rim (world), at angle `a` round it. */
  private ringPoint(a: number, spinning = true): THREE.Vector3 {
    const angle = a + (spinning ? this.spin : 0);
    this.loop.updateMatrixWorld();
    return new THREE.Vector3(Math.cos(angle) * this.radius, Math.sin(angle) * this.radius, 0).applyMatrix4(this.loop.matrixWorld);
  }

  // ------------------------------------------------------------ bits of the element flying off

  private emit(at: THREE.Vector3, velocity: THREE.Vector3, colour: number, life: number): void {
    if (this.particles.length > 160) return;
    const style = STYLES[this.kind];
    const leafy = this.kind === "graes";
    const material = new THREE.MeshBasicMaterial({ color: colour, transparent: true, depthWrite: false, blending: style.trailAdditive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const mesh = new THREE.Mesh(leafy ? this.leafGeometry : this.sparkGeometry, material);
    mesh.position.copy(at);
    const size = this.kind === "sten" ? 0.035 : this.kind === "lyn" ? 0.015 : leafy ? 0.05 : 0.025;
    mesh.scale.set(size, leafy ? size * 0.4 : size, size);
    this.root.add(mesh);
    this.particles.push({ mesh, velocity, life, age: 0, gravity: style.trailGravity, grow: this.kind === "sten" ? 2.5 : 0, spin: leafy ? 4 : 0 });
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.age += dt;
      if (p.age >= p.life) {
        this.root.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.velocity.y -= p.gravity * dt;
      if (this.kind === "graes") p.velocity.multiplyScalar(1 - dt * 1.5); // leaves drift
      p.mesh.position.addScaledVector(p.velocity, dt);
      if (p.mesh.position.y < 0.02) {
        p.mesh.position.y = 0.02;
        p.velocity.set(p.velocity.x * 0.3, 0, p.velocity.z * 0.3);
      }
      const k = p.age / p.life;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      if (p.grow) p.mesh.scale.multiplyScalar(1 + p.grow * dt);
      if (p.spin) p.mesh.rotation.z += p.spin * dt;
    }
  }

  dispose(): void {
    for (const p of this.particles) (p.mesh.material as THREE.Material).dispose();
    this.particles.length = 0;
  }
}
