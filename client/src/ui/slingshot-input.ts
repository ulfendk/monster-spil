import type Phaser from "phaser";
import { slingshotToThrow, type Vec3 } from "@shared";
import { getLayout } from "./layout";

/** What the slingshot needs from a 3D throwing scene (cave/throw-stage.ts). */
interface Sling {
  readonly ready: boolean;
  setPull(pull?: { x: number; y: number }, v?: Vec3): void;
}

/**
 * Touch anywhere, pull back (down, towards yourself) and let go: the slingshot in a 3D
 * throwing scene (the cave, the meadow). While the finger is down the pouch follows it and
 * dots show the throw; letting go throws — unless the pull was too short, which just lets
 * the band go. How far counts as a full pull depends on the screen, so a phone and an iPad
 * feel the same.
 */
export class SlingshotInput {
  private from?: { x: number; y: number };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly stage: () => Sling | undefined,
    /** Whether a throw may start now (balls left, not finished, …). */
    private readonly canThrow: () => boolean,
    private readonly onThrow: (v: Vec3) => void
  ) {
    scene.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.down(p.x, p.y));
    scene.input.on("pointermove", (p: Phaser.Input.Pointer) => p.isDown && this.move(p.x, p.y));
    scene.input.on("pointerup", (p: Phaser.Input.Pointer) => this.up(p.x, p.y));
  }

  /** The longest pull that counts, in pixels. */
  maxPull(): number {
    const layout = getLayout(this.scene);
    return Math.max(80, Math.min(layout.height * 0.32, layout.px(300)));
  }

  /** A whole pull in one go, `dx`/`dy` pixels from where it started (dev builds use this to test). */
  pull(dx: number, dy: number): void {
    this.down(0, 0);
    this.move(dx, dy);
    this.up(dx, dy);
  }

  private down(x: number, y: number): void {
    const stage = this.stage();
    if (!stage?.ready || !this.canThrow()) return;
    this.from = { x, y };
  }

  private move(x: number, y: number): void {
    const stage = this.stage();
    if (!this.from || !stage) return;
    const dx = x - this.from.x;
    const dy = y - this.from.y;
    const max = this.maxPull();
    stage.setPull({ x: dx / max, y: Math.max(0, dy) / max }, slingshotToThrow(dx, dy, max));
  }

  private up(x: number, y: number): void {
    const stage = this.stage();
    if (!this.from || !stage) return;
    const v = slingshotToThrow(x - this.from.x, y - this.from.y, this.maxPull());
    this.from = undefined;
    stage.setPull(undefined);
    if (v && this.canThrow()) this.onThrow(v);
  }
}
