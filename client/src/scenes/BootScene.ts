import Phaser from "phaser";
import { t } from "../i18n/da";
import { CSS, FONT } from "../ui/theme";
import { addHanko, addScreenBackdrop } from "../gfx/motifs";
import { getLayout } from "../ui/layout";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  create(): void {
    const layout = getLayout(this);
    const { width, height } = layout;
    const sunR = Math.min(width, height) * 0.28;
    addScreenBackdrop(this, width, height, { sun: { x: width / 2, y: height * 0.42, r: sunR } });

    const title = this.add
      .text(width / 2, height * 0.42, t("boot_title"), {
        fontFamily: FONT,
        fontSize: layout.font(64),
        color: CSS.text,
      })
      .setOrigin(0.5);
    // A red seal stamped at the end of the title: 狩 = "hunt".
    const seal = Math.max(36, layout.px(64));
    addHanko(this, width / 2 + title.width / 2 + seal * 0.75, height * 0.42 + seal * 0.25, seal);

    this.time.delayedCall(300, () => this.scene.start("Preload"));
  }
}
