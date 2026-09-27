import Phaser from "phaser";
import { eggProgress } from "@shared";
import type { SaveData } from "../save/schema";
import { eggConfig } from "../content/load-eggs";
import { drawEgg } from "../gfx/egg-art";
import { addCloseButton, whenTapped } from "../ui/Button";
import { getLayout, restartOnResize } from "../ui/layout";
import { ic, richText } from "../ui/rich-text";
import { addScreenBackdrop } from "../gfx/motifs";
import { C, CSS, FONT } from "../ui/theme";
import { t } from "../i18n/da";

export interface NestSceneData {
  save: SaveData;
  /** Where to go back to when closed. */
  back: string;
}

/**
 * The nest: the monster eggs I'm keeping (a few at most), each in a nest of straw, its colour
 * telling its type, cracked as far as it has come, with the steps it still needs. Tapping one
 * makes it wobble (what's inside stays a surprise until it hatches — by walking).
 */
export class NestScene extends Phaser.Scene {
  constructor() {
    super("Nest");
  }

  create(data: NestSceneData): void {
    restartOnResize(this, data);
    const layout = getLayout(this);
    const { width, height, safe } = layout;
    addScreenBackdrop(this, width, height, { alpha: 0.96 });
    addCloseButton(this, () => {
      this.scene.stop();
      this.scene.resume(data.back);
    });
    richText(this, width / 2, safe.top + 10 + layout.touch(64) / 2, `${ic("egg")} ${t("nest_title")}`, { fontFamily: FONT, fontSize: layout.font(36), color: CSS.text });
    const eggs = data.save.eggs ?? [];
    const slots = eggConfig.nestSize;
    const cols = layout.portrait ? 1 : slots;
    const rows = Math.ceil(slots / cols);
    const top = safe.top + layout.touch(64) + layout.px(40);
    const cellW = (width - safe.left - safe.right) / cols;
    const cellH = (height - top - safe.bottom - layout.px(20)) / rows;
    const size = Math.min(cellW * 0.5, cellH * 0.62);
    for (let i = 0; i < slots; i++) {
      const cx = safe.left + cellW * ((i % cols) + 0.5);
      const cy = top + cellH * (Math.floor(i / cols) + 0.42);
      // The nest: a ring of straw.
      const nest = this.add.graphics();
      nest.fillStyle(C.panel, 1).fillEllipse(cx, cy + size * 0.42, size * 1.3, size * 0.45);
      nest.lineStyle(Math.max(3, size * 0.05), 0xc0a36e, 1);
      for (let k = 0; k < 7; k++) nest.strokeEllipse(cx, cy + size * 0.42 + k * 0.6, size * (1.25 - k * 0.04), size * 0.4);
      const egg = eggs[i];
      if (!egg) {
        this.add.text(cx, cy, "?", { fontFamily: FONT, fontSize: `${Math.round(size * 0.5)}px`, color: CSS.faint }).setOrigin(0.5);
        continue;
      }
      const progress = eggProgress(eggConfig, egg);
      const shell = drawEgg(this, cx, cy, size, egg.type, progress);
      shell.setSize(size, size).setInteractive();
      whenTapped(shell, () => this.tweens.add({ targets: shell, angle: { from: -10, to: 10 }, duration: 110, yoyo: true, repeat: 2, onComplete: () => shell.setAngle(0) }));
      // Now and then it wobbles on its own, more the closer it is.
      this.tweens.add({ targets: shell, angle: { from: -3 - progress * 5, to: 3 + progress * 5 }, duration: 160, yoyo: true, repeat: 1, repeatDelay: 0, loop: -1, loopDelay: 2500 - progress * 1500, delay: i * 400 });
      const barW = size * 1.1;
      const by = cy + size * 0.78;
      this.add.rectangle(cx - barW / 2, by, barW, Math.max(10, size * 0.07), C.panel).setOrigin(0, 0.5).setStrokeStyle(2, C.border, 0.5);
      this.add.rectangle(cx - barW / 2, by, barW * progress, Math.max(10, size * 0.07), C.ok).setOrigin(0, 0.5);
      richText(this, cx, by + layout.px(28), `${ic("steps")} ${egg.stepsLeft} ${t("egg_steps")}`, { fontFamily: FONT, fontSize: layout.font(22), color: CSS.soft });
    }
  }
}
