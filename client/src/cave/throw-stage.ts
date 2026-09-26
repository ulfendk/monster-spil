import * as THREE from "three";
import { BALL_START, HIT_RADIUS, ballAt, createRng, hitPrecision, landingTime, type Rng, type Vec3 } from "@shared";
import { KANAGAWA } from "../ui/theme";

/**
 * What every 3D throwing scene shares (three.js, loaded only when one opens): the camera,
 * the slingshot with the temari ball in its pouch (pull back, aim, let go — dots show where it
 * will fly), the ball's flight (the shared, tested physics in
 * shared/src/cave/throw.ts) with a hit test fine enough that a fast ball can't skip through
 * a monster, the catch animation, and monsters that feel alive — they breathe, blink, cry
 * with their mouth open and jump when startled. A scene (the cave, the meadow) adds the
 * scenery and says where its monsters are and how they move.
 *
 * It renders into its own canvas under the Phaser canvas (which draws the buttons and texts
 * on top, and takes the touches), and runs its own animation loop.
 */

export type TexImageSource = HTMLImageElement | HTMLCanvasElement;

export interface StageMonster {
  speciesId: string;
  /** The monster's picture (the same one the rest of the game shows). */
  image: TexImageSource;
  /** The same with its eyes shut and with its mouth open, if it has them (placeholder monsters do). */
  blink?: TexImageSource;
  talk?: TexImageSource;
}

export interface ThrowResult {
  /** Which monster it hit, and how close to the middle (1 = dead centre); undefined for a miss. */
  hit?: { index: number; precision: number };
}

export const MONSTER_SIZE = 1.9;

/** A monster in a throwing scene. `phase` is the scene's own; "caught" is common to all. */
export interface LivingMonster {
  sprite: THREE.Sprite;
  faces: { normal: THREE.Texture; blink?: THREE.Texture; talk?: THREE.Texture };
  /** Seconds until the next blink, and how long the eyes stay shut / the mouth open. */
  nextBlink: number;
  faceTimer: number;
  /** A small per-monster offset, so they don't all breathe in step. */
  wobble: number;
  /** A startled jump in progress (seconds left). */
  startle: number;
  /** How big it's drawn (metres). */
  size: number;
  phase: string;
}

interface Flight {
  v: Vec3;
  t: number;
  end: number;
  resolve: (r: ThrowResult) => void;
}

export abstract class ThrowStage<M extends LivingMonster> {
  protected readonly renderer: THREE.WebGLRenderer;
  protected readonly scene = new THREE.Scene();
  protected readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 80);
  protected ball!: THREE.Mesh;
  /** The slingshot: a wooden fork, its bands (tip → pouch → tip) and the aiming dots. */
  private sling!: THREE.Group;
  /** The two rubber bands, from each tip to the pouch (unit boxes, stretched every frame). */
  private bands: THREE.Mesh[] = [];
  private aimDots: THREE.Mesh[] = [];
  /** How far the pouch is pulled back (world offset from BALL_START), while aiming. */
  private pulled?: THREE.Vector3;
  protected readonly monsters: M[] = [];
  protected readonly rng: Rng;
  private readonly clock = new THREE.Clock();
  private flight?: Flight;
  private frame = 0;
  protected busy = false;
  private readonly effects: Array<(dt: number) => boolean> = [];
  /** Things in the scenery that move with time (glows, water). */
  protected readonly animated: Array<(time: number) => void> = [];
  private time = 0;
  /** A monster cries out (the Phaser scene plays its sound). */
  onCry?: (speciesId: string) => void;

  constructor(canvas: HTMLCanvasElement, seed: number) {
    this.rng = createRng(seed);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera.position.set(0, 1.6, 1.5);
    this.camera.lookAt(0, 1.0, -8);
  }

  /** Call at the end of the scene's constructor, once its scenery and monsters are in. */
  protected start(): void {
    this.ball = this.makeBall();
    this.scene.add(this.ball);
    this.makeSlingshot();
    this.holdBall();
    // The first frame waits for the next animation frame, so a subclass's constructor finishes first.
    this.frame = requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------ what a scene decides

  /** Moves the monsters on by `dt` (then call `animateMonster` for each visible one). */
  protected abstract updateMonsters(dt: number, time: number): void;
  /** Whether the ball can hit this monster right now (it's showing itself). */
  protected abstract canBeHit(m: M): boolean;
  /** A monster burst out of the ball: send it off (it's visible, at the ball, full size). */
  protected abstract breakFree(m: M, from: THREE.Vector3): void;
  /** A ball came down here without hitting anyone. */
  protected ballLanded(_at: THREE.Vector3): void {}
  /** Whether a monster's picture sways as it looks about. */
  protected sways(_m: M): boolean {
    return true;
  }
  /** Moves the scenery on (particles and the like). */
  protected updateScenery(_dt: number, _time: number): void {}

  // ------------------------------------------------------------ what the Phaser scene uses

  /**
   * Fits the picture to the canvas's size; wide screens see a normal view, tall ones a wider
   * angle so the sides stay in. With `band` (pixels from the top of the canvas) the view is
   * framed for that strip — the part of the screen above a battle's buttons — as if the
   * canvas were only that tall, and the rest of the canvas shows what lies around it.
   */
  resize(width: number, height: number, band?: { top: number; bottom: number }): void {
    const bandH = Math.max(1, (band?.bottom ?? height) - (band?.top ?? 0));
    const vfov = (2 * Math.atan(Math.tan((this.sideView * Math.PI) / 360) / (width / bandH)) * 180) / Math.PI;
    const fov = Math.min(95, Math.max(50, vfov));
    this.frameView(width, height, band, fov);
    // On a tall screen the slingshot would float in the middle: move the picture down so it
    // sits near the bottom, where the thumb pulls it (there's sky to spare above).
    const ball = this.project(BALL_START);
    const wanted = height * 0.85;
    if (!band && height > width && ball.y < wanted) this.frameView(width, height, band, fov, { x: 0, y: ball.y - wanted });
  }

  /** How wide (degrees) the view must be at least from side to side: the caves spread out more than the meadow. */
  protected sideView = 70;

  /**
   * Sets the canvas size and the camera: `vfov` degrees of view over the band's height (or
   * the whole canvas's). `shift` moves the picture left and up by that many pixels.
   */
  protected frameView(width: number, height: number, band: { top: number; bottom: number } | undefined, vfov: number, shift = { x: 0, y: 0 }): void {
    this.renderer.setSize(width, height, false);
    const top = band?.top ?? 0;
    const bottom = band?.bottom ?? height;
    const bandH = Math.max(1, bottom - top);
    const deg = Math.PI / 180;
    // The camera's full view is centred on the band; the canvas shows a window of it.
    const centre = (top + bottom) / 2;
    const fullH = 2 * Math.max(centre, height - centre);
    this.camera.aspect = width / fullH;
    this.camera.fov = (2 * Math.atan(Math.tan((vfov / 2) * deg) * (fullH / bandH))) / deg;
    if (band || shift.x || shift.y) this.camera.setViewOffset(width, fullH, shift.x, fullH / 2 - centre + shift.y, width, height);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.canvasSize = { width, height };
  }

  private canvasSize = { width: 1, height: 1 };

  /** Where a point in the scene is on the canvas, in pixels from its top-left corner. */
  project(point: Vec3): { x: number; y: number } {
    const p = new THREE.Vector3(point.x, point.y, point.z).project(this.camera);
    return { x: ((p.x + 1) / 2) * this.canvasSize.width, y: ((1 - p.y) / 2) * this.canvasSize.height };
  }

  /** Monsters not caught yet. */
  get remaining(): number {
    return this.monsters.filter((m) => m.phase !== "caught").length;
  }

  /** Whether the slingshot is loaded and can be pulled (no ball in the air, nothing playing). */
  get ready(): boolean {
    return !this.flight && !this.busy && this.ball.visible;
  }

  /**
   * Aiming: the pouch (and the ball in it) follows the finger — `pull` is how far it's
   * pulled, as a share of the longest pull (x right, y down, screen-wise) — and dots show
   * the first part of the throw `v` it would make. Undefined lets go of it without a throw.
   */
  setPull(pull?: { x: number; y: number }, v?: Vec3): void {
    if (!pull || !this.ready) {
      this.pulled = undefined;
      if (this.ready) this.ball.position.set(BALL_START.x, BALL_START.y, BALL_START.z);
      this.showAim(undefined);
      return;
    }
    // Never further than the longest pull.
    const length = Math.hypot(pull.x, pull.y);
    const k = length > 1 ? 1 / length : 1;
    this.pulled = new THREE.Vector3(pull.x * k * 0.32, -pull.y * k * 0.3, Math.min(1, length) * 0.55);
    this.ball.position.set(BALL_START.x + this.pulled.x, BALL_START.y + this.pulled.y, BALL_START.z + this.pulled.z);
    this.showAim(v);
  }

  /** Throws the ball; resolves when it hits a monster or comes to rest. */
  throwBall(v: Vec3): Promise<ThrowResult> {
    if (this.flight || this.busy) return Promise.resolve({});
    this.pulled = undefined;
    this.showAim(undefined);
    return new Promise((resolve) => {
      this.flight = { v, t: 0, end: landingTime(v), resolve };
    });
  }

  /**
   * After a hit: the monster is drawn into the ball, which drops and wobbles three times,
   * then either glows (caught) or bursts open and the monster gets away (the scene says how).
   */
  async catchAnimation(index: number, success: boolean): Promise<void> {
    const m = this.monsters[index]!;
    this.busy = true;
    const at = this.ball.position.clone();
    const start = m.sprite.position.clone();
    m.phase = "caught"; // stops its own movement while this plays
    await this.tween(0.35, (k) => {
      m.sprite.position.lerpVectors(start, at, k);
      m.sprite.scale.setScalar(m.size * (1 - k));
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
      m.sprite.scale.setScalar(m.size);
      this.breakFree(m, this.ball.position.clone());
    }
    this.holdBall();
    this.busy = false;
  }

  /** No ball in the slingshot any more (the visit or the throw is over). */
  end(): void {
    this.ball.visible = false;
    this.sling.visible = false;
    this.pulled = undefined;
    this.showAim(undefined);
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
    // Let the browser have the WebGL context back now: iPad Safari only allows a few at a time.
    this.renderer.forceContextLoss();
  }

  /** Moves everything on by `dt` seconds and draws. (Public so a test can step it by hand.) */
  tick(dt: number): void {
    this.time += dt;
    this.updateMonsters(dt, this.time);
    this.updateFlight(dt);
    this.updateScenery(dt, this.time);
    for (const a of this.animated) a(this.time);
    this.updateBands();
    for (let i = this.effects.length - 1; i >= 0; i--) if (!this.effects[i]!(dt)) this.effects.splice(i, 1);
    this.renderer.render(this.scene, this.camera);
  }

  // ------------------------------------------------------------ the ball

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

  protected holdBall(): void {
    this.ball.position.set(BALL_START.x, BALL_START.y, BALL_START.z);
    this.ball.rotation.set(0, 0, 0);
    (this.ball.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2;
    this.ball.visible = true;
    this.sling.visible = true;
    this.pulled = undefined;
  }

  // ------------------------------------------------------------ the slingshot

  /** Where the bands are tied on, either side of the ball's resting place. */
  private static readonly TIPS = [new THREE.Vector3(BALL_START.x - 0.22, BALL_START.y + 0.04, BALL_START.z), new THREE.Vector3(BALL_START.x + 0.22, BALL_START.y + 0.04, BALL_START.z)] as const;

  /** A forked branch with a bound grip, two red bands, and the dots that show the aim. */
  private makeSlingshot(): void {
    this.sling = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: KANAGAWA.boatYellow1, roughness: 0.9 });
    const grip = new THREE.MeshStandardMaterial({ color: KANAGAWA.sumiInk5, roughness: 1 });
    const crotch = new THREE.Vector3(BALL_START.x, BALL_START.y - 0.2, BALL_START.z);
    const stick = (from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material) => {
      const length = from.distanceTo(to);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.85, radius, length, 8), material);
      mesh.position.copy(from).lerp(to, 0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      this.sling.add(mesh);
    };
    const [left, right] = ThrowStage.TIPS;
    stick(crotch, left, 0.028, wood);
    stick(crotch, right, 0.028, wood);
    stick(new THREE.Vector3(crotch.x, crotch.y - 0.5, crotch.z + 0.05), crotch, 0.036, wood);
    stick(new THREE.Vector3(crotch.x, crotch.y - 0.42, crotch.z + 0.04), new THREE.Vector3(crotch.x, crotch.y - 0.12, crotch.z + 0.01), 0.042, grip);
    for (const tip of [left, right]) {
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), grip);
      knot.position.copy(tip);
      this.sling.add(knot);
    }
    const rubber = new THREE.MeshStandardMaterial({ color: KANAGAWA.autumnRed, roughness: 0.7 });
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.bands = [left, right].map(() => {
      const band = new THREE.Mesh(box, rubber);
      this.sling.add(band);
      return band;
    });
    this.scene.add(this.sling);

    const dot = new THREE.SphereGeometry(0.045, 8, 6);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: KANAGAWA.fujiWhite, transparent: true, opacity: 0.85, fog: false });
    for (let i = 0; i < 10; i++) {
      const mesh = new THREE.Mesh(dot, dotMaterial);
      mesh.visible = false;
      this.aimDots.push(mesh);
      this.scene.add(mesh);
    }
  }

  /** The bands run from the tips to the pouch: to the back of the ball while it's held, straight across once it's gone. */
  private updateBands(): void {
    const held = this.ball.visible && !this.flight && !this.busy;
    const pouch = held ? this.ball.position.clone().add(new THREE.Vector3(0, 0, 0.12)) : new THREE.Vector3(BALL_START.x, BALL_START.y + 0.04, BALL_START.z);
    const up = new THREE.Vector3(0, 1, 0);
    ThrowStage.TIPS.forEach((tip, i) => {
      const band = this.bands[i]!;
      const along = pouch.clone().sub(tip);
      band.position.copy(tip).addScaledVector(along, 0.5);
      band.scale.set(0.022, Math.max(0.001, along.length()), 0.022);
      band.quaternion.setFromUnitVectors(up, along.normalize());
    });
  }

  /** Dots along the first part of where the ball would fly (fading out), or none. */
  private showAim(v: Vec3 | undefined): void {
    const end = v ? landingTime(v) : 0;
    this.aimDots.forEach((dot, i) => {
      dot.visible = Boolean(v);
      if (!v) return;
      // About the first half of the flight: enough to aim with, not a guarantee.
      const p = ballAt(v, ((i + 1) / this.aimDots.length) * end * 0.55);
      dot.position.set(p.x, p.y, p.z);
      dot.scale.setScalar(1 - i * 0.06);
    });
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
        // A miss: it bumps along the ground and fades, then a new ball is in my hand.
        const at = this.ball.position.clone();
        this.ballLanded(at);
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

  /** Which monster the ball is touching (of those that can be hit), and how centrally. */
  private hitTest(p: Vec3): ThrowResult["hit"] {
    let best: ThrowResult["hit"];
    this.monsters.forEach((m, index) => {
      if (m.phase === "caught" || !m.sprite.visible || !this.canBeHit(m)) return;
      const s = m.sprite.position;
      const precision = hitPrecision(Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z), HIT_RADIUS);
      if (precision !== undefined && (!best || precision > best.precision)) best = { index, precision };
    });
    return best;
  }

  // ------------------------------------------------------------ living monsters

  private texture(image: TexImageSource): THREE.Texture {
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  /** A monster's sprite and faces, added to the scene (hidden until the scene shows it). */
  protected makeLiving(m: StageMonster, size = MONSTER_SIZE): Pick<LivingMonster, "sprite" | "faces" | "nextBlink" | "faceTimer" | "wobble" | "startle" | "size"> {
    const faces = {
      normal: this.texture(m.image),
      ...(m.blink ? { blink: this.texture(m.blink) } : {}),
      ...(m.talk ? { talk: this.texture(m.talk) } : {}),
    };
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: faces.normal, alphaTest: 0.1, fog: true }));
    sprite.scale.setScalar(size);
    sprite.visible = false;
    sprite.userData.speciesId = m.speciesId;
    this.scene.add(sprite);
    return { sprite, faces, nextBlink: 1 + this.rng.next() * 3, faceTimer: 0, wobble: this.rng.next() * Math.PI * 2, startle: 0, size };
  }

  protected setFace(m: M, face: "normal" | "blink" | "talk", seconds = 0): void {
    const map = m.faces[face] ?? m.faces.normal;
    const material = m.sprite.material as THREE.SpriteMaterial;
    if (material.map !== map) {
      material.map = map;
      material.needsUpdate = true;
    }
    m.faceTimer = seconds;
  }

  /** It calls out: mouth open, and the Phaser scene plays its sound. */
  protected cry(m: M): void {
    this.setFace(m, "talk", 0.6);
    this.onCry?.(m.sprite.userData.speciesId as string);
  }

  /**
   * The little things that make a monster look alive while it's out: it breathes (a soft
   * squash and stretch), looks about (a tilt), blinks now and then. A startled one gives a jump.
   */
  protected animateMonster(m: M, dt: number, time: number): void {
    const breath = Math.sin(time * 3 + m.wobble);
    m.sprite.scale.set(m.size * (1 - 0.025 * breath), m.size * (1 + 0.04 * breath), 1);
    const material = m.sprite.material as THREE.SpriteMaterial;
    material.rotation = this.sways(m) ? Math.sin(time * 0.9 + m.wobble) * 0.09 : 0;
    if (m.startle > 0) {
      m.startle = Math.max(0, m.startle - dt);
      m.sprite.position.y += Math.sin((1 - m.startle / 0.45) * Math.PI) * 0.45 * (m.size / MONSTER_SIZE);
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

  // ------------------------------------------------------------ small animation helpers

  protected tween(seconds: number, step: (k: number) => void): Promise<void> {
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

  protected wait(seconds: number): Promise<void> {
    return this.tween(seconds, () => {});
  }

  /** Little bright shards bursting out of a point. */
  protected sparkle(at: THREE.Vector3, colour: number): void {
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

  private loop = (): void => {
    this.frame = requestAnimationFrame(this.loop);
    this.tick(Math.min(0.05, this.clock.getDelta()));
  };
}
