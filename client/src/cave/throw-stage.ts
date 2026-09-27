import * as THREE from "three";
import { BALL_START, HIT_RADIUS, aimToThrow, ballAt, createRng, hitPrecision, landingTime, type Rng, type TypeId, type Vec3 } from "@shared";
import { Lasso } from "./lasso";
import { KANAGAWA } from "../ui/theme";
import { buildMonsterModel, setMonsterEnvironment, type MonsterModel, type MonsterModelSpec } from "./monster-model";

/**
 * What every 3D throwing scene shares (three.js, loaded only when one opens): the camera,
 * the lasso in your hand (lasso.ts: made of the element of the monster aimed at), aiming (a
 * point in the scene under the crosshairs, and dots showing the arc it will fly to it), its
 * flight (the shared, tested physics in shared/src/cave/throw.ts — the same as the old ball's)
 * with a hit test fine enough that a fast throw can't skip through a monster, the catch
 * animation (the lasso pulls tight, the monster struggles, then it's caught or breaks free), and monsters that feel alive — they breathe, blink, cry
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
  /** A rare variant: drawn this much bigger or smaller, and twinkling. */
  scale?: number;
  sparkly?: boolean;
  /** A monster the game draws itself: shown as a 3D model (monster-model.ts) instead of its picture. */
  model?: MonsterModelSpec;
  /** Its type (the lasso thrown at it is of its element); a model's species says it anyway. */
  type?: TypeId;
}

export interface ThrowResult {
  /** Which monster it hit, and how close to the middle (1 = dead centre); undefined for a miss. */
  hit?: { index: number; precision: number };
}

export const MONSTER_SIZE = 1.9;

/** A monster in a throwing scene. `phase` is the scene's own; "caught" is common to all. */
export interface LivingMonster {
  /** The monster in the scene: its picture (a sprite), or its 3D model's root. */
  sprite: THREE.Object3D;
  /** Its 3D model, if it has one (a picture sprite otherwise). */
  model?: MonsterModel;
  /** Where a model turns to look (the camera, unless set: my monster in a battle looks at the wild one). */
  lookAt?: () => THREE.Vector3;
  faces: { normal?: THREE.Texture; blink?: THREE.Texture; talk?: THREE.Texture };
  /** Seconds until the next blink, and how long the eyes stay shut / the mouth open. */
  nextBlink: number;
  faceTimer: number;
  /** A small per-monster offset, so they don't all breathe in step. */
  wobble: number;
  /** A startled jump in progress (seconds left). */
  startle: number;
  /** How big it's drawn (metres). */
  size: number;
  /** A rare variant that twinkles now and then. */
  sparkly?: boolean;
  /** Its type: the lasso thrown at it is made of its element. */
  type?: TypeId;
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
  /** Where the camera stands (resize moves it up on a tall screen; a scene may shake it about this point). */
  protected readonly cameraBase = new THREE.Vector3(0, 1.6, 1.5);
  /** The lasso in the hand (lasso.ts): of the element of the monster aimed at. */
  protected lasso!: Lasso;
  /** Dots along the arc the ball would fly to where the crosshairs point. */
  private aimDots: THREE.Mesh[] = [];
  private readonly raycaster = new THREE.Raycaster();
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
    setMonsterEnvironment(); // daylight (a cave dims it)
    this.rng = createRng(seed);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera.position.copy(this.cameraBase);
    this.camera.lookAt(0, 1.0, -8);
  }

  /** Call at the end of the scene's constructor, once its scenery and monsters are in. */
  protected start(): void {
    this.lasso = new Lasso(new THREE.Vector3(BALL_START.x, BALL_START.y, BALL_START.z));
    this.lasso.setType(this.defaultType());
    this.scene.add(this.lasso.root);
    this.makeAimDots();
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
    // A tall screen looks down from higher up and a little further forward, over the
    // ball in the hand: the horizon moves up, the ball sits near the bottom, and the ground —
    // where the monsters are — fills more of the screen than the sky.
    const tall = !band && height > width;
    // How tall: 0 for a square screen (or wider), 1 for a phone standing up — an iPad standing
    // up is in between, and gets a camera in between.
    const t = tall ? Math.min(1, Math.max(0, (height / width - 1) / 1.1)) : 0;
    this.cameraBase.set(0, 1.6 + 1.6 * t, 1.5 - 0.7 * t);
    this.camera.position.copy(this.cameraBase);
    this.camera.lookAt(0, 1.0 - 1.6 * t, -8);
    this.camera.updateMatrixWorld();
    const bandH = Math.max(1, (band?.bottom ?? height) - (band?.top ?? 0));
    const vfov = (2 * Math.atan(Math.tan((this.sideView * Math.PI) / 360) / (width / bandH)) * 180) / Math.PI;
    const fov = Math.min(95, Math.max(50, vfov));
    this.frameView(width, height, band, fov);
    // The ball in the hand sits near the bottom on every screen: on a
    // tall one the picture moves up or down until it's there (a phone is taller than an iPad
    // standing up, so the same camera puts it higher on one and off the bottom of the other);
    // on a wide one only if it would be cut off.
    const ball = this.project(BALL_START);
    const wanted = height * 0.86;
    const off = tall ? Math.abs(ball.y - wanted) > 1 : ball.y > height * 0.88;
    if (!band && off) this.frameView(width, height, band, fov, { x: 0, y: ball.y - wanted });
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

  /** Whether a ball is ready to throw (none in the air, nothing playing). */
  get ready(): boolean {
    return !this.flight && !this.busy && this.lasso.visible;
  }

  /**
   * The point in the scene under the crosshairs (canvas pixels): a monster there (one that
   * can be hit right now), else the ground, else — aimed at the sky — somewhere far off.
   */
  private pointAt(sx: number, sy: number): THREE.Vector3 {
    const ndc = new THREE.Vector2((sx / this.canvasSize.width) * 2 - 1, 1 - (sy / this.canvasSize.height) * 2);
    this.raycaster.setFromCamera(ndc, this.camera);
    const targets = this.monsters.filter((m) => m.phase !== "caught" && m.sprite.visible && this.canBeHit(m)).map((m) => m.sprite);
    const hit = this.raycaster.intersectObjects(targets, true)[0];
    if (hit) return hit.point;
    const ray = this.raycaster.ray;
    const ground = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    if (ground && ground.distanceTo(this.camera.position) < 30) return ground;
    // Aimed at the sky: far off, but not high up (the ball would take ages to come down).
    const far = ray.at(20, new THREE.Vector3());
    far.y = Math.min(far.y, 2.5);
    return far;
  }

  /** Aiming: dots show the arc the ball would fly to the point under the crosshairs; undefined hides them. */
  aimAt(sx?: number, sy?: number): void {
    if (sx === undefined || sy === undefined || !this.ready) return this.showAim(undefined);
    const point = this.pointAt(sx, sy);
    // The lasso in the hand turns to the element of what's aimed at.
    this.lasso.setType(this.typeNear(point));
    this.showAim(aimToThrow(point).v);
  }

  /** The trigger: the lasso flies to the point under the crosshairs. */
  throwAt(sx: number, sy: number): Promise<ThrowResult> {
    const point = this.pointAt(sx, sy);
    if (this.ready) this.lasso.setType(this.typeNear(point));
    return this.throwBall(aimToThrow(point).v);
  }

  /** The element for a throw at `point`: the type of the monster nearest it (of those out), else the scene's. */
  private typeNear(point: THREE.Vector3): TypeId {
    let best: { type: TypeId; d: number } | undefined;
    for (const m of this.monsters) {
      if (m.phase === "caught" || !m.sprite.visible || !m.type || !this.canBeHit(m)) continue;
      const d = m.sprite.position.distanceTo(point);
      if (!best || d < best.d) best = { type: m.type, d };
    }
    return best?.type ?? this.defaultType();
  }

  /** The lasso's element when nobody's aimed at: the first monster's (a meadow has only one). */
  private defaultType(): TypeId {
    return this.monsters.find((m) => m.type && m.phase !== "caught")?.type ?? this.monsters.find((m) => m.type)?.type ?? "sten";
  }

  /** Throws the ball; resolves when it hits a monster or comes to rest. */
  throwBall(v: Vec3): Promise<ThrowResult> {
    if (this.flight || this.busy) return Promise.resolve({});
    this.showAim(undefined);
    return new Promise((resolve) => {
      this.flight = { v, t: 0, end: landingTime(v), resolve };
    });
  }

  /**
   * After a hit: the lasso drops over the monster and pulls tight; the monster struggles three
   * times, then either the lasso glows and the monster shrinks away into it (caught) or the
   * lasso bursts apart and the monster breaks free (the scene says how it gets away).
   */
  async catchAnimation(index: number, success: boolean): Promise<void> {
    const m = this.monsters[index]!;
    this.busy = true;
    m.phase = "caught"; // stops its own movement while this plays
    if (m.type) this.lasso.setType(m.type);
    const centre = m.sprite.position.clone();
    const from = this.lasso.position.clone();
    const fit = m.size * 0.3;
    // Over it from above, then down round its middle, pulling tight.
    await this.tween(0.3, (k) => this.lasso.wrap(from.clone().lerp(centre.clone().add(new THREE.Vector3(0, m.size * 0.45, 0)), k), 0.58 + (fit * 1.4 - 0.58) * k));
    await this.tween(0.22, (k) => this.lasso.wrap(centre.clone().add(new THREE.Vector3(0, m.size * 0.45 * (1 - k), 0)), fit * (1.4 - 0.4 * k * k)));
    this.lasso.pulse();
    // Three struggles: it wriggles and hops against the lasso; the lasso flashes as it holds.
    const size = m.size;
    for (let i = 0; i < 3; i++) {
      await this.tween(0.34, (k) => {
        const s = Math.sin(k * Math.PI * 2);
        m.sprite.rotation.z = s * 0.28;
        m.sprite.position.set(centre.x + s * 0.08, centre.y + Math.abs(Math.sin(k * Math.PI)) * 0.12, centre.z);
        m.sprite.scale.set(size * (1 + Math.abs(s) * 0.06), size * (1 - Math.abs(s) * 0.05), m.model ? size : 1);
        this.lasso.wrap(m.sprite.position, fit * (1 + Math.abs(s) * 0.08));
      });
      this.lasso.pulse();
      await this.wait(0.14);
    }
    m.sprite.rotation.z = 0;
    m.sprite.position.copy(centre);
    if (success) {
      // Caught: the lasso blazes up in its element and the monster shrinks away into it.
      this.sparkle(centre.clone(), KANAGAWA.carpYellow);
      await this.tween(0.6, (k) => {
        this.lasso.glow(k);
        m.sprite.scale.setScalar(size * (1 - k * k));
        if (!m.model) (m.sprite as THREE.Sprite).scale.z = 1;
        this.lasso.wrap(centre, fit * (1 - 0.7 * k));
      });
      m.sprite.visible = false;
      this.lasso.burst(false);
      this.lasso.hideLoop();
      await this.wait(0.35);
    } else {
      // It breaks free: the lasso bursts apart.
      this.lasso.burst(true);
      this.lasso.hideLoop();
      m.sprite.scale.set(size, size, m.model ? size : 1);
      this.breakFree(m, centre);
      await this.wait(0.25);
    }
    this.holdBall();
    this.busy = false;
  }

  /** A new lasso in the hand (trying again). */
  readyBall(): void {
    if (!this.flight && !this.busy) this.holdBall();
  }

  /** No ball in the hand any more (the visit or the throw is over). */
  end(): void {
    this.lasso.visible = false;
    this.showAim(undefined);
  }

  destroy(): void {
    setMonsterEnvironment(); // back to daylight for the map
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
    this.lasso.update(dt, this.time);
    this.updateScenery(dt, this.time);
    for (const a of this.animated) a(this.time);
    for (let i = this.effects.length - 1; i >= 0; i--) if (!this.effects[i]!(dt)) this.effects.splice(i, 1);
    this.renderer.render(this.scene, this.camera);
  }

  // ------------------------------------------------------------ the ball

  /** The lasso back in the hand, twirling, of the element of what's out now. */
  protected holdBall(): void {
    this.lasso.setType(this.defaultType());
    this.lasso.hold();
  }

  // ------------------------------------------------------------ aiming

  /** The dots that show the arc of the throw while aiming. */
  private makeAimDots(): void {
    const dot = new THREE.SphereGeometry(0.045, 8, 6);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: KANAGAWA.fujiWhite, transparent: true, opacity: 0.85, fog: false });
    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(dot, dotMaterial);
      mesh.visible = false;
      this.aimDots.push(mesh);
      this.scene.add(mesh);
    }
  }

  /** Dots along where the ball would fly (fading towards the end), or none. */
  private showAim(v: Vec3 | undefined): void {
    const end = v ? landingTime(v) : 0;
    this.aimDots.forEach((dot, i) => {
      dot.visible = Boolean(v);
      if (!v) return;
      // Most of the arc, stopping short of the target (the crosshairs show that).
      const p = ballAt(v, ((i + 1) / (this.aimDots.length + 2)) * end * 0.8);
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
      this.lasso.fly(new THREE.Vector3(p.x, p.y, p.z), f.t / Math.max(0.01, f.end));
      const hit = this.hitTest(p);
      if (hit) {
        this.flight = undefined;
        f.resolve({ hit });
        return;
      }
      if (f.t >= f.end) {
        this.flight = undefined;
        // A miss: it lands on the ground, lies there a moment, and is pulled back to my hand.
        const at = this.lasso.position.clone().setY(0.05);
        this.ballLanded(at);
        this.busy = true;
        const hand = new THREE.Vector3(BALL_START.x, BALL_START.y, BALL_START.z);
        void this.tween(0.25, () => this.lasso.lie(at))
          .then(() => this.tween(0.45, (k) => this.lasso.lie(at.clone().lerp(hand, k * k).setY(0.05 + (hand.y - 0.05) * k * k * k))))
          .then(() => {
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

  /** A monster — its 3D model, or its picture as a sprite with its faces — added to the scene (hidden until the scene shows it). */
  protected makeLiving(m: StageMonster, baseSize = MONSTER_SIZE): Pick<LivingMonster, "sprite" | "model" | "faces" | "nextBlink" | "faceTimer" | "wobble" | "startle" | "size" | "sparkly" | "type"> {
    const size = baseSize * (m.scale ?? 1);
    const type = m.type ?? m.model?.species.type;
    const common = { nextBlink: 1 + this.rng.next() * 3, faceTimer: 0, wobble: this.rng.next() * Math.PI * 2, startle: 0, size, sparkly: m.sparkly, ...(type ? { type } : {}) };
    if (m.model) {
      const model = buildMonsterModel(m.model);
      model.root.scale.setScalar(size);
      model.root.visible = false;
      model.root.userData.speciesId = m.speciesId;
      this.scene.add(model.root);
      return { sprite: model.root, model, faces: {}, ...common };
    }
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
    return { sprite, faces, ...common };
  }

  protected setFace(m: M, face: "normal" | "blink" | "talk", seconds = 0): void {
    m.faceTimer = seconds;
    if (m.model) return m.model.setFace(face);
    const map = m.faces[face] ?? m.faces.normal;
    const material = (m.sprite as THREE.Sprite).material;
    if (map && material.map !== map) {
      material.map = map;
      material.needsUpdate = true;
    }
  }

  /** Fades a monster (a picture or a model). */
  protected setOpacity(m: M, opacity: number): void {
    if (m.model) return m.model.setOpacity(opacity);
    const material = (m.sprite as THREE.Sprite).material;
    material.transparent = true;
    material.opacity = opacity;
  }

  /** Tilts a monster to the side (radians): looking about, wobbling. */
  protected setTilt(m: M, angle: number): void {
    if (m.model) m.sprite.rotation.z = angle;
    else (m.sprite as THREE.Sprite).material.rotation = angle;
  }

  /** A flash of colour on a monster (a hit), or null to stop. */
  protected setTint(m: M, colour: number | null): void {
    if (m.model) return m.model.setTint(colour);
    (m.sprite as THREE.Sprite).material.color.set(colour ?? 0xffffff);
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
    m.sprite.scale.set(m.size * (1 - 0.025 * breath), m.size * (1 + 0.04 * breath), m.model ? m.size * (1 - 0.025 * breath) : 1);
    this.setTilt(m, this.sways(m) ? Math.sin(time * 0.9 + m.wobble) * 0.09 : 0);
    m.model?.tick?.(time);
    if (m.model) {
      // A model turns to look at the camera (or at what it's facing), turning its head about a little.
      const target = m.lookAt?.() ?? this.camera.position;
      const p = m.sprite.position;
      m.sprite.rotation.y = Math.atan2(target.x - p.x, target.z - p.z) + (this.sways(m) ? Math.sin(time * 0.7 + m.wobble) * 0.25 : 0);
    }
    // A rare, twinkling one: a little glint now and then.
    if (m.sparkly && m.sprite.visible && this.rng.next() < dt * 1.2) {
      const p = m.sprite.position;
      this.sparkle(new THREE.Vector3(p.x + (this.rng.next() - 0.5) * m.size * 0.8, p.y + (this.rng.next() - 0.3) * m.size * 0.6, p.z + 0.05), KANAGAWA.carpYellow, 5, 0.5);
    }
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

  /** Little bright shards bursting out of a point (`spread` < 1 for a small glint). */
  protected sparkle(at: THREE.Vector3, colour: number, count = 14, spread = 1): void {
    const material = new THREE.MeshBasicMaterial({ color: colour, transparent: true });
    const shards = Array.from({ length: count }, () => {
      const s = new THREE.Mesh(new THREE.TetrahedronGeometry(0.06 * Math.max(0.6, spread)), material);
      s.position.copy(at);
      s.userData.v = new THREE.Vector3((this.rng.next() - 0.5) * 3 * spread, (1 + this.rng.next() * 2.5) * spread, (this.rng.next() - 0.5) * 3 * spread);
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
