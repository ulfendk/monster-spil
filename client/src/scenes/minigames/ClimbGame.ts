import Phaser from "phaser";
import type { Layout } from "../../ui/layout";
import { addAvatar } from "../../gfx/avatar-sprites";
import { ic } from "../../ui/rich-text";
import { C, KANAGAWA } from "../../ui/theme";
import { t } from "../../i18n/da";
import { Minigame, barY as barTop } from "./Minigame";

/**
 * Climbing over a mountain: handholds light up one after another, left and right, and you
 * tap each one to pull yourself up. Climbing tires you (the bar runs down slowly); every
 * good grab gives a little strength back, a wrong tap costs some. Reach the top and you
 * are over; run out of strength and you slide back down.
 */
export class ClimbGame extends Minigame {
  private holds = 0;
  private needed = 0;
  private strength = 100;
  private wall!: Phaser.GameObjects.Container;
  private climber!: Phaser.GameObjects.Container;
  private bar!: Phaser.GameObjects.Rectangle;
  private barW = 0;
  private next?: Phaser.GameObjects.Arc;
  private step = 0;

  constructor() {
    super("Climb");
  }

  protected hint(): string {
    return `${ic("climb")} ${t("climb_hint")}`;
  }

  protected build(layout: Layout): void {
    const { width, height } = layout;
    this.holds = 0;
    this.strength = 100;
    this.needed = Math.min(20, 3 + (this.play.size ?? 2) * 2);
    this.step = layout.px(110);
    // The rock face, which slides down as you climb.
    this.wall = this.add.container(0, 0);
    const faceW = Math.min(width * 0.8, layout.px(560));
    const total = (this.needed + 4) * this.step;
    this.wall.add(this.add.rectangle(width / 2, height - total / 2, faceW, total + height, KANAGAWA.katanaGray).setStrokeStyle(4, KANAGAWA.sumiInk0));
    for (let i = 0; i < 40; i++) {
      const y = height - Math.random() * total;
      this.wall.add(this.add.line(0, 0, width / 2 - faceW / 2 + Math.random() * faceW, y, width / 2 - faceW / 2 + Math.random() * faceW, y + 30, KANAGAWA.sumiInk6).setLineWidth(3).setOrigin(0));
    }
    // The summit, with snow.
    const topY = height * 0.62 - (this.needed + 1) * this.step;
    this.wall.add(this.add.rectangle(width / 2, topY, faceW, layout.px(40), KANAGAWA.fujiWhite));
    // Me, on my coloured circle.
    const r = layout.px(34);
    this.climber = this.add.container(width / 2, height * 0.72);
    this.climber.add(this.add.circle(0, 0, r, Phaser.Display.Color.HexStringToColor(this.play.farve).color).setStrokeStyle(3, C.border));
    this.climber.add(addAvatar(this, 0, 0, this.play.avatarId, r * 1.7));
    // My strength.
    this.barW = Math.min(layout.px(420), width - 80);
    const barY = barTop(layout);
    this.add.rectangle(width / 2, barY, this.barW, layout.px(20), C.panel).setStrokeStyle(2, C.border).setDepth(10);
    this.bar = this.add.rectangle(width / 2 - this.barW / 2, barY, this.barW, layout.px(20), C.ok).setOrigin(0, 0.5).setDepth(11);
    this.showNext(layout);
    this.input.on("pointerdown", (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0) this.tire(12);
    });
  }

  update(_time: number, delta: number): void {
    if (this.isOver) return;
    this.tire((delta / 1000) * 9);
  }

  private tire(amount: number): void {
    if (this.isOver) return;
    this.strength = Math.max(0, Math.min(100, this.strength - amount));
    this.bar.width = (this.barW * this.strength) / 100;
    this.bar.setFillStyle(this.strength < 30 ? C.danger : C.ok);
    if (this.strength <= 0) {
      this.tweens.add({ targets: this.climber, y: this.scale.height + 100, duration: 700, ease: "Quad.easeIn" });
      this.finish(false, t("climb_fail"));
    }
  }

  /** The next handhold lights up, a step above me, to one side. */
  private showNext(layout: Layout): void {
    const side = this.holds % 2 ? 1 : -1;
    const x = layout.width / 2 + side * layout.px(70 + Math.random() * 60);
    const y = this.climber.y - this.step;
    const hold = this.add.circle(x, y, layout.touch(64) / 2, KANAGAWA.boatYellow2).setStrokeStyle(4, KANAGAWA.sumiInk0);
    this.tweens.add({ targets: hold, scale: 1.12, duration: 380, yoyo: true, repeat: -1 });
    hold.setInteractive();
    hold.once("pointerdown", () => this.grab(hold, layout));
    this.next = hold;
  }

  private grab(hold: Phaser.GameObjects.Arc, layout: Layout): void {
    if (this.isOver) return;
    this.holds++;
    this.tire(-18);
    hold.destroy();
    // I pull myself up: the wall slides down one step (the climber stays put on screen).
    this.tweens.add({ targets: this.climber, x: hold.x, duration: 160, yoyo: true });
    this.tweens.add({ targets: this.wall, y: this.wall.y + this.step, duration: 220, ease: "Quad.easeOut" });
    if (this.holds >= this.needed) {
      this.finish(true, t("climb_done"), "climb");
      return;
    }
    this.time.delayedCall(230, () => this.showNext(layout));
  }
}
