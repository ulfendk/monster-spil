import * as THREE from "three";
import type { CaveLook, Vec3 } from "@shared";
import { KANAGAWA, kanagawaColour } from "../ui/theme";
import { ThrowStage, type LivingMonster, type StageMonster } from "./throw-stage";

export type { StageMonster, ThrowResult } from "./throw-stage";

/**
 * The cave, in 3D. Its look comes from its kind (caves.json: crystals, ice, lava,
 * mushrooms or a pool, with drifting snow, embers, spores or drips), its boulders from the
 * visit's seed; monsters peek out from behind them, sometimes scamper to another one, and
 * hide again. The ball, its flight, catching and the monsters' faces are ThrowStage's.
 */

/** How high a monster's middle is when it peeks over its rock. */
const PEEK_Y = 1.95;
const HIDDEN_Y = -0.3;
/** At most this many monsters show themselves at once (it's for a 6-year-old). */
const MAX_PEEKING = 2;

type Phase = "hidden" | "rising" | "peeking" | "sinking" | "hopping" | "caught";

interface Monster extends LivingMonster {
  rock: number;
  phase: Phase;
  /** Seconds left in this phase. */
  timer: number;
  hopFrom?: THREE.Vector3;
  hopTo?: THREE.Vector3;
  /** Set once it has shown itself (the scene marks it as seen). */
  seen: boolean;
}

export class CaveStage extends ThrowStage<Monster> {
  /** A monster showed itself for the first time. */
  onSeen?: (speciesId: string) => void;
  /** Where the boulders stand; monsters hide just behind them. */
  private readonly rocks: Vec3[];
  private particles?: { points: THREE.Points; velocity: Float32Array; kind: CaveLook["particles"] };

  constructor(
    canvas: HTMLCanvasElement,
    monsters: StageMonster[],
    seed: number,
    private readonly look: CaveLook,
    rocks: Array<{ x: number; z: number }>
  ) {
    super(canvas, seed);
    this.rocks = rocks.map((r) => ({ x: r.x, y: 0, z: r.z }));
    const fog = this.colour(look.fog, KANAGAWA.sumiInk0);
    this.scene.background = new THREE.Color(fog);
    this.scene.fog = new THREE.FogExp2(fog, 0.055);
    this.buildCave();
    monsters.forEach((m, i) => this.addMonster(m, i));
    this.start();
  }

  // ------------------------------------------------------------ the cave

  /** A colour from the kind's look (a Kanagawa palette name). */
  private colour(name: string | undefined, fallback: number): number {
    return kanagawaColour(name, fallback);
  }

  private glow(i: number): number {
    const glow = this.look.glow;
    return this.colour(glow[i % Math.max(1, glow.length)], KANAGAWA.waveAqua2);
  }

  private buildCave(): void {
    const rand = () => this.rng.next();
    this.scene.add(new THREE.HemisphereLight(KANAGAWA.fujiWhite, KANAGAWA.sumiInk4, 1.1));
    this.scene.add(new THREE.AmbientLight(this.glow(1), 0.35));
    // A warm lantern by the player.
    const lantern = new THREE.PointLight(KANAGAWA.surimiOrange, 30, 0, 1.6);
    lantern.position.set(0.6, 2.2, 0);
    this.scene.add(lantern);

    // The floor: a gently uneven plane.
    const floor = new THREE.PlaneGeometry(40, 40, 30, 30);
    const pos = floor.attributes.position!;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, (rand() - 0.5) * 0.25);
    floor.computeVertexNormals();
    const ground = new THREE.Mesh(floor, new THREE.MeshStandardMaterial({ color: this.colour(this.look.floor, KANAGAWA.sumiInk5), flatShading: true, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -8;
    this.scene.add(ground);

    // The walls and roof: the inside of a lumpy dome.
    const dome = new THREE.SphereGeometry(16, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    const dp = dome.attributes.position!;
    for (let i = 0; i < dp.count; i++) {
      const k = 1 + (rand() - 0.5) * 0.18;
      dp.setXYZ(i, dp.getX(i) * k, dp.getY(i) * (0.55 + (rand() - 0.5) * 0.08), dp.getZ(i) * k);
    }
    dome.computeVertexNormals();
    const walls = new THREE.Mesh(dome, new THREE.MeshStandardMaterial({ color: this.colour(this.look.walls, KANAGAWA.sumiInk6), flatShading: true, side: THREE.BackSide, roughness: 1 }));
    walls.position.z = -8;
    this.scene.add(walls);

    // Stalactites from the roof, stalagmites from the floor (icicles in an ice cave).
    const ice = this.look.decor === "icicles";
    const stone = ice
      ? new THREE.MeshStandardMaterial({ color: KANAGAWA.springBlue, emissive: KANAGAWA.springBlue, emissiveIntensity: 0.25, transparent: true, opacity: 0.85, roughness: 0.2, flatShading: true })
      : new THREE.MeshStandardMaterial({ color: KANAGAWA.katanaGray, flatShading: true, roughness: 0.9 });
    for (let i = 0; i < (ice ? 40 : 26); i++) {
      const h = 0.8 + rand() * (ice ? 3 : 2.4);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.15 + rand() * (ice ? 0.2 : 0.35), h, 6), stone);
      const x = (rand() - 0.5) * 18;
      const z = -3 - rand() * 17;
      const roof = 7.5 - Math.abs(x) * 0.25;
      if (i % 3 === 0 && Math.abs(x) > 4.5) {
        cone.position.set(x, h / 2, z);
      } else {
        cone.rotation.x = Math.PI;
        cone.position.set(x, roof - h / 2, z);
      }
      this.scene.add(cone);
    }

    if (this.look.decor === "lava") this.buildLava();
    else if (this.look.decor === "mushrooms") this.buildMushrooms();
    else if (this.look.decor === "pool") this.buildPool();
    else this.buildCrystals(ice);

    // The boulders the monsters hide behind.
    const rockMaterial = new THREE.MeshStandardMaterial({ color: this.colour(this.look.walls, KANAGAWA.sumiInk6), flatShading: true, roughness: 1 });
    for (const r of this.rocks) {
      const geo = new THREE.DodecahedronGeometry(1.15, 0);
      const gp = geo.attributes.position!;
      for (let i = 0; i < gp.count; i++) gp.setXYZ(i, gp.getX(i) * (0.9 + rand() * 0.25), gp.getY(i) * (0.9 + rand() * 0.2), gp.getZ(i) * (0.9 + rand() * 0.25));
      geo.computeVertexNormals();
      const rock = new THREE.Mesh(geo, rockMaterial);
      rock.position.set(r.x, 0.55, r.z);
      rock.scale.set(1.25, 0.7, 0.8);
      rock.rotation.y = rand() * Math.PI;
      this.scene.add(rock);
    }

    this.buildParticles();
  }

  /** Glowing crystals along the sides (frosty ones in an ice cave), each lighting a little of the wall. */
  private buildCrystals(ice: boolean): void {
    const rand = () => this.rng.next();
    for (let i = 0; i < 7; i++) {
      const colour = this.glow(i);
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.25 + rand() * 0.35),
        new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: ice ? 0.6 : 1.2, flatShading: true, transparent: ice, opacity: ice ? 0.8 : 1 })
      );
      const side = i % 2 ? 1 : -1;
      crystal.position.set(side * (4.5 + rand() * 3), 0.3 + rand() * 1.2, -4 - rand() * 14);
      crystal.rotation.set(rand(), rand(), rand());
      crystal.scale.y = 1.6;
      this.scene.add(crystal);
      const light = new THREE.PointLight(colour, 6, 7, 1.5);
      light.position.copy(crystal.position);
      this.scene.add(light);
      // Crystals pulse gently.
      const phase = rand() * 6;
      this.animated.push((t) => ((crystal.material as THREE.MeshStandardMaterial).emissiveIntensity = (ice ? 0.5 : 1) + Math.sin(t * 1.3 + phase) * 0.3));
    }
  }

  /** Cracks of glowing lava across the floor, a bubbling lava pool at the side, and a red glow. */
  private buildLava(): void {
    const rand = () => this.rng.next();
    const hot = new THREE.MeshBasicMaterial({ color: this.glow(0) });
    for (let i = 0; i < 9; i++) {
      // A crack: a thin, jagged strip lying on the floor.
      const pts: THREE.Vector2[] = [];
      let x = (rand() - 0.5) * 12;
      let z = -3 - rand() * 14;
      for (let k = 0; k < 6; k++) {
        pts.push(new THREE.Vector2(x, z));
        x += (rand() - 0.5) * 1.6;
        z -= 0.5 + rand() * 0.8;
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts.flatMap((p, k) => (k ? [new THREE.Vector3(pts[k - 1]!.x, 0.03, pts[k - 1]!.y), new THREE.Vector3(p.x, 0.03, p.y)] : [])));
      this.scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: this.glow(i) })));
    }
    for (const side of [-1, 1]) {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1.6 + rand(), 24), hot.clone());
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(side * (5.5 + rand() * 1.5), 0.05, -7 - rand() * 6);
      this.scene.add(pool);
      const light = new THREE.PointLight(this.glow(0), 18, 9, 1.4);
      light.position.set(pool.position.x, 0.8, pool.position.z);
      this.scene.add(light);
      const phase = rand() * 6;
      // The pool's glow flickers like something bubbling.
      this.animated.push((t) => (light.intensity = 14 + Math.sin(t * 3.1 + phase) * 4 + Math.sin(t * 7.3 + phase) * 2));
    }
  }

  /** Clusters of glowing mushrooms along the walls. */
  private buildMushrooms(): void {
    const rand = () => this.rng.next();
    const stem = new THREE.MeshStandardMaterial({ color: KANAGAWA.oldWhite, roughness: 0.8 });
    for (let c = 0; c < 8; c++) {
      const colour = this.glow(c);
      const cap = new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.9, roughness: 0.6 });
      const side = c % 2 ? 1 : -1;
      const cx = side * (4.2 + rand() * 3);
      const cz = -3.5 - rand() * 14;
      for (let m = 0; m < 3 + Math.floor(rand() * 3); m++) {
        const h = 0.3 + rand() * 0.9;
        const r = 0.2 + rand() * 0.35;
        const x = cx + (rand() - 0.5) * 1.2;
        const z = cz + (rand() - 0.5) * 1.2;
        const s = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.25, r * 0.35, h, 8), stem);
        s.position.set(x, h / 2, z);
        const top = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), cap);
        top.position.set(x, h, z);
        this.scene.add(s, top);
      }
      const light = new THREE.PointLight(colour, 5, 6, 1.5);
      light.position.set(cx, 1, cz);
      this.scene.add(light);
      const phase = rand() * 6;
      this.animated.push((t) => (cap.emissiveIntensity = 0.7 + Math.sin(t * 0.9 + phase) * 0.35));
    }
  }

  /** A still, dark pool across the back of the cave that shimmers, with a few glowing stones. */
  private buildPool(): void {
    const rand = () => this.rng.next();
    const water = new THREE.MeshStandardMaterial({ color: this.glow(1), emissive: this.glow(0), emissiveIntensity: 0.5, transparent: true, opacity: 0.85, roughness: 0.1, metalness: 0.3 });
    // A wide pool curving round behind the boulders and out to both sides, where it is easy to see.
    for (const [x, z, sx, sz] of [[0, -13, 10, 3.2], [-6.5, -8, 2.6, 4.5], [6.5, -8.5, 2.6, 4.5]] as const) {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 40), water);
      pool.rotation.x = -Math.PI / 2;
      pool.scale.set(sx, sz, 1);
      pool.position.set(x, 0.04, z);
      this.scene.add(pool);
    }
    const shimmer = new THREE.PointLight(this.glow(0), 10, 14, 1.3);
    shimmer.position.set(0, 1.5, -11);
    this.scene.add(shimmer);
    this.animated.push((t) => {
      water.emissiveIntensity = 0.45 + Math.sin(t * 1.7) * 0.12 + Math.sin(t * 4.1) * 0.05;
      shimmer.intensity = 9 + Math.sin(t * 2.3) * 2;
    });
    for (let i = 0; i < 6; i++) {
      const colour = this.glow(i);
      const stoneLight = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2 + rand() * 0.2), new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 1 }));
      const side = i % 2 ? 1 : -1;
      stoneLight.position.set(side * (4.5 + rand() * 3), 0.2, -4 - rand() * 12);
      this.scene.add(stoneLight);
      const light = new THREE.PointLight(colour, 4, 6, 1.5);
      light.position.copy(stoneLight.position).setY(0.8);
      this.scene.add(light);
    }
  }

  /** Something drifting in the air: snow falling, embers rising, spores floating, drops dripping. */
  private buildParticles(): void {
    const kind = this.look.particles;
    if (kind === "none") return;
    const n = kind === "drips" ? 40 : 160;
    const positions = new Float32Array(n * 3);
    const velocity = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this.resetParticle(positions, velocity, i, true);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const colour = kind === "snow" ? KANAGAWA.fujiWhite : kind === "drips" ? this.glow(1) : this.glow(0);
    const size = kind === "snow" ? 0.09 : kind === "drips" ? 0.07 : 0.06;
    const points = new THREE.Points(geo, new THREE.PointsMaterial({ color: colour, size, transparent: true, opacity: 0.9, fog: true }));
    this.scene.add(points);
    this.particles = { points, velocity, kind };
  }

  private resetParticle(p: Float32Array, v: Float32Array, i: number, anywhere: boolean): void {
    const r = () => this.rng.next();
    const kind = this.look.particles;
    const x = (r() - 0.5) * 16;
    const z = -1 - r() * 18;
    // Snow and drips start high (or anywhere, at first); embers and spores low.
    const falling = kind === "snow" || kind === "drips";
    const y = anywhere ? r() * 6 : falling ? 5.5 + r() * 1.5 : r() * 0.5;
    p.set([x, y, z], i * 3);
    const vy = kind === "snow" ? -(0.3 + r() * 0.4) : kind === "drips" ? -(3 + r() * 2) : kind === "embers" ? 0.5 + r() * 0.8 : 0.1 + r() * 0.25;
    v.set([(r() - 0.5) * (kind === "drips" ? 0 : 0.3), vy, (r() - 0.5) * (kind === "drips" ? 0 : 0.2)], i * 3);
  }

  protected updateScenery(dt: number, time: number): void {
    const ps = this.particles;
    if (!ps) return;
    const attr = ps.points.geometry.getAttribute("position") as THREE.BufferAttribute;
    const p = attr.array as Float32Array;
    for (let i = 0; i < p.length / 3; i++) {
      const sway = ps.kind === "spores" || ps.kind === "snow" ? Math.sin(time * 0.8 + i) * 0.15 * dt : 0;
      p[i * 3] = p[i * 3]! + ps.velocity[i * 3]! * dt + sway;
      p[i * 3 + 1] = p[i * 3 + 1]! + ps.velocity[i * 3 + 1]! * dt;
      p[i * 3 + 2] = p[i * 3 + 2]! + ps.velocity[i * 3 + 2]! * dt;
      const y = p[i * 3 + 1]!;
      if (y < 0 || y > 7) this.resetParticle(p, ps.velocity, i, false);
    }
    attr.needsUpdate = true;
  }

  // ------------------------------------------------------------ monsters

  private addMonster(m: StageMonster, i: number): void {
    const rock = i % this.rocks.length;
    const living = this.makeLiving(m);
    living.sprite.position.copy(this.hidePosition(rock));
    // Staggered, so they don't all pop up at once.
    this.monsters.push({ ...living, rock, phase: "hidden", timer: 0.8 + i * 1.3 + this.rng.next() * 1.5, seen: false });
  }

  protected canBeHit(m: Monster): boolean {
    return m.phase !== "hidden" && m.sprite.position.y >= 0.6;
  }

  protected sways(m: Monster): boolean {
    return m.phase === "peeking";
  }

  /** Out of the ball: it jumps back behind a free rock. */
  protected breakFree(m: Monster, from: THREE.Vector3): void {
    m.phase = "hopping";
    m.rock = this.freeRock(m.rock);
    m.hopFrom = from.clone().setY(0.6);
    m.hopTo = this.hidePosition(m.rock);
    m.timer = 0.7;
  }

  /** A ball landed here: monsters that are out and close by jump and duck down. */
  protected ballLanded(at: THREE.Vector3): void {
    for (const m of this.monsters) {
      if (m.phase !== "peeking" && m.phase !== "rising") continue;
      if (Math.hypot(m.sprite.position.x - at.x, m.sprite.position.z - at.z) > 2.2) continue;
      m.startle = 0.45;
      m.timer = Math.min(m.timer, 0.5);
    }
  }

  private hidePosition(rock: number): THREE.Vector3 {
    const r = this.rocks[rock]!;
    return new THREE.Vector3(r.x, HIDDEN_Y, r.z - 0.9);
  }

  /** A rock nobody else is using, if there is one. */
  private freeRock(current: number): number {
    const used = new Set(this.monsters.filter((m) => m.phase !== "caught").map((m) => m.rock));
    const free = this.rocks.map((_, i) => i).filter((i) => i !== current && !used.has(i));
    return free.length ? free[Math.floor(this.rng.next() * free.length)]! : current;
  }

  protected updateMonsters(dt: number, time: number): void {
    const peeking = this.monsters.filter((m) => m.phase === "rising" || m.phase === "peeking").length;
    for (const m of this.monsters) {
      if (m.phase === "caught") continue;
      m.timer -= dt;
      const hide = this.hidePosition(m.rock);
      if (m.phase === "hidden") {
        m.sprite.visible = false;
        if (m.timer <= 0 && peeking < MAX_PEEKING && !this.busy) {
          m.phase = "rising";
          m.timer = 0.4;
          m.sprite.visible = true;
          // Sometimes it peeks round the side instead of over the top.
          const side = this.rng.next() < 0.35 ? (this.rng.next() < 0.5 ? -1 : 1) * 1.1 : 0;
          m.sprite.userData.side = side;
        } else if (m.timer <= 0) {
          m.timer = 0.5;
        }
      } else if (m.phase === "rising") {
        const k = 1 - Math.max(0, m.timer) / 0.4;
        m.sprite.position.set(hide.x + (m.sprite.userData.side as number) * k, HIDDEN_Y + (PEEK_Y - HIDDEN_Y) * k, hide.z);
        if (m.timer <= 0) {
          m.phase = "peeking";
          m.timer = 2.2 + this.rng.next() * 2;
          // Now and then it calls out as it pops up.
          if (this.rng.next() < 0.4) this.cry(m);
          if (!m.seen) {
            m.seen = true;
            this.onSeen?.(m.sprite.userData.speciesId as string);
          }
        }
      } else if (m.phase === "peeking") {
        // A little bob and sway while it looks about.
        m.sprite.position.set(hide.x + (m.sprite.userData.side as number) + Math.sin(time * 2.1 + m.rock) * 0.12, PEEK_Y + Math.sin(time * 4 + m.rock) * 0.07, hide.z);
        if (m.timer <= 0) {
          m.phase = "sinking";
          m.timer = 0.3;
        }
      } else if (m.phase === "sinking") {
        const k = Math.max(0, m.timer) / 0.3;
        m.sprite.position.y = HIDDEN_Y + (PEEK_Y - HIDDEN_Y) * k;
        if (m.timer <= 0) {
          // Now and then it scampers over to another rock, in plain sight.
          const to = this.rng.next() < 0.4 ? this.freeRock(m.rock) : m.rock;
          if (to !== m.rock) {
            m.phase = "hopping";
            m.hopFrom = m.sprite.position.clone().setY(0.6);
            m.rock = to;
            m.hopTo = this.hidePosition(to);
            m.timer = 0.8;
          } else {
            m.phase = "hidden";
            m.timer = 1.2 + this.rng.next() * 2.5;
          }
        }
      } else if (m.phase === "hopping") {
        const k = 1 - Math.max(0, m.timer) / 0.8;
        m.sprite.visible = true;
        m.sprite.position.lerpVectors(m.hopFrom!, m.hopTo!, k);
        m.sprite.position.y = 0.6 + Math.sin(k * Math.PI) * 1.2 + (HIDDEN_Y - 0.6) * k;
        if (m.timer <= 0) {
          m.phase = "hidden";
          m.timer = 1 + this.rng.next() * 2;
        }
      }
      if (m.sprite.visible) this.animateMonster(m, dt, time);
    }
  }
}
