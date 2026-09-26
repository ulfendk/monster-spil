import * as THREE from "three";
import { BALL_START, HIT_RADIUS, ballAt, createRng, hitPrecision, landingTime, type CaveLook, type Rng, type Vec3 } from "@shared";
import { KANAGAWA, kanagawaColour } from "../ui/theme";

/**
 * The cave, in 3D (three.js, loaded only when a player goes into a cave). Its look comes
 * from its kind (caves.json: crystals, ice, lava, mushrooms or a pool, with drifting snow,
 * embers, spores or drips), its boulders from the visit's seed; monsters peek out from
 * behind them — breathing, looking about, blinking and crying — and a temari ball waits in
 * your hand. The flight of the ball is the shared, tested physics
 * (shared/src/cave/throw.ts) — this file only draws it and says what it hit.
 *
 * It renders into its own canvas under the Phaser canvas (which draws the buttons and
 * texts on top, and takes the touches), and runs its own animation loop.
 */

export interface StageMonster {
  speciesId: string;
  /** The monster's picture (the same one the rest of the game shows). */
  image: TexImageSource;
  /** The same with its eyes shut and with its mouth open, if it has them (placeholder monsters do). */
  blink?: TexImageSource;
  talk?: TexImageSource;
}

type TexImageSource = HTMLImageElement | HTMLCanvasElement;

export interface ThrowResult {
  /** Which monster it hit, and how close to the middle (1 = dead centre); undefined for a miss. */
  hit?: { index: number; precision: number };
}

const MONSTER_SIZE = 1.9;
/** How high a monster's middle is when it peeks over its rock. */
const PEEK_Y = 1.95;
const HIDDEN_Y = -0.3;
/** At most this many monsters show themselves at once (it's for a 6-year-old). */
const MAX_PEEKING = 2;

type Phase = "hidden" | "rising" | "peeking" | "sinking" | "hopping" | "caught";

interface Monster {
  sprite: THREE.Sprite;
  faces: { normal: THREE.Texture; blink?: THREE.Texture; talk?: THREE.Texture };
  /** Seconds until the next blink, and how long the eyes stay shut / the mouth open. */
  nextBlink: number;
  faceTimer: number;
  /** A small per-monster offset, so they don't all breathe in step. */
  wobble: number;
  /** A startled jump in progress (seconds left). */
  startle: number;
  rock: number;
  phase: Phase;
  /** Seconds left in this phase. */
  timer: number;
  hopFrom?: THREE.Vector3;
  hopTo?: THREE.Vector3;
  /** Set once it has shown itself (the scene marks it as seen). */
  seen: boolean;
}

interface Flight {
  v: Vec3;
  t: number;
  end: number;
  resolve: (r: ThrowResult) => void;
}

export class CaveStage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 80);
  private readonly ball: THREE.Mesh;
  private readonly monsters: Monster[] = [];
  private readonly rng: Rng;
  private readonly clock = new THREE.Clock();
  private flight?: Flight;
  private frame = 0;
  private busy = false;
  private readonly effects: Array<(dt: number) => boolean> = [];
  /** A monster showed itself for the first time. */
  onSeen?: (speciesId: string) => void;
  /** A monster cries out as it peeks (the scene plays its sound). */
  onCry?: (speciesId: string) => void;
  /** Where the boulders stand; monsters hide just behind them. */
  private readonly rocks: Vec3[];
  private particles?: { points: THREE.Points; velocity: Float32Array; kind: CaveLook["particles"] };
  private readonly animated: Array<(time: number) => void> = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    monsters: StageMonster[],
    seed: number,
    private readonly look: CaveLook,
    rocks: Array<{ x: number; z: number }>
  ) {
    this.rng = createRng(seed);
    this.rocks = rocks.map((r) => ({ x: r.x, y: 0, z: r.z }));
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const fog = this.colour(look.fog, KANAGAWA.sumiInk0);
    this.scene.background = new THREE.Color(fog);
    this.scene.fog = new THREE.FogExp2(fog, 0.055);
    this.camera.position.set(0, 1.6, 1.5);
    this.camera.lookAt(0, 1.0, -8);

    this.buildCave();
    this.ball = this.makeBall();
    this.scene.add(this.ball);
    this.holdBall();
    monsters.forEach((m, i) => this.addMonster(m, i));
    this.loop();
  }

  /** Fits the picture to the canvas's size; wide screens see a normal view, tall ones a wider angle so the sides stay in. */
  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    const aspect = width / Math.max(1, height);
    this.camera.aspect = aspect;
    const vfov = (2 * Math.atan(Math.tan((35 * Math.PI) / 180) / aspect) * 180) / Math.PI;
    this.camera.fov = Math.min(95, Math.max(50, vfov));
    this.camera.updateProjectionMatrix();
  }

  /** Monsters still in the cave (not caught). */
  get remaining(): number {
    return this.monsters.filter((m) => m.phase !== "caught").length;
  }

  /** Throws the ball; resolves when it hits a monster or comes to rest. */
  throwBall(v: Vec3): Promise<ThrowResult> {
    if (this.flight || this.busy) return Promise.resolve({});
    return new Promise((resolve) => {
      this.flight = { v, t: 0, end: landingTime(v), resolve };
    });
  }

  /**
   * After a hit: the monster is drawn into the ball, which drops and wobbles three times,
   * then either glows (caught) or bursts open and the monster jumps back behind a rock.
   */
  async catchAnimation(index: number, success: boolean): Promise<void> {
    const m = this.monsters[index]!;
    this.busy = true;
    const at = this.ball.position.clone();
    const start = m.sprite.position.clone();
    m.phase = "caught"; // stops its own movement while this plays
    await this.tween(0.35, (k) => {
      m.sprite.position.lerpVectors(start, at, k);
      m.sprite.scale.setScalar(MONSTER_SIZE * (1 - k));
    });
    m.sprite.visible = false;
    const top = this.ball.position.y;
    await this.tween(0.35, (k) => (this.ball.position.y = top + (0.2 - top) * k * k));
    for (let i = 0; i < 3; i++) {
      await this.tween(0.32, (k) => (this.ball.rotation.z = Math.sin(k * Math.PI * 2) * 0.45));
      await this.wait(0.18);
    }
    if (success) {
      this.sparkle(this.ball.position.clone(), KANAGAWA.carpYellow);
      await this.tween(0.6, (k) => ((this.ball.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2 + k * 1.2));
      await this.wait(0.3);
    } else {
      this.sparkle(this.ball.position.clone(), KANAGAWA.sumiInk6);
      m.sprite.visible = true;
      m.phase = "hopping";
      m.rock = this.freeRock(m.rock);
      m.hopFrom = this.ball.position.clone().setY(0.6);
      m.hopTo = this.hidePosition(m.rock);
      m.timer = 0.7;
      m.sprite.scale.setScalar(MONSTER_SIZE);
    }
    this.holdBall();
    this.busy = false;
  }

  /** The visit is over: no ball in the hand any more. */
  end(): void {
    this.ball.visible = false;
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
        (m as THREE.MeshStandardMaterial).map?.dispose();
        m.dispose();
      }
    });
    this.renderer.dispose();
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

  private updateParticles(dt: number, time: number): void {
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

  /** A temari ball: red, with white and gold thread in bands. */
  private makeBall(): THREE.Mesh {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 128;
    const g = c.getContext("2d")!;
    const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
    g.fillStyle = hex(KANAGAWA.waveRed);
    g.fillRect(0, 0, 256, 128);
    g.lineWidth = 6;
    for (let i = 0; i < 8; i++) {
      g.strokeStyle = hex(i % 2 ? KANAGAWA.carpYellow : KANAGAWA.fujiWhite);
      g.beginPath();
      g.moveTo(i * 32, 0);
      g.lineTo(i * 32 + 32, 64);
      g.lineTo(i * 32, 128);
      g.stroke();
    }
    g.fillStyle = hex(KANAGAWA.fujiWhite);
    g.fillRect(0, 60, 256, 8);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 24, 16),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6, emissive: KANAGAWA.carpYellow, emissiveIntensity: 0.2 })
    );
  }

  private holdBall(): void {
    this.ball.position.set(BALL_START.x, BALL_START.y, BALL_START.z);
    this.ball.rotation.set(0, 0, 0);
    (this.ball.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2;
    this.ball.visible = true;
  }

  // ------------------------------------------------------------ monsters

  private texture(image: TexImageSource): THREE.Texture {
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  private addMonster(m: StageMonster, i: number): void {
    const faces = {
      normal: this.texture(m.image),
      ...(m.blink ? { blink: this.texture(m.blink) } : {}),
      ...(m.talk ? { talk: this.texture(m.talk) } : {}),
    };
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: faces.normal, alphaTest: 0.1, fog: true }));
    sprite.scale.setScalar(MONSTER_SIZE);
    const rock = i % this.rocks.length;
    sprite.position.copy(this.hidePosition(rock));
    sprite.visible = false;
    this.scene.add(sprite);
    this.monsters.push({
      sprite,
      faces,
      nextBlink: 1 + this.rng.next() * 3,
      faceTimer: 0,
      wobble: this.rng.next() * Math.PI * 2,
      startle: 0,
      rock,
      phase: "hidden",
      // Staggered, so they don't all pop up at once.
      timer: 0.8 + i * 1.3 + this.rng.next() * 1.5,
      seen: false,
    });
    sprite.userData.speciesId = m.speciesId;
  }

  private setFace(m: Monster, face: "normal" | "blink" | "talk", seconds = 0): void {
    const map = m.faces[face] ?? m.faces.normal;
    const material = m.sprite.material as THREE.SpriteMaterial;
    if (material.map !== map) {
      material.map = map;
      material.needsUpdate = true;
    }
    m.faceTimer = seconds;
  }

  /**
   * The little things that make a monster look alive while it's out: it breathes (a soft
   * squash and stretch), looks about (a tilt), blinks now and then, and — once it's up —
   * sometimes cries out with its mouth open. A startled one gives a jump.
   */
  private animateMonster(m: Monster, dt: number, time: number): void {
    const breath = Math.sin(time * 3 + m.wobble);
    m.sprite.scale.set(MONSTER_SIZE * (1 - 0.025 * breath), MONSTER_SIZE * (1 + 0.04 * breath), 1);
    const material = m.sprite.material as THREE.SpriteMaterial;
    material.rotation = m.phase === "peeking" ? Math.sin(time * 0.9 + m.wobble) * 0.09 : 0;
    if (m.startle > 0) {
      m.startle = Math.max(0, m.startle - dt);
      m.sprite.position.y += Math.sin((1 - m.startle / 0.45) * Math.PI) * 0.45;
    }
    if (m.faceTimer > 0) {
      m.faceTimer -= dt;
      if (m.faceTimer <= 0) this.setFace(m, "normal");
      return;
    }
    m.nextBlink -= dt;
    if (m.nextBlink <= 0) {
      m.nextBlink = 2 + this.rng.next() * 3.5;
      this.setFace(m, "blink", 0.14);
    }
  }

  /** A ball landed here: monsters that are out and close by jump and duck down. */
  private startleNear(at: THREE.Vector3): void {
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

  private updateMonsters(dt: number, time: number): void {
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
          if (this.rng.next() < 0.4) {
            this.setFace(m, "talk", 0.6);
            this.onCry?.(m.sprite.userData.speciesId as string);
          }
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

  /** Which monster (visible and showing itself) the ball is touching, and how centrally. */
  private hitTest(p: Vec3): ThrowResult["hit"] {
    let best: ThrowResult["hit"];
    this.monsters.forEach((m, index) => {
      if (m.phase === "caught" || m.phase === "hidden" || !m.sprite.visible || m.sprite.position.y < 0.6) return;
      const s = m.sprite.position;
      const precision = hitPrecision(Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z), HIT_RADIUS);
      if (precision !== undefined && (!best || precision > best.precision)) best = { index, precision };
    });
    return best;
  }

  private updateFlight(dt: number): void {
    const f = this.flight;
    if (!f) return;
    // Small steps, so a fast ball can't skip through a monster between two frames.
    const steps = Math.max(1, Math.ceil(dt * 240));
    for (let i = 0; i < steps; i++) {
      f.t = Math.min(f.end, f.t + dt / steps);
      const p = ballAt(f.v, f.t);
      this.ball.position.set(p.x, p.y, p.z);
      this.ball.rotation.x -= (dt / steps) * 14;
      const hit = this.hitTest(p);
      if (hit) {
        this.flight = undefined;
        f.resolve({ hit });
        return;
      }
      if (f.t >= f.end) {
        this.flight = undefined;
        // A miss: it bumps along the floor and fades, then a new ball is in my hand.
        const at = this.ball.position.clone();
        this.startleNear(at);
        this.busy = true;
        void this.tween(0.5, (k) => {
          this.ball.position.set(at.x + f.v.x * 0.08 * k, 0.17 + Math.sin(k * Math.PI) * 0.25, at.z + f.v.z * 0.08 * k);
        }).then(() => {
          this.holdBall();
          this.busy = false;
          f.resolve({});
        });
        return;
      }
    }
  }

  // ------------------------------------------------------------ small animation helpers

  private tween(seconds: number, step: (k: number) => void): Promise<void> {
    return new Promise((resolve) => {
      let t = 0;
      this.effects.push((dt) => {
        t = Math.min(seconds, t + dt);
        step(t / seconds);
        if (t >= seconds) resolve();
        return t < seconds;
      });
    });
  }

  private wait(seconds: number): Promise<void> {
    return this.tween(seconds, () => {});
  }

  /** Little bright shards bursting out of a point. */
  private sparkle(at: THREE.Vector3, colour: number): void {
    const material = new THREE.MeshBasicMaterial({ color: colour, transparent: true });
    const shards = Array.from({ length: 14 }, () => {
      const s = new THREE.Mesh(new THREE.TetrahedronGeometry(0.06), material);
      s.position.copy(at);
      s.userData.v = new THREE.Vector3((this.rng.next() - 0.5) * 3, 1 + this.rng.next() * 2.5, (this.rng.next() - 0.5) * 3);
      this.scene.add(s);
      return s;
    });
    void this.tween(0.9, (k) => {
      for (const s of shards) {
        const v = s.userData.v as THREE.Vector3;
        s.position.set(at.x + v.x * k, at.y + v.y * k - 2.5 * k * k, at.z + v.z * k);
        s.rotation.x += 0.2;
      }
      material.opacity = 1 - k;
    }).then(() => {
      for (const s of shards) {
        this.scene.remove(s);
        s.geometry.dispose();
      }
      material.dispose();
    });
  }

  private time = 0;

  /** Moves everything on by `dt` seconds and draws. (Public so a test can step it by hand.) */
  tick(dt: number): void {
    this.time += dt;
    this.updateMonsters(dt, this.time);
    this.updateFlight(dt);
    this.updateParticles(dt, this.time);
    for (const a of this.animated) a(this.time);
    for (let i = this.effects.length - 1; i >= 0; i--) if (!this.effects[i]!(dt)) this.effects.splice(i, 1);
    this.renderer.render(this.scene, this.camera);
  }

  private loop = (): void => {
    this.frame = requestAnimationFrame(this.loop);
    this.tick(Math.min(0.05, this.clock.getDelta()));
  };
}
