import Phaser from "phaser";
import { t } from "../i18n/da";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  create(): void {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 2, t("boot_title"), {
        fontFamily: "sans-serif",
        fontSize: "64px",
        color: "#ffce54",
      })
      .setOrigin(0.5);

    this.time.delayedCall(300, () => this.scene.start("Preload"));
  }
}
