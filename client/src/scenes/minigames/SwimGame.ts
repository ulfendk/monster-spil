import Phaser from "phaser";
import type { Layout } from "../../ui/layout";
import { addAvatar } from "../../gfx/avatar-sprites";
import { ic } from "../../ui/rich-text";
import { C, KANAGAWA } from "../../ui/theme";
import { t } from "../../i18n/da";
import { Minigame, barY as barTop } from "./Minigame";

/**
 * Swimming across: a ring shrinks towards a circle again and again, and a tap as it
 * reaches the circle is a good stroke — you move on towards the far shore. A tap at the
 * wrong moment splashes and tires you; tired out, you turn back.
 */
export class SwimGame extends Minigame {
  private strokes = 0;
  private needed = 0;
  private strength = 100;
  private swimmer!: Phaser.GameObjects.Container;
  private ring!: Phaser.GameObjects.Arc;
  private target!: Phaser.GameObjects.Arc;
  private bar!: Phaser.GameObjects.Rectangle;
  private barW = 0;
  private from = 0;
  private to = 0;

  constructor() {
    super("Swim");
  }

  protected hint(): string {
    return `${ic("swim")} ${t("swim_hint")}`;
  }

  protected build(layout: Layout): void {
    const { width, height } = layout;
    this.strokes = 0;
    this.strength = 100;
    this.needed = Math.min(24, 3 + (this.play.size ?? 2) * 2);
    // Water with rolling waves, the far shore on the right.
    this.add.rectangle(width / 2, height * 0.5, width, height * 0.5, KANAGAWA.waveBlue2);
    for (let i = 0; i < 6; i++) {
      const wave = this.add.ellipse(Math.random() * width, height * (0.3 + i * 0.08), layout.px(120), layout.px(16), KANAGAWA.crystalBlue, 0.5);
      this.tweens.add({ targets: wave, x: wave.x + layout.px(60), duration: 1600 + i * 200, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }
    this.add.rectangle(width - layout.px(50), height * 0.5, layout.px(100), height * 0.5, KANAGAWA.boatYellow2);
    this.from = layout.safe.left + layout.px(70);
    this.to = width - layout.px(120);
    const r = layout.px(34);
    this.swimmer = this.add.container(this.from, height * 0.45);
    this.swimmer.add(this.add.circle(0, 0, r, Phaser.Display.Color.HexStringToColor(this.play.farve).color).setStrokeStyle(3, C.border));
    this.swimmer.add(addAvatar(this, 0, 0, this.play.avatarId, r * 1.7));
    this.tweens.add({ targets: this.swimmer, y: this.swimmer.y + layout.px(8), duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    // The timing circle and the shrinking ring.
    const cy = height * 0.84;
    const tr = layout.px(46);
    this.target = this.add.circle(width / 2, cy, tr).setStrokeStyle(6, KANAGAWA.fujiWhite);
    this.ring = this.add.circle(width / 2, cy, tr * 2.6).setStrokeStyle(6, KANAGAWA.carpYellow);
    this.pulse();
    // My strength.
    this.barW = Math.min(layout.px(420), width - 80);
    const barY = barTop(layout);
    this.add.rectangle(width / 2, barY, this.barW, layout.px(20), C.panel).setStrokeStyle(2, C.border);
    this.bar = this.add.rectangle(width / 2 - this.barW / 2, barY, this.barW, layout.px(20), C.ok).setOrigin(0, 0.5);
    this.input.on("pointerdown", (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0) this.stroke();
    });
  }

  private pulse(): void {
    this.ring.setRadius(this.target.radius * 2.6);
    this.tweens.add({ targets: this.ring, radius: this.target.radius * 0.6, duration: 1300, ease: "Linear", onComplete: () => !this.isOver && this.pulse() });
  }

  private stroke(): void {
    if (this.isOver) return;
    const good = Math.abs(this.ring.radius - this.target.radius) <= this.target.radius * 0.32;
    const splash = this.add.circle(this.swimmer.x, this.swimmer.y + 20, 10, KANAGAWA.fujiWhite, 0.8);
    this.tweens.add({ targets: splash, scale: 4, alpha: 0, duration: 400, onComplete: () => splash.destroy() });
    if (!good) {
      this.strength = Math.max(0, this.strength - 25);
      this.bar.width = (this.barW * this.strength) / 100;
      this.bar.setFillStyle(this.strength < 30 ? C.danger : C.ok);
      if (this.strength <= 0) {
        this.tweens.add({ targets: this.swimmer, x: this.from, duration: 900 });
        this.finish(false, t("swim_fail"));
      }
      return;
    }
    this.strokes++;
    this.tweens.add({ targets: this.target, scale: 1.25, duration: 100, yoyo: true });
    const x = this.from + ((this.to - this.from) * this.strokes) / this.needed;
    this.tweens.add({ targets: this.swimmer, x, duration: 350, ease: "Quad.easeOut" });
    if (this.strokes >= this.needed) this.finish(true, t("swim_done"), "swim");
  }
}
