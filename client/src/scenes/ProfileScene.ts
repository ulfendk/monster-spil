import Phaser from "phaser";
import { levelForXp, levelProgress, lookFor, monsterBonus, titleFor, type LobbyPlayer } from "@shared";
import type { SaveData } from "../save/schema";
import { badgeList, levelConfig } from "../content/load-progress";
import { addAvatar } from "../gfx/avatar-sprites";
import { addIcon } from "../gfx/icon-art";
import { addScreenBackdrop } from "../gfx/motifs";
import { getLayout, restartOnResize } from "../ui/layout";
import { addCloseButton } from "../ui/Button";
import { ic, richText } from "../ui/rich-text";
import { C, CSS, FONT } from "../ui/theme";
import { t } from "../i18n/da";

/** Mine (from my save), or another player's (what the server says about them). */
export type ProfileSceneData = { save: SaveData; player?: undefined } | { save?: undefined; player: LobbyPlayer };

/**
 * A player's profile, opened over the map: their figure (wearing their headwear), name,
 * level and title, and a wall of every badge — earned ones in colour, the rest waiting as
 * "?". My own profile also shows how far I am to the next level, what unlocks next and how
 * much stronger my monsters are.
 */
export class ProfileScene extends Phaser.Scene {
  private profileData!: ProfileSceneData;

  constructor() {
    super("Profile");
  }

  init(data: ProfileSceneData): void {
    this.profileData = data;
  }

  create(): void {
    const layout = getLayout(this);
    const { width, height, safe } = layout;
    addScreenBackdrop(this, width, height, { alpha: 0.96 });
    addCloseButton(this, () => this.close());
    restartOnResize(this, this.profileData);

    const mine = this.profileData.save;
    const player = mine?.player ?? this.profileData.player!;
    const xp = mine?.progress?.xp ?? 0;
    const level = mine ? levelForXp(xp, levelConfig) : this.profileData.player?.level ?? 1;
    const earned = new Set(mine ? Object.keys(mine.progress?.badges ?? {}) : this.profileData.player?.badges ?? []);

    // Portrait: who they are on top, the badges below. Landscape (a phone on its side is
    // short): who they are in a column on the left, the badges filling the rest.
    const columnW = layout.portrait ? width - safe.left - safe.right : Math.min(width * 0.38, layout.px(400));
    const hx = layout.portrait ? width / 2 : safe.left + columnW / 2;

    // Who: figure, name, level and title.
    const top = safe.top + layout.px(24);
    const r = Math.min(layout.px(64), height * (layout.portrait ? 0.08 : 0.13));
    const cy = top + r;
    this.add.circle(hx, cy, r, Phaser.Display.Color.HexStringToColor(player.farve).color).setStrokeStyle(3, C.border, 0.9);
    addAvatar(this, hx, cy, player.avatarId, r * 1.7, lookFor(level, levelConfig));
    let y = cy + r + layout.px(30);
    this.add.text(hx, y, player.navn, { fontFamily: FONT, fontSize: layout.font(40), color: CSS.text }).setOrigin(0.5);
    y += layout.px(46);
    richText(this, hx, y, `${ic("star")} ${level}   ${titleFor(level, levelConfig)}`, { fontFamily: FONT, fontSize: layout.font(30), color: CSS.accent });

    // Mine only: how far to the next level, what comes next, and my monsters' bonus.
    if (mine) {
      y += layout.px(40);
      const barW = Math.min(layout.px(420), columnW - layout.px(64));
      const barH = Math.max(14, layout.px(18));
      this.add.rectangle(hx - barW / 2, y, barW, barH, C.panel).setOrigin(0, 0.5).setStrokeStyle(2, C.border, 0.5);
      this.add.rectangle(hx - barW / 2, y, barW * levelProgress(xp, levelConfig), barH, C.ok).setOrigin(0, 0.5);
      y += layout.px(36);
      richText(this, hx, y, `${ic("sword")} +${Math.round(monsterBonus(level, levelConfig) * 100)}%`, { fontFamily: FONT, fontSize: layout.font(22), color: CSS.soft });
      const next = levelConfig.looks.find((l) => l.level > level);
      if (next) {
        y += layout.px(32);
        richText(this, hx, y, `${t("profile_next")} ${next.navn} ${ic("star")} ${next.level}`, { fontFamily: FONT, fontSize: layout.font(22), color: CSS.soft });
      }
    }

    // The badge wall: below in portrait, to the right in landscape (clear of the close button).
    const area = layout.portrait
      ? { left: safe.left + layout.px(16), right: width - safe.right - layout.px(16), top: y + layout.px(50), bottom: height - safe.bottom - layout.px(16) }
      : { left: safe.left + columnW, right: width - safe.right - layout.px(16), top: safe.top + layout.touch(64) + layout.px(20), bottom: height - safe.bottom - layout.px(12) };
    const areaW = area.right - area.left;
    const areaH = area.bottom - area.top;
    const n = badgeList.length;
    // As many columns as make the cells biggest. Badges aren't buttons, so they may be small.
    let best = { cols: 1, cell: 0 };
    for (let cols = 2; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const cell = Math.min(areaW / cols, areaH / rows / 1.25);
      if (cell > best.cell) best = { cols, cell };
    }
    const cell = Math.max(40, best.cell);
    const cols = best.cols;
    const midX = (area.left + area.right) / 2;
    badgeList.forEach((badge, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const rowCount = Math.min(cols, n - row * cols);
      const x = midX + (col - (rowCount - 1) / 2) * cell;
      const by = area.top + row * cell * 1.25 + cell * 0.4;
      const has = earned.has(badge.id);
      const rad = cell * 0.34;
      this.add.circle(x, by, rad, has ? C.panelMine : C.panel, has ? 1 : 0.6).setStrokeStyle(has ? 4 : 2, has ? C.accent : C.border, has ? 1 : 0.3);
      if (has) addIcon(this, x, by, badge.icon, rad * 1.3);
      else this.add.text(x, by, "?", { fontFamily: FONT, fontSize: `${Math.round(rad)}px`, color: CSS.faint }).setOrigin(0.5);
      const name = this.add
        .text(x, by + rad + Math.max(4, cell * 0.06), badge.navn, { fontFamily: FONT, fontSize: layout.font(Math.min(20, cell * 0.16)), color: has ? CSS.text : CSS.faint, align: "center", wordWrap: { width: cell * 0.95 } })
        .setOrigin(0.5, 0);
      // One long word ("Monsterkender") can't wrap: shrink it to fit its cell instead.
      if (name.width > cell * 0.95) name.setScale((cell * 0.95) / name.width);
    });
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume("Overworld");
  }
}
