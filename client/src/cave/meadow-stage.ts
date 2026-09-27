import * as THREE from "three";
import type { SceneLook } from "@shared";
import { sceneKind } from "../content/load-scenes";
import { buildScenery } from "./scenery";
import { MONSTER_SIZE, ThrowStage, type LivingMonster, type StageMonster } from "./throw-stage";

/**
 * Where the wild monster stands, in 3D: a sunny meadow by default (a clear sky, a big red
 * rising sun, green hills, pines and susuki grass), or another scene (scenery.ts) — a forest
 * glade, a lake shore, the mountains, dunes, snow, a volcano, cherry blossom. Catching: the monster shifts from side to side and you shoot the
 * ball at it (crosshairs and a trigger). The ball, its flight, the catch animation and the monster's
 * faces are ThrowStage's; the battle engine decides whether a hit catches it. In a battle
 * (battle-stage.ts) it stands its ground instead: that's the "battle" phase.
 */

/** Where it stands while being caught, and how far it shifts to either side. */
const HOME = { x: 0, z: -7 };
const SWAY_X = 1.4;
export const STAND_Y = MONSTER_SIZE / 2;

type Phase = "standing" | "returning" | "caught" | "battle";

export interface MeadowMonster extends LivingMonster {
  phase: Phase;
  timer: number;
  /** Seconds until it hops or cries on its own. */
  nextAct: number;
  returnFrom?: THREE.Vector3;
  /** In a battle: where it stands (easing back to its battle spot), and how far an attack or a hit moves it from there. */
  home: THREE.Vector3;
  offset: THREE.Vector3;
}

export class MeadowStage extends ThrowStage<MeadowMonster> {
  /** Where it stands during a battle: a little to the right, facing my monster (battle-stage.ts moves it for tall screens). */
  protected readonly battleSpot = new THREE.Vector3(1.3, STAND_Y, -7);
  /** One monster, swaying a little: a narrower view than the cave's, so it's bigger on a phone. */
  protected sideView = 42;

  constructor(canvas: HTMLCanvasElement, monster: StageMonster, seed: number, battle = false, look: SceneLook = sceneKind(undefined).look) {
    super(canvas, seed);
    // The scene fits where the battle is: a meadow, a forest glade, a lake shore, snow…
    buildScenery({ scene: this.scene, rand: () => this.rng.next(), animated: this.animated }, look);
    const living = this.makeLiving(monster);
    living.sprite.visible = true;
    // It stands on the grass whatever its size (a rare giant or tiny one).
    this.battleSpot.y = living.size / 2;
    const at = battle ? this.battleSpot.clone() : new THREE.Vector3(HOME.x, living.size / 2, HOME.z);
    living.sprite.position.copy(at);
    this.monsters.push({ ...living, phase: battle ? "battle" : "standing", timer: 0, nextAct: 2 + this.rng.next() * 2, home: at.clone(), offset: new THREE.Vector3() });
    this.start();
  }

  /** The wild monster (there's only ever one in the meadow). */
  protected get wild(): MeadowMonster {
    return this.monsters[0]!;
  }

  /** From the battle to being caught: it hops over and starts shifting about. */
  protected startSwaying(): void {
    const m = this.wild;
    if (m.phase !== "battle") return;
    m.offset.set(0, 0, 0);
    this.breakFree(m, m.sprite.position.clone());
  }

  /** Back to the battle (unless it was caught): it eases back to its battle spot. */
  protected stopSwaying(): void {
    const m = this.wild;
    if (m.phase === "caught") return;
    m.home.copy(m.sprite.position).setY(m.size / 2);
    m.offset.set(0, 0, 0);
    m.phase = "battle";
  }

  /** The monster says hello with its cry (when the scene opens). */
  greet(): void {
    const m = this.monsters[0];
    if (m && m.phase === "standing") this.cry(m);
  }

  // ------------------------------------------------------------ the meadow

  // ------------------------------------------------------------ the monster

  protected updateMonsters(dt: number, time: number): void {
    const m = this.monsters[0];
    if (!m || m.phase === "caught") return;
    if (m.phase === "battle") {
      m.home.lerp(this.battleSpot, Math.min(1, dt * 4));
      m.sprite.position.copy(m.home).add(m.offset);
      this.animateMonster(m, dt, time);
      return;
    }
    const spot = new THREE.Vector3(HOME.x + Math.sin(time * 0.55 + m.wobble) * SWAY_X, m.size / 2, HOME.z);
    if (m.phase === "returning") {
      m.timer -= dt;
      const k = 1 - Math.max(0, m.timer) / 0.7;
      m.sprite.position.lerpVectors(m.returnFrom!, spot, k);
      m.sprite.position.y = m.size / 2 + Math.sin(k * Math.PI) * 1.1;
      if (m.timer <= 0) m.phase = "standing";
    } else {
      m.sprite.position.copy(spot);
      // Now and then, on its own: a little hop, or a cry.
      m.nextAct -= dt;
      if (m.nextAct <= 0) {
        m.nextAct = 3 + this.rng.next() * 4;
        if (this.rng.next() < 0.35) this.cry(m);
        else m.startle = 0.45;
      }
    }
    this.animateMonster(m, dt, time);
  }

  protected canBeHit(m: MeadowMonster): boolean {
    return m.phase === "standing" || m.phase === "returning";
  }

  /** Out of the ball: it hops back to where it stood. */
  protected breakFree(m: MeadowMonster, from: THREE.Vector3): void {
    m.phase = "returning";
    m.returnFrom = from.clone().setY(m.size / 2);
    m.timer = 0.7;
  }

  /** A ball landed close by: it jumps. */
  protected ballLanded(at: THREE.Vector3): void {
    const m = this.monsters[0];
    if (m?.phase === "standing" && Math.hypot(m.sprite.position.x - at.x, m.sprite.position.z - at.z) < 2.5) m.startle = 0.45;
  }
}
