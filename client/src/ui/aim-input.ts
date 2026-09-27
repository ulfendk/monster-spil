import Phaser from "phaser";
import { createButton } from "./Button";
import { getLayout } from "./layout";
import { ic } from "./rich-text";
import { C } from "./theme";

/** What aiming needs from a 3D throwing scene (cave/throw-stage.ts). */
interface Aimer {
  readonly ready: boolean;
  aimAt(sx?: number, sy?: number): void;
  /** Where in the scene something is on the canvas (to start the crosshairs on the monsters). */
  project(point: { x: number; y: number; z: number }): { x: number; y: number };
}

/**
 * Aiming with crosshairs and a trigger, in a 3D throwing scene (the cave, the meadow): put a
 * finger on the screen and the crosshairs sit a little above it (so the finger never hides
 * what you aim at), follow it as it moves, and stay where it lifts; the big round trigger
 * (bottom right) throws the ball to the point under them. Dots in the scene show the arc.
 */
export class AimInput {
  private readonly crosshairs: Phaser.GameObjects.Graphics;
  private trigger?: Phaser.GameObjects.Container;
  private pos = { x: 0, y: 0 };
  private placed = false;
  private finger?: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly stage: () => Aimer | undefined,
    /** Whether a throw may start now (balls left, not finished, …). */
    private readonly canThrow: () => boolean,
    private readonly onThrow: (x: number, y: number) => void
  ) {
    this.crosshairs = scene.add.graphics().setDepth(15);
    scene.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (scene.input.hitTestPointer(p).length > 0) return; // a button (the trigger, ✕) has it
      this.finger = p.id;
      this.follow(p);
    });
    scene.input.on("pointermove", (p: Phaser.Input.Pointer) => p.isDown && p.id === this.finger && this.follow(p));
    scene.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (p.id === this.finger) this.finger = undefined;
    });
    scene.events.on("update", this.update, this);
    scene.events.once("shutdown", () => scene.events.off("update", this.update, this));
    this.layout();
  }

  /** How far above the finger the crosshairs sit. */
  private lift(): number {
    return getLayout(this.scene).px(90);
  }

  /** Lays the trigger out (again, after a rotation) and keeps the crosshairs on the screen. */
  layout(): void {
    this.trigger?.destroy();
    const layout = getLayout(this.scene);
    const size = Math.max(88, layout.touch(116)); // big: it is the button that throws
    const gap = layout.px(20);
    this.trigger = createButton(this.scene, layout.width - layout.safe.right - gap - size / 2, layout.height - layout.safe.bottom - gap - size / 2, ic("ball"), () => this.fire(), {
      width: size,
      height: size,
      fontSize: `${Math.round(size * 0.46)}px`,
      backgroundColor: C.catch,
    }).setDepth(16);
    this.pos = { x: Phaser.Math.Clamp(this.pos.x, 0, layout.width), y: Phaser.Math.Clamp(this.pos.y, 0, layout.height) };
  }

  /** Puts the crosshairs at a point on the screen (dev builds use this to test). */
  aim(x: number, y: number): void {
    this.pos = { x, y };
    this.placed = true;
  }

  /** Pulls the trigger: the ball flies to where the crosshairs point. */
  fire(): void {
    const stage = this.stage();
    if (!stage?.ready || !this.canThrow()) return;
    this.onThrow(this.pos.x, this.pos.y);
  }

  destroy(): void {
    this.crosshairs.destroy();
    this.trigger?.destroy();
  }

  private follow(p: Phaser.Input.Pointer): void {
    const layout = getLayout(this.scene);
    this.pos = { x: Phaser.Math.Clamp(p.x, 0, layout.width), y: Phaser.Math.Clamp(p.y - this.lift(), 0, layout.height) };
    this.placed = true;
  }

  /** Every frame: the crosshairs (and the arc in the scene) follow the aim while a ball is ready. */
  private update(): void {
    const stage = this.stage();
    const show = Boolean(stage?.ready && this.canThrow());
    if (stage && !this.placed) {
      // To begin with, on the monsters: a few metres out, at the height they show themselves.
      const start = stage.project({ x: 0, y: 1, z: -7 });
      this.pos = { x: start.x, y: start.y };
      this.placed = true;
    }
    this.trigger?.setAlpha(show ? 1 : 0.45);
    stage?.aimAt(show ? this.pos.x : undefined, show ? this.pos.y : undefined);
    this.draw(show);
  }

  /** A ring with four ticks and a dot: ink, with a bright edge, so it shows on grass, sand and rock alike. */
  private draw(show: boolean): void {
    const g = this.crosshairs.clear();
    if (!show) return;
    const r = getLayout(this.scene).px(30);
    const { x, y } = this.pos;
    for (const [width, colour] of [[9, C.shadow], [4, C.accent]] as const) {
      g.lineStyle(width, colour, 1).strokeCircle(x, y, r);
      g.lineBetween(x - r * 1.6, y, x - r * 0.55, y).lineBetween(x + r * 0.55, y, x + r * 1.6, y);
      g.lineBetween(x, y - r * 1.6, x, y - r * 0.55).lineBetween(x, y + r * 0.55, x, y + r * 1.6);
    }
    g.fillStyle(C.shadow, 1).fillCircle(x, y, 6);
    g.fillStyle(C.accent, 1).fillCircle(x, y, 3.5);
  }
}
