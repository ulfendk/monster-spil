import Phaser from "phaser";
import { badgeList } from "../content/load-progress";
import { addCloseButton, whenTapped } from "../ui/Button";
import { getLayout, restartOnResize } from "../ui/layout";
import { ic, richText } from "../ui/rich-text";
import { addScreenBackdrop } from "../gfx/motifs";
import { C, CSS, FONT } from "../ui/theme";
import { t } from "../i18n/da";
import type { TrophyKind } from "../cave/trophy-models";

export interface TrophySceneData {
  /** The trophies (badge ids) this player has earned. */
  earned: string[];
  /** Where to go back to when closed. */
  back: string;
}

/**
 * The trophy room: every trophy on wooden shelves — the big moments (badges marked `trophy` in
 * badges.json) as gold 3D models (cave/trophy-models.ts, rendered from all round) — earned ones
 * shining, the rest dark shapes waiting. Tapping an earned one spins it round. Anyone's room can
 * be seen (from their profile).
 */
export class TrophyScene extends Phaser.Scene {
  constructor() {
    super("Trophies");
  }

  create(data: TrophySceneData): void {
    restartOnResize(this, data);
    const layout = getLayout(this);
    const { width, height, safe } = layout;
    addScreenBackdrop(this, width, height, { alpha: 0.97 });
    addCloseButton(this, () => {
      this.scene.stop();
      this.scene.resume(data.back);
    });
    richText(this, width / 2, safe.top + 10 + layout.touch(64) / 2, `${ic("trophy")} ${t("trophies_title")}`, { fontFamily: FONT, fontSize: layout.font(36), color: CSS.text });
    const trophies = badgeList.filter((b) => b.trophy);
    const loading = this.add.text(width / 2, height / 2, "…", { fontFamily: FONT, fontSize: layout.font(40), color: CSS.soft }).setOrigin(0.5);
    void import("../cave/trophy-models")
      .then(({ bakeTrophies, trophyFrameKey, TROPHY_FRAMES }) => {
        if (!this.scene.isActive()) return;
        loading.destroy();
        bakeTrophies(this, [...new Set(trophies.map((b) => b.trophy as TrophyKind))]);
        const earned = new Set(data.earned);
        const cols = layout.portrait ? 2 : 4;
        const rows = Math.ceil(trophies.length / cols);
        const top = safe.top + layout.touch(64) + layout.px(30);
        const cellW = (width - safe.left - safe.right) / cols;
        const cellH = (height - top - safe.bottom - layout.px(10)) / rows;
        const size = Math.min(cellW * 0.8, cellH * 0.78);
        trophies.forEach((badge, i) => {
          const cx = safe.left + cellW * ((i % cols) + 0.5);
          const cy = top + cellH * Math.floor(i / cols) + size * 0.5;
          // The shelf under it.
          this.add.rectangle(cx, cy + size * 0.42, cellW * 0.96, Math.max(8, size * 0.06), 0x603828).setStrokeStyle(2, C.shadow, 0.8);
          const kind = badge.trophy as TrophyKind;
          const has = earned.has(badge.id);
          const image = this.add.image(cx, cy, trophyFrameKey(kind, 0)).setDisplaySize(size, size);
          if (!has) image.setTint(C.shadow).setAlpha(0.7);
          this.add
            .text(cx, cy + size * 0.52, badge.navn, { fontFamily: FONT, fontSize: layout.font(Math.min(22, size * 0.13)), color: has ? CSS.text : CSS.faint, align: "center", wordWrap: { width: cellW * 0.95 } })
            .setOrigin(0.5, 0);
          if (!has) return;
          image.setInteractive({ useHandCursor: true });
          // A tap spins it once round.
          whenTapped(image, () => {
            const spin = { f: 0 };
            this.tweens.add({ targets: spin, f: TROPHY_FRAMES, duration: 900, ease: "Sine.inOut", onUpdate: () => image.setTexture(trophyFrameKey(kind, Math.floor(spin.f) % TROPHY_FRAMES)) });
          });
        });
      })
      .catch(() => loading.setText("?"));
  }
}
