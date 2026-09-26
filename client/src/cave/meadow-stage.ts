import * as THREE from "three";
import { KANAGAWA } from "../ui/theme";
import { MONSTER_SIZE, ThrowStage, type LivingMonster, type StageMonster } from "./throw-stage";

/**
 * The wild monster's sunny meadow, in 3D (a clear sky, a big red rising sun, green hills,
 * pines and susuki grass). Catching: the monster shifts from side to side and you shoot the
 * ball at it with the slingshot. The ball, its flight, the catch animation and the monster's
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

  constructor(canvas: HTMLCanvasElement, monster: StageMonster, seed: number, battle = false) {
    super(canvas, seed);
    this.scene.background = new THREE.Color(KANAGAWA.springBlue);
    this.scene.fog = new THREE.Fog(KANAGAWA.springBlue, 18, 60);
    this.buildMeadow();
    const living = this.makeLiving(monster);
    living.sprite.visible = true;
    const at = battle ? this.battleSpot.clone() : new THREE.Vector3(HOME.x, STAND_Y, HOME.z);
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
    m.home.copy(m.sprite.position).setY(STAND_Y);
    m.offset.set(0, 0, 0);
    m.phase = "battle";
  }

  /** The monster says hello with its cry (when the scene opens). */
  greet(): void {
    const m = this.monsters[0];
    if (m && m.phase === "standing") this.cry(m);
  }

  // ------------------------------------------------------------ the meadow

  private buildMeadow(): void {
    const rand = () => this.rng.next();
    this.scene.add(new THREE.HemisphereLight(KANAGAWA.fujiWhite, KANAGAWA.autumnGreen, 1.6));
    const sunlight = new THREE.DirectionalLight(KANAGAWA.fujiWhite, 1.4);
    sunlight.position.set(-6, 12, 4);
    this.scene.add(sunlight);

    // The rising sun, far away and never fogged.
    const sun = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshBasicMaterial({ color: KANAGAWA.autumnRed, fog: false }));
    sun.position.set(-26, 22, -70);
    this.scene.add(sun);

    // The ground: a gently rolling meadow.
    const floor = new THREE.PlaneGeometry(90, 90, 40, 40);
    const pos = floor.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      // Flat where the monster stands, rolling further out.
      const far = Math.min(1, Math.hypot(x, y + 7) / 20);
      pos.setZ(i, (Math.sin(x * 0.2) + Math.cos(y * 0.17)) * 0.6 * far + (rand() - 0.5) * 0.1);
    }
    floor.computeVertexNormals();
    const ground = new THREE.Mesh(floor, new THREE.MeshStandardMaterial({ color: KANAGAWA.autumnGreen, flatShading: true, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -20;
    this.scene.add(ground);

    // Soft hills along the horizon.
    const hill = new THREE.MeshStandardMaterial({ color: KANAGAWA.winterGreen, flatShading: true, roughness: 1 });
    for (let i = 0; i < 7; i++) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(8 + rand() * 6, 12, 8), hill);
      h.scale.y = 0.35 + rand() * 0.2;
      h.position.set(-40 + i * 13 + rand() * 4, -1, -45 - rand() * 10);
      this.scene.add(h);
    }

    // Japanese pines: a crooked trunk under flat, layered canopies — at the back and the sides.
    const bark = new THREE.MeshStandardMaterial({ color: KANAGAWA.sumiInk5, roughness: 1 });
    const needles = new THREE.MeshStandardMaterial({ color: KANAGAWA.winterGreen, flatShading: true, roughness: 1 });
    const pine = (x: number, z: number, size: number) => {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * size, 0.2 * size, 2.4 * size, 6), bark);
      trunk.position.set(x, 1.2 * size, z);
      trunk.rotation.z = (rand() - 0.5) * 0.25;
      this.scene.add(trunk);
      for (let k = 0; k < 3; k++) {
        const layer = new THREE.Mesh(new THREE.SphereGeometry((1.5 - k * 0.35) * size, 10, 6), needles);
        layer.scale.y = 0.32;
        layer.position.set(x + (rand() - 0.5) * 0.5 * size, (1.6 + k * 0.7) * size, z);
        this.scene.add(layer);
      }
    };
    for (let i = 0; i < 9; i++) pine(-18 + i * 4.5 + (rand() - 0.5) * 2, -20 - rand() * 8, 1.3 + rand() * 0.8);
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) pine(side * (8 + rand() * 4), -4 - i * 5 - rand() * 2, 1 + rand() * 0.5);

    // Susuki: tufts of pampas grass with pale plumes, around the monster and further out.
    const stem = new THREE.MeshStandardMaterial({ color: KANAGAWA.boatYellow1, roughness: 1 });
    const plume = new THREE.MeshStandardMaterial({ color: KANAGAWA.boatYellow2, roughness: 1 });
    for (let i = 0; i < 40; i++) {
      const x = (rand() - 0.5) * 22;
      const z = -3 - rand() * 14;
      if (Math.abs(x - HOME.x) < 2.2 && Math.abs(z - HOME.z) < 1.6) continue; // keep its spot clear
      if (Math.abs(x) < 2.4 && z > -8.2) continue; // and the view of it (and of the battle) from the front
      for (let b = 0; b < 3; b++) {
        const h = 0.6 + rand() * 0.6;
        const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.03, h, 4), stem);
        const lean = (rand() - 0.5) * 0.5;
        blade.position.set(x + b * 0.12, h / 2, z);
        blade.rotation.z = lean;
        this.scene.add(blade);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 5), plume);
        tip.position.set(x + b * 0.12 - Math.sin(lean) * h * 0.5, h + 0.05, z);
        tip.rotation.z = lean;
        this.scene.add(tip);
        // A breeze moves the plumes.
        const phase = rand() * 6;
        this.animated.push((t) => (tip.rotation.z = lean + Math.sin(t * 1.4 + phase) * 0.12));
      }
    }
  }

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
    const spot = new THREE.Vector3(HOME.x + Math.sin(time * 0.55 + m.wobble) * SWAY_X, STAND_Y, HOME.z);
    if (m.phase === "returning") {
      m.timer -= dt;
      const k = 1 - Math.max(0, m.timer) / 0.7;
      m.sprite.position.lerpVectors(m.returnFrom!, spot, k);
      m.sprite.position.y = STAND_Y + Math.sin(k * Math.PI) * 1.1;
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
    m.returnFrom = from.clone().setY(STAND_Y);
    m.timer = 0.7;
  }

  /** A ball landed close by: it jumps. */
  protected ballLanded(at: THREE.Vector3): void {
    const m = this.monsters[0];
    if (m?.phase === "standing" && Math.hypot(m.sprite.position.x - at.x, m.sprite.position.z - at.z) < 2.5) m.startle = 0.45;
  }
}
