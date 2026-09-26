import Phaser from "phaser";
import type { Layout } from "../../ui/layout";
import { ic } from "../../ui/rich-text";
import { KANAGAWA } from "../../ui/theme";
import { t } from "../../i18n/da";
import { Minigame } from "./Minigame";

/** Taps it takes to dig down to whatever is there. */
const TAPS = 10;

/**
 * Digging: tap anywhere and the shovel goes in — earth flies and the hole gets deeper.
 * When it's deep enough the game is done; the map then shows what turned up.
 */
export class DigGame extends Minigame {
  private taps = 0;
  private hole!: Phaser.GameObjects.Ellipse;
  private heap!: Phaser.GameObjects.Ellipse;
  private shovel!: Phaser.GameObjects.Image;

  constructor() {
    super("Dig");
  }

  protected hint(): string {
    return `${ic("shovel")} ${t("dig_hint")}`;
  }

  protected build(layout: Layout): void {
    const { width, height } = layout;
    this.taps = 0;
    const cy = height * 0.6;
    this.add.ellipse(width / 2, cy, layout.px(520), layout.px(220), KANAGAWA.autumnGreen);
    this.heap = this.add.ellipse(width / 2 + layout.px(200), cy + layout.px(30), layout.px(20), layout.px(10), KANAGAWA.boatYellow1);
    this.hole = this.add.ellipse(width / 2, cy, layout.px(40), layout.px(16), KANAGAWA.sumiInk3);
    this.shovel = this.add.image(width / 2 + layout.px(60), cy - layout.px(90), "icon-shovel").setDisplaySize(layout.px(150), layout.px(150));
    this.input.on("pointerdown", (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0) this.dig(layout);
    });
  }

  private dig(layout: Layout): void {
    if (this.isOver || this.taps >= TAPS) return;
    this.taps++;
    const k = this.taps / TAPS;
    this.tweens.add({ targets: this.shovel, angle: -25, y: this.shovel.y + layout.px(30), duration: 90, yoyo: true });
    this.hole.setSize(layout.px(40 + 230 * k), layout.px(16 + 90 * k));
    this.heap.setSize(layout.px(20 + 120 * k), layout.px(10 + 50 * k));
    for (let i = 0; i < 6; i++) {
      const clod = this.add.circle(this.hole.x, this.hole.y, layout.px(5 + Math.random() * 5), KANAGAWA.boatYellow1);
      this.tweens.add({ targets: clod, x: this.heap.x + (Math.random() - 0.5) * layout.px(80), y: this.heap.y - layout.px(20 + Math.random() * 40), duration: 380, ease: "Quad.easeOut", onComplete: () => clod.destroy() });
    }
    if (this.taps >= TAPS) this.time.delayedCall(300, () => this.finish(true));
  }
}
