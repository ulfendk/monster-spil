import * as THREE from "three";
import { KANAGAWA } from "../ui/theme";
import { buildScenery } from "./scenery";
import { buildMonsterModel, setMonsterEnvironment, type MonsterModel, type MonsterModelSpec } from "./monster-model";

/**
 * The monster garden in 3D: a sunny garden (cherry trees, bamboo, susuki, drifting petals)
 * where my monsters wander about — stopping, looking round, hopping now and then. Tapping one
 * brings it to the front; caring for it shows (hearts, a hop, an apple, a ball to chase), and
 * evolving it spins it round in a burst of light into its next stage.
 *
 * Monsters the game draws are models (monster-model.ts); a kid's drawing stands as its picture.
 */

export interface GardenMonster {
  id: string;
  /** Its model, if the game draws it (with its variant and stage). */
  spec?: MonsterModelSpec;
  /** Its picture (for a drawing). */
  image?: HTMLImageElement | HTMLCanvasElement;
  /** How big it's drawn (a rare giant or tiny one, a later stage). */
  scale: number;
}

interface Walker {
  data: GardenMonster;
  root: THREE.Group;
  model?: MonsterModel;
  sprite?: THREE.Sprite;
  size: number;
  pos: THREE.Vector3;
  target: THREE.Vector3;
  wait: number;
  hop: number;
  phase: number;
  selected: boolean;
}

/** The part of the garden they wander in. */
const AREA = { x: 5.5, zNear: -3.5, zFar: -11 };
/** Where a selected one comes to stand. */
const FRONT = new THREE.Vector3(0, 0, -4.2);
const BASE_SIZE = 1.5;

export class GardenStage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 90);
  private readonly walkers: Walker[] = [];
  private readonly animated: Array<(t: number) => void> = [];
  private readonly effects: Array<(dt: number) => boolean> = [];
  private readonly clock = new THREE.Clock();
  private readonly raycaster = new THREE.Raycaster();
  private readonly ring: THREE.Mesh;
  private time = 0;
  private frame = 0;
  private size = { width: 1, height: 1 };
  private readonly heart: THREE.Texture;
  private rand = Math.random;

  constructor(canvas: HTMLCanvasElement, monsters: GardenMonster[]) {
    setMonsterEnvironment();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    buildScenery(
      { scene: this.scene, rand: () => this.rand(), animated: this.animated },
      { sky: "springBlue", fog: "springBlue", ground: "springGreen", hills: "autumnGreen", sun: "autumnRed", decor: ["sakura", "susuki", "rocks"], particles: "petals" }
    );
    this.camera.position.set(0, 4.2, 1.8);
    this.camera.lookAt(0, 0.6, -7);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: KANAGAWA.carpYellow, transparent: true, opacity: 0.85 }));
    this.ring.visible = false;
    this.scene.add(this.ring);
    this.heart = this.makeHeart();
    this.setMonsters(monsters);
    this.frame = requestAnimationFrame(this.loop);
  }

  /** The monsters in the garden now (the page showing). */
  setMonsters(monsters: GardenMonster[]): void {
    for (const w of this.walkers) this.drop(w);
    this.walkers.length = 0;
    for (const data of monsters) this.walkers.push(this.makeWalker(data));
  }

  resize(width: number, height: number): void {
    this.size = { width, height };
    this.renderer.setSize(width, height, false);
    const aspect = width / Math.max(1, height);
    this.camera.aspect = aspect;
    // Wide enough to see the whole garden on a phone standing up.
    this.camera.fov = Math.min(80, Math.max(45, (2 * Math.atan(Math.tan((34 * Math.PI) / 180) / aspect) * 180) / Math.PI));
    this.camera.updateProjectionMatrix();
  }

  /** The monster under a point on the canvas. */
  pick(sx: number, sy: number): string | undefined {
    this.raycaster.setFromCamera(new THREE.Vector2((sx / this.size.width) * 2 - 1, 1 - (sy / this.size.height) * 2), this.camera);
    const hit = this.raycaster.intersectObjects(this.walkers.map((w) => w.root), true)[0]?.object;
    let o: THREE.Object3D | null | undefined = hit;
    while (o && !this.walkers.some((w) => w.root === o)) o = o.parent;
    return this.walkers.find((w) => w.root === o)?.data.id;
  }

  /** This one comes to the front (the others wander on); undefined lets it go. */
  select(id: string | undefined): void {
    for (const w of this.walkers) {
      w.selected = w.data.id === id;
      if (w.selected) {
        w.target.copy(FRONT);
        w.wait = 0;
      }
    }
  }

  /** Caring shows: hearts rising and a happy hop — with an apple for feeding, a ball for playing. */
  react(id: string, kind: "pet" | "feed" | "play" | "tired"): void {
    const w = this.walkers.find((x) => x.data.id === id);
    if (!w) return;
    if (kind === "tired") {
      // A sleepy little shake of the head.
      void this.tween(0.6, (k) => (w.root.rotation.z = Math.sin(k * Math.PI * 4) * 0.12 * (1 - k)));
      return;
    }
    w.hop = 0.5;
    for (let i = 0; i < (kind === "feed" ? 7 : 5); i++) this.risingHeart(w, i * 0.12);
    if (kind === "feed") this.drop3d(w, KANAGAWA.autumnRed, 0.16);
    if (kind === "play") {
      // A ball bounces past and it chases it a little way.
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), new THREE.MeshStandardMaterial({ color: KANAGAWA.waveRed }));
      this.scene.add(ball);
      const from = w.pos.clone().add(new THREE.Vector3(-1.4, 0, 0.3));
      const to = w.pos.clone().add(new THREE.Vector3(1.6, 0, -0.2));
      void this.tween(1.1, (k) => ball.position.set(from.x + (to.x - from.x) * k, 0.16 + Math.abs(Math.sin(k * Math.PI * 3)) * 0.6 * (1 - k * 0.5), from.z + (to.z - from.z) * k)).then(() => {
        this.scene.remove(ball);
        ball.geometry.dispose();
      });
      w.target.copy(to).setX(to.x - 0.6);
      w.wait = 0;
    }
  }

  /** Evolving: it spins round in a swirl of light, and comes out as its next stage. */
  async evolve(id: string, next: GardenMonster): Promise<void> {
    const w = this.walkers.find((x) => x.data.id === id);
    if (!w) return;
    const light = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: KANAGAWA.carpYellow, transparent: true, opacity: 0 }));
    light.position.copy(w.pos).setY(w.size * 0.5);
    this.scene.add(light);
    await this.tween(1.4, (k) => {
      w.root.rotation.y += 0.05 + k * 0.5;
      light.scale.setScalar(w.size * (0.4 + k * 0.9));
      (light.material as THREE.MeshBasicMaterial).opacity = k * 0.85;
    });
    // In the flash: the new stage.
    const index = this.walkers.indexOf(w);
    const pos = w.pos.clone();
    this.drop(w);
    const born = this.makeWalker(next);
    born.pos.copy(pos);
    born.target.copy(pos);
    born.selected = true;
    this.walkers[index] = born;
    for (let i = 0; i < 10; i++) this.risingHeart(born, i * 0.05);
    await this.tween(0.8, (k) => {
      (light.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
      light.scale.setScalar(born.size * (1.3 + k * 0.6));
    });
    this.scene.remove(light);
    light.geometry.dispose();
    born.hop = 0.6;
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    for (const w of this.walkers) this.drop(w);
    this.scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.heart.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  // ------------------------------------------------------------ the monsters

  private makeWalker(data: GardenMonster): Walker {
    const root = new THREE.Group();
    const size = BASE_SIZE * data.scale;
    let model: MonsterModel | undefined;
    let sprite: THREE.Sprite | undefined;
    if (data.spec) {
      model = buildMonsterModel(data.spec);
      model.root.scale.setScalar(size);
      root.add(model.root);
    } else if (data.image) {
      const texture = new THREE.Texture(data.image);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, alphaTest: 0.1 }));
      sprite.scale.setScalar(size);
      root.add(sprite);
    }
    const pos = this.randomSpot();
    root.position.copy(pos);
    this.scene.add(root);
    return { data, root, model, sprite, size, pos, target: this.randomSpot(), wait: this.rand() * 2, hop: 0, phase: this.rand() * 6, selected: false };
  }

  private drop(w: Walker): void {
    this.scene.remove(w.root);
    w.model?.dispose();
    if (w.sprite) {
      w.sprite.material.map?.dispose();
      w.sprite.material.dispose();
    }
  }

  private randomSpot(): THREE.Vector3 {
    return new THREE.Vector3((this.rand() * 2 - 1) * AREA.x, 0, AREA.zNear + this.rand() * (AREA.zFar - AREA.zNear));
  }

  private update(dt: number): void {
    for (const w of this.walkers) {
      const to = w.target.clone().sub(w.pos);
      to.y = 0;
      const dist = to.length();
      let walking = false;
      if (w.wait > 0) w.wait -= dt;
      else if (dist > 0.05) {
        // Walks there at its own pace; the selected one hurries.
        const step = Math.min(dist, dt * (w.selected ? 2.4 : 1.1));
        w.pos.addScaledVector(to.normalize(), step);
        walking = true;
      } else if (!w.selected) {
        // Arrived: a little rest, then somewhere else — now and then with a hop.
        w.wait = 1 + this.rand() * 3;
        w.target = this.randomSpot();
        if (this.rand() < 0.3) w.hop = 0.45;
      }
      w.phase += dt * (walking ? 10 : 3);
      const bob = walking ? Math.abs(Math.sin(w.phase)) * 0.12 * w.size * 0.5 : Math.sin(w.phase) * 0.015;
      if (w.hop > 0) w.hop = Math.max(0, w.hop - dt);
      const hop = w.hop > 0 ? Math.sin((w.hop / 0.5) * Math.PI) * 0.5 : 0;
      // Standing on the ground: a model's box is centred on it, a picture's too.
      w.root.position.set(w.pos.x, w.size * 0.5 + bob + hop, w.pos.z);
      // Faces where it walks; standing (or chosen), faces me.
      const face = walking ? Math.atan2(to.x, to.z) : Math.atan2(this.camera.position.x - w.pos.x, this.camera.position.z - w.pos.z);
      const turn = Math.atan2(Math.sin(face - w.root.rotation.y), Math.cos(face - w.root.rotation.y));
      if (w.model) w.root.rotation.y += turn * Math.min(1, dt * 8);
      w.root.rotation.z = walking ? Math.sin(w.phase) * 0.06 : w.root.rotation.z * 0.9;
      w.model?.tick?.(performance.now() / 1000);
      if (w.model && (w.phase * 0.37) % 4 < 0.06) w.model.setFace("blink");
      else w.model?.setFace("normal");
      if (w.selected) {
        this.ring.visible = true;
        this.ring.position.set(w.pos.x, 0.03, w.pos.z);
        this.ring.scale.setScalar(w.size * 0.8);
      }
    }
    if (!this.walkers.some((w) => w.selected)) this.ring.visible = false;
  }

  // ------------------------------------------------------------ little effects

  private makeHeart(): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = `#${KANAGAWA.waveRed.toString(16)}`;
    g.strokeStyle = `#${KANAGAWA.sumiInk0.toString(16).padStart(6, "0")}`;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(32, 54);
    g.bezierCurveTo(6, 36, 6, 12, 22, 12);
    g.bezierCurveTo(28, 12, 32, 18, 32, 22);
    g.bezierCurveTo(32, 18, 36, 12, 42, 12);
    g.bezierCurveTo(58, 12, 58, 36, 32, 54);
    g.fill();
    g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private risingHeart(w: Walker, delay: number): void {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.heart, transparent: true }));
    s.scale.setScalar(0.35);
    const from = w.pos.clone().add(new THREE.Vector3((this.rand() - 0.5) * w.size * 0.6, w.size * 0.9, 0.2));
    s.position.copy(from);
    s.visible = false;
    this.scene.add(s);
    void this.wait(delay)
      .then(() => {
        s.visible = true;
        return this.tween(1.1, (k) => {
          s.position.set(from.x + Math.sin(k * 6) * 0.15, from.y + k * 1.2, from.z);
          s.material.opacity = 1 - k;
        });
      })
      .then(() => {
        this.scene.remove(s);
        s.material.dispose();
      });
  }

  /** Something small dropping in front of it (an apple for feeding). */
  private drop3d(w: Walker, colour: number, r: number): void {
    const apple = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshStandardMaterial({ color: colour }));
    const at = w.pos.clone().add(new THREE.Vector3(0.1, 0, 0.6));
    this.scene.add(apple);
    void this.tween(0.9, (k) => {
      apple.position.set(at.x, r + Math.max(0, 1.4 * (1 - k * 1.6)), at.z);
      apple.scale.setScalar(k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
    }).then(() => {
      this.scene.remove(apple);
      apple.geometry.dispose();
    });
  }

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

  private loop = (): void => {
    this.frame = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    this.update(dt);
    for (const a of this.animated) a(this.time);
    for (let i = this.effects.length - 1; i >= 0; i--) if (!this.effects[i]!(dt)) this.effects.splice(i, 1);
    this.renderer.render(this.scene, this.camera);
  };
}
