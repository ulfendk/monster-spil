import Phaser from "phaser";
import type { Layout } from "../../ui/layout";
import { ic } from "../../ui/rich-text";
import { C, KANAGAWA } from "../../ui/theme";
import { t } from "../../i18n/da";
import { Minigame } from "./Minigame";

/** Good chops it takes to fell a tree. */
const CHOPS = 3;

/**
 * Felling a tree: a marker swings to and fro along a bar, and a tap while it's in the
 * green zone is a good chop — chips fly and the notch grows. After three, the tree falls.
 * The zone shrinks a little each time; a tap outside it just thunks.
 */
export class ChopGame extends Minigame {
  private chops = 0;
  private marker!: Phaser.GameObjects.Rectangle;
  private zone!: Phaser.GameObjects.Rectangle;
  private bar!: { x: number; w: number };
  private tree!: Phaser.GameObjects.Container;
  private notch!: Phaser.GameObjects.Triangle;

  constructor() {
    super("Chop");
  }

  protected hint(): string {
    return `${ic("axe")} ${t("chop_hint")}`;
  }

  protected build(layout: Layout): void {
    this.chops = 0;
    const { width, height } = layout;
    const cx = width / 2;
    const groundY = height * 0.68;
    const s = layout.px(1);
    // The pine: a trunk and flat, layered canopies — in a container pivoting at its foot, so it can fall.
    this.tree = this.add.container(cx, groundY);
    const trunkW = 46 * s;
    const trunkH = 230 * s;
    this.tree.add(this.add.rectangle(0, -trunkH / 2, trunkW, trunkH, KANAGAWA.sumiInk5).setStrokeStyle(3, KANAGAWA.sumiInk0));
    for (const [y, w] of [[-trunkH, 220], [-trunkH - 55, 170], [-trunkH - 105, 110]] as const) {
      this.tree.add(this.add.ellipse(0, y * 1, w * s, 60 * s, KANAGAWA.winterGreen).setStrokeStyle(3, KANAGAWA.sumiInk0));
    }
    this.notch = this.add.triangle(cx - trunkW / 2, groundY - 30 * s, 0, 0, 0, 0, 0, 0, KANAGAWA.boatYellow2);
    this.add.rectangle(cx, groundY + 20 * s, width, 40 * s, KANAGAWA.autumnGreen);

    // The bar with the green zone and the swinging marker.
    const barW = Math.min(layout.px(620), width - layout.safe.left - layout.safe.right - 60);
    const barY = height * 0.84;
    this.bar = { x: cx - barW / 2, w: barW };
    this.add.rectangle(cx, barY, barW, layout.px(34), C.panel).setStrokeStyle(3, C.border);
    this.zone = this.add.rectangle(cx, barY, barW * 0.3, layout.px(34), C.ok);
    this.marker = this.add.rectangle(this.bar.x, barY, layout.px(10), layout.px(60), KANAGAWA.fujiWhite).setStrokeStyle(2, KANAGAWA.sumiInk0);
    this.tweens.add({ targets: this.marker, x: this.bar.x + barW, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    this.input.on("pointerdown", (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0) this.swing();
    });
  }

  private swing(): void {
    if (this.isOver || this.chops >= CHOPS) return;
    const inZone = Math.abs(this.marker.x - this.zone.x) <= this.zone.width / 2;
    if (!inZone) {
      // A thunk: the bar flashes, nothing else.
      this.tweens.add({ targets: this.zone, alpha: 0.3, duration: 90, yoyo: true });
      return;
    }
    this.chops++;
    const s = getScale(this);
    // Chips fly, the tree shudders, the notch bites deeper.
    for (let i = 0; i < 8; i++) {
      const chip = this.add.rectangle(this.notch.x, this.notch.y, 8 * s, 5 * s, KANAGAWA.boatYellow2);
      this.tweens.add({ targets: chip, x: chip.x - (30 + Math.random() * 90) * s, y: chip.y - Math.random() * 80 * s, angle: 360, alpha: 0, duration: 600, onComplete: () => chip.destroy() });
    }
    this.tweens.add({ targets: this.tree, angle: 2, duration: 60, yoyo: true });
    const depth = (this.chops / CHOPS) * 22 * s;
    this.notch.setTo(0, -12 * s, depth, 0, 0, 12 * s);
    // Next time the zone is a little smaller, somewhere else.
    this.zone.width *= 0.8;
    this.zone.x = this.bar.x + this.zone.width / 2 + Math.random() * (this.bar.w - this.zone.width);
    if (this.chops >= CHOPS) {
      this.tweens.killTweensOf(this.marker);
      this.tweens.add({ targets: this.tree, angle: 88, duration: 900, ease: "Quad.easeIn", onComplete: () => this.finish(true, t("chop_done"), "axe") });
    }
  }
}

function getScale(scene: Phaser.Scene): number {
  return Math.max(0.5, Math.min(scene.scale.width / 1024, scene.scale.height / 768));
}
