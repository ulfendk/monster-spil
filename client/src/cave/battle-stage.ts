import * as THREE from "three";
import type { TypeId } from "@shared";
import { KANAGAWA } from "../ui/theme";
import { MeadowStage, STAND_Y, type MeadowMonster } from "./meadow-stage";
import type { LivingMonster, StageMonster } from "./throw-stage";

/**
 * A wild battle in 3D, in the catching meadow: the wild monster stands in the grass and mine
 * (seen from behind) stands close in front, and every move plays out between them — fire,
 * water, leaves, lightning or rocks fly by the move's type, a claw or a bite dashes in, the
 * one hit flashes and shakes, one who faints sinks into the grass. Catching happens in the
 * same meadow: my monster steps aside, the slingshot comes up (ThrowStage), and afterwards
 * the battle picks up again.
 *
 * BattleScene (Phaser, on top) decides everything and tells this what to show.
 */

export type Side = "mine" | "wild";
/** How a move went, for the picture: a hit (strong/weak by type), or a miss. */
export type Impact = "hit" | "strong" | "weak" | "miss";

/** How big my monster is drawn (it stands close in front, to the left). */
const MINE_SIZE = 1.4;
/** Where the two stand on a wide screen, and on a tall one (closer together, so they can be bigger). */
const SPOTS = {
  wide: { mine: new THREE.Vector3(-1.35, 0.7, -2.6), wild: new THREE.Vector3(1.3, STAND_Y, -7) },
  tall: { mine: new THREE.Vector3(-0.75, 0.7, -2.4), wild: new THREE.Vector3(0.7, STAND_Y, -7.5) },
};

/** Where the camera looks during the battle (a little lower than when catching, so both monsters fit) and when catching. */
const BATTLE_LOOK = new THREE.Vector3(0.1, 0.35, -8);
const CATCH_LOOK = new THREE.Vector3(0, 1, -8);

/** Each type's colours: the missile, and its sparks. */
const TYPE_FX: Record<TypeId, { main: number; spark: number }> = {
  ild: { main: KANAGAWA.surimiOrange, spark: KANAGAWA.autumnRed },
  vand: { main: KANAGAWA.crystalBlue, spark: KANAGAWA.springBlue },
  graes: { main: KANAGAWA.springGreen, spark: KANAGAWA.autumnGreen },
  lyn: { main: KANAGAWA.carpYellow, spark: KANAGAWA.fujiWhite },
  sten: { main: KANAGAWA.boatYellow2, spark: KANAGAWA.katanaGray },
};

export class BattleStage extends MeadowStage {
  private readonly mine: MeadowMonster;
  private readonly mineSpot = SPOTS.wide.mine.clone();
  /** Monsters fainting: they're left alone by the breathing and swaying. */
  private readonly fainting = new Set<LivingMonster>();
  private readonly cameraHome = new THREE.Vector3(0, 1.6, 1.5);
  private shake = 0;

  constructor(canvas: HTMLCanvasElement, wild: StageMonster, mine: StageMonster, seed: number) {
    super(canvas, wild, seed, true);
    const living = this.makeLiving(mine, MINE_SIZE);
    living.sprite.visible = true;
    living.sprite.position.copy(this.mineSpot);
    this.mine = { ...living, phase: "battle", timer: 0, nextAct: Infinity, home: this.mineSpot.clone(), offset: new THREE.Vector3() };
    this.end(); // no slingshot until someone wants to catch
  }

  // ------------------------------------------------------------ what BattleScene uses

  /**
   * In the battle (`band`: the strip above the battle's message and buttons), the camera
   * takes the narrowest view that fits both monsters in it, and centres them there —
   * whatever shape the screen is. Catching (no band) uses the usual view.
   */
  resize(width: number, height: number, band?: { top: number; bottom: number; margin?: number }): void {
    if (!band) {
      this.camera.lookAt(CATCH_LOOK);
      super.resize(width, height);
      return;
    }
    this.camera.position.copy(this.cameraHome);
    this.camera.lookAt(BATTLE_LOOK);
    const spots = width < (band.bottom - band.top) * 1.1 ? SPOTS.tall : SPOTS.wide;
    this.mineSpot.copy(spots.mine);
    this.battleSpot.copy(spots.wild);
    const margin = band.margin ?? 12;
    const corners: THREE.Vector3[] = [];
    for (const [spot, size] of [[this.mineSpot, MINE_SIZE], [this.battleSpot, this.wild.size]] as const) {
      for (const dx of [-0.4, 0.4]) for (const dy of [-0.5, 0.5]) corners.push(new THREE.Vector3(spot.x + dx * size, spot.y + dy * size, spot.z));
    }
    const bandH = band.bottom - band.top;
    for (let vfov = 16; vfov <= 110; vfov += 1) {
      this.frameView(width, height, band, vfov);
      const points = corners.map((c) => this.project(c));
      const [left, right] = [Math.min(...points.map((p) => p.x)), Math.max(...points.map((p) => p.x))];
      const [top, bottom] = [Math.min(...points.map((p) => p.y)), Math.max(...points.map((p) => p.y))];
      if ((right - left <= width - 2 * margin && bottom - top <= bandH) || vfov >= 110) {
        // Centred in the band (a touch low: the ground under their feet reads better than sky).
        this.frameView(width, height, band, vfov, {
          x: (left + right) / 2 - width / 2,
          y: (top + bottom) / 2 - (band.top + band.bottom) / 2 - (bandH - (bottom - top)) * 0.15,
        });
        return;
      }
    }
  }

  /** Where the top of a monster is on the canvas (where it stands, not where an attack took it). */
  topOf(side: Side): { x: number; y: number } {
    const spot = side === "mine" ? this.mineSpot : this.battleSpot;
    const size = side === "mine" ? MINE_SIZE : this.wild.size;
    return this.project({ x: spot.x, y: spot.y + size / 2, z: spot.z });
  }

  /** Where the bottom of my monster is on the canvas. */
  feetOfMine(): { x: number; y: number } {
    return this.project({ x: this.mineSpot.x, y: this.mineSpot.y - MINE_SIZE / 2, z: this.mineSpot.z });
  }

  /** Catching: my monster steps aside, the wild one starts shifting about, the slingshot comes up. */
  async beginCatch(): Promise<void> {
    const from = this.mine.offset.clone();
    await this.tween(0.35, (k) => this.mine.offset.lerpVectors(from, new THREE.Vector3(-2.6, 0, 1.2), k * k));
    this.mine.sprite.visible = false;
    this.startSwaying();
    this.holdBall();
  }

  /** Back to the battle: the slingshot goes, the wild one (if it's still here) goes back to its spot, mine comes back. */
  async endCatch(): Promise<void> {
    this.end();
    this.stopSwaying();
    this.mine.sprite.visible = true;
    const from = this.mine.offset.clone();
    await this.tween(0.35, (k) => this.mine.offset.lerpVectors(from, new THREE.Vector3(), 1 - (1 - k) * (1 - k)));
  }

  /**
   * One move, from `side` at the other: the attacker lunges (or, for a close-up move like a
   * claw or a bite, dashes all the way in), the move's missile flies, and on arrival
   * `onImpact` is called (the scene updates the health bar and plays the sound). A miss flies
   * past and the target jumps aside.
   */
  async attack(side: Side, type: TypeId, impact: Impact, close: boolean, onImpact?: () => void): Promise<void> {
    const attacker = this.monsterOn(side);
    const target = this.monsterOn(side === "mine" ? "wild" : "mine");
    const from = attacker.sprite.position.clone();
    const to = target.sprite.position.clone();
    const towards = to.clone().sub(from);
    const miss = impact === "miss";
    // A miss goes by on the side away from the middle of the screen.
    const aside = new THREE.Vector3(side === "mine" ? 1.3 : -1.1, 0.4, 0);

    if (close) {
      const reach = towards.clone().multiplyScalar(0.82).add(miss ? aside : new THREE.Vector3());
      await this.tween(0.24, (k) => attacker.offset.copy(reach).multiplyScalar(k * k));
      if (miss) target.startle = 0.45;
      else this.hit(target, to, type, impact, true);
      onImpact?.();
      await this.tween(0.3, (k) => attacker.offset.copy(reach).multiplyScalar(1 - k));
      attacker.offset.set(0, 0, 0);
      return;
    }

    // A little lunge while the missile goes.
    void this.tween(0.36, (k) => attacker.offset.copy(towards).multiplyScalar(0.07 * Math.sin(k * Math.PI)));
    const end = miss ? to.clone().add(aside).add(towards.clone().multiplyScalar(0.25)) : to;
    if (miss) void this.wait(0.3).then(() => (target.startle = 0.45));
    await this.missile(type, from, end, side === "wild");
    if (!miss) this.hit(target, to, type, impact, false);
    onImpact?.();
    await this.wait(impact === "strong" ? 0.45 : 0.3);
  }

  /** A monster faints: it wobbles and sinks into the grass. */
  async faint(side: Side): Promise<void> {
    const m = this.monsterOn(side);
    const material = m.sprite.material as THREE.SpriteMaterial;
    material.transparent = true;
    this.fainting.add(m);
    await this.tween(0.3, (k) => (material.rotation = Math.sin(k * Math.PI * 3) * 0.3));
    await this.tween(0.6, (k) => {
      m.offset.y = -m.size * 1.05 * k * k;
      material.opacity = 1 - k * 0.8;
    });
    m.sprite.visible = false;
  }

  /** Running away: my monster turns tail and hops off to the side. */
  async flee(): Promise<void> {
    await this.tween(0.5, (k) => this.mine.offset.set(-3.2 * k, Math.abs(Math.sin(k * Math.PI * 3)) * 0.35, 0.6 * k));
    this.mine.sprite.visible = false;
  }

  // ------------------------------------------------------------ the monsters

  private monsterOn(side: Side): MeadowMonster {
    return side === "mine" ? this.mine : this.wild;
  }

  protected updateMonsters(dt: number, time: number): void {
    super.updateMonsters(dt, time);
    const m = this.mine;
    m.sprite.position.copy(this.mineSpot).add(m.offset);
    this.animateMonster(m, dt, time);
    // A strong hit shakes the camera for a moment.
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const a = this.shake * 0.25;
      this.camera.position.set(this.cameraHome.x + (this.rng.next() - 0.5) * a, this.cameraHome.y + (this.rng.next() - 0.5) * a, this.cameraHome.z);
    } else if (!this.camera.position.equals(this.cameraHome)) {
      this.camera.position.copy(this.cameraHome);
    }
  }

  protected sways(m: MeadowMonster): boolean {
    return m !== this.mine;
  }

  protected animateMonster(m: MeadowMonster, dt: number, time: number): void {
    if (!this.fainting.has(m)) super.animateMonster(m, dt, time);
  }

  /** The target is hit: a burst in the move's colours, it flashes and shakes. Bigger for a strong hit. */
  private hit(target: MeadowMonster, at: THREE.Vector3, type: TypeId, impact: Impact, close: boolean): void {
    const fx = TYPE_FX[type];
    this.sparkle(at, close ? KANAGAWA.fujiWhite : fx.spark);
    if (impact !== "weak") this.sparkle(at, fx.main);
    if (impact === "strong") this.shake = 0.35;
    const material = target.sprite.material as THREE.SpriteMaterial;
    const base = target.offset.x;
    void this.tween(0.45, (k) => {
      // Three quick red-white flashes while it's knocked back and forth.
      const flash = Math.floor(k * 6) % 2 === 0 && k < 0.9;
      material.color.set(flash ? KANAGAWA.peachRed : 0xffffff);
      target.offset.x = base + Math.sin(k * Math.PI * 6) * 0.12 * (1 - k) * (impact === "strong" ? 2 : 1);
    }).then(() => {
      material.color.set(0xffffff);
      target.offset.x = base;
    });
  }

  // ------------------------------------------------------------ what flies

  /** The move's missile, from one monster to the other (or past it). */
  private missile(type: TypeId, from: THREE.Vector3, to: THREE.Vector3, towardsCamera: boolean): Promise<void> {
    const fx = TYPE_FX[type];
    // Coming at the camera, things start a little in front of the wild monster, so they don't pop out of its middle.
    const start = from.clone().add(new THREE.Vector3(0, 0.1, towardsCamera ? 0.3 : -0.2));
    switch (type) {
      case "ild":
        return this.fireball(start, to, fx);
      case "vand":
        return this.stream(start, to, fx);
      case "graes":
        return this.leaves(start, to, fx);
      case "lyn":
        return this.lightning(to, fx);
      case "sten":
        return this.rocks(start, to, fx);
    }
  }

  /** Something that lives for a while and is then removed and disposed of. */
  private temporary<T extends THREE.Object3D>(object: T): T {
    this.scene.add(object);
    return object;
  }

  private dispose(object: THREE.Object3D): void {
    this.scene.remove(object);
    object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | undefined;
      mat?.dispose();
    });
  }

  /** A point along a gentle arc between two points. */
  private arc(from: THREE.Vector3, to: THREE.Vector3, k: number, height: number): THREE.Vector3 {
    return from.clone().lerp(to, k).add(new THREE.Vector3(0, Math.sin(k * Math.PI) * height, 0));
  }

  /** Fire: a glowing ball trailing embers. */
  private async fireball(from: THREE.Vector3, to: THREE.Vector3, fx: { main: number; spark: number }): Promise<void> {
    const ball = this.temporary(new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), new THREE.MeshBasicMaterial({ color: fx.main })));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), new THREE.MeshBasicMaterial({ color: fx.spark, transparent: true, opacity: 0.45 }));
    ball.add(glow);
    let emberAt = 0;
    await this.tween(0.5, (k) => {
      ball.position.copy(this.arc(from, to, k, 0.5));
      glow.scale.setScalar(1 + Math.sin(k * 30) * 0.12);
      if (k - emberAt > 0.06) {
        emberAt = k;
        this.ember(ball.position.clone(), k < 0.5 ? fx.main : fx.spark);
      }
    });
    this.dispose(ball);
  }

  /** A little spark left behind that floats up and fades. */
  private ember(at: THREE.Vector3, colour: number): void {
    const material = new THREE.MeshBasicMaterial({ color: colour, transparent: true });
    const spark = this.temporary(new THREE.Mesh(new THREE.TetrahedronGeometry(0.07), material));
    spark.position.copy(at);
    void this.tween(0.4, (k) => {
      spark.position.y = at.y + k * 0.4;
      spark.rotation.z += 0.3;
      material.opacity = 1 - k;
    }).then(() => this.dispose(spark));
  }

  /** Water: a string of droplets arcing over, one after another. */
  private async stream(from: THREE.Vector3, to: THREE.Vector3, fx: { main: number; spark: number }): Promise<void> {
    const drops = Array.from({ length: 8 }, (_, i) => {
      const drop = this.temporary(new THREE.Mesh(new THREE.SphereGeometry(0.11 - i * 0.006, 10, 8), new THREE.MeshBasicMaterial({ color: i % 2 ? fx.spark : fx.main })));
      drop.visible = false;
      drop.scale.y = 1.3;
      return drop;
    });
    await this.tween(0.75, (k) => {
      drops.forEach((drop, i) => {
        const t = (k - i * 0.05) / 0.6;
        drop.visible = t > 0 && t < 1;
        if (drop.visible) drop.position.copy(this.arc(from, to, t, 0.9));
      });
    });
    for (const drop of drops) this.dispose(drop);
  }

  /** Grass: leaves whirling round each other on their way over. */
  private async leaves(from: THREE.Vector3, to: THREE.Vector3, fx: { main: number; spark: number }): Promise<void> {
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.14);
    shape.quadraticCurveTo(0.11, 0, 0, 0.14);
    shape.quadraticCurveTo(-0.11, 0, 0, -0.14);
    const leaves = Array.from({ length: 6 }, (_, i) =>
      this.temporary(new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: i % 2 ? fx.spark : fx.main, side: THREE.DoubleSide })))
    );
    await this.tween(0.6, (k) => {
      leaves.forEach((leaf, i) => {
        const angle = k * Math.PI * 4 + (i / leaves.length) * Math.PI * 2;
        const r = 0.35 * (1 - k * 0.6);
        leaf.position.copy(this.arc(from, to, k, 0.3)).add(new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle) * r, 0));
        leaf.rotation.set(angle, angle * 0.7, angle * 1.3);
      });
    });
    for (const leaf of leaves) this.dispose(leaf);
  }

  /** Lightning: a jagged bolt out of the sky onto the target, flashing three times. */
  private async lightning(to: THREE.Vector3, fx: { main: number; spark: number }): Promise<void> {
    const points: THREE.Vector3[] = [];
    const top = to.clone().add(new THREE.Vector3(0.6, 7, -1));
    for (let i = 0; i <= 10; i++) {
      const p = top.clone().lerp(to, i / 10);
      if (i > 0 && i < 10) p.add(new THREE.Vector3((this.rng.next() - 0.5) * 0.7, 0, (this.rng.next() - 0.5) * 0.3));
      points.push(p);
    }
    const bolt = this.temporary(new THREE.Group());
    // A thick bright core and a softer glow: box segments, since lines are only a pixel wide.
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      for (const [width, colour, opacity] of [[0.09, fx.spark, 1], [0.24, fx.main, 0.5]] as const) {
        const segment = new THREE.Mesh(new THREE.BoxGeometry(width, a.distanceTo(b) + width, width), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, fog: false }));
        segment.position.copy(a).lerp(b, 0.5);
        segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        bolt.add(segment);
      }
    }
    for (let i = 0; i < 3; i++) {
      bolt.visible = true;
      await this.wait(0.08);
      bolt.visible = false;
      await this.wait(0.06);
    }
    this.dispose(bolt);
  }

  /** Stone: a few rocks lobbed over in high arcs, one after another. */
  private async rocks(from: THREE.Vector3, to: THREE.Vector3, fx: { main: number; spark: number }): Promise<void> {
    const rocks = Array.from({ length: 3 }, (_, i) => {
      const rock = this.temporary(new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 - i * 0.03), new THREE.MeshStandardMaterial({ color: i % 2 ? fx.spark : fx.main, flatShading: true, roughness: 1 })));
      rock.visible = false;
      return rock;
    });
    await this.tween(0.7, (k) => {
      rocks.forEach((rock, i) => {
        const t = (k - i * 0.12) / 0.62;
        rock.visible = t > 0 && t < 1;
        if (!rock.visible) return;
        rock.position.copy(this.arc(from, to, t, 1.4)).add(new THREE.Vector3((i - 1) * 0.25, 0, 0));
        rock.rotation.set(t * 8, t * 5, 0);
      });
    });
    for (const rock of rocks) this.dispose(rock);
  }
}
