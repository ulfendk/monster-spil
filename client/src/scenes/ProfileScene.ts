import Phaser from "phaser";
import { levelForXp, levelProgress, lookFor, monsterBonus, titleFor, type LobbyPlayer } from "@shared";
import type { SaveData } from "../save/schema";
import { badgeList, levelConfig } from "../content/load-progress";
import { addAvatar } from "../gfx/avatar-sprites";
import { addIcon } from "../gfx/icon-art";
import { addScreenBackdrop } from "../gfx/motifs";
import { getLayout, restartOnResize } from "../ui/layout";
import { addScrolling } from "../ui/scrolling";
import { addCloseButton, createButton } from "../ui/Button";
import { ic, richText } from "../ui/rich-text";
import { C, CSS, FONT } from "../ui/theme";
import { t } from "../i18n/da";

/** The iPad design size of one badge on the wall; small screens scale it down a little, and the wall scrolls. */
const BADGE_CELL = 150;

/** Mine (from my save), or another player's (what the server says about them). */
export type ProfileSceneData = { save: SaveData; player?: undefined } | { save?: undefined; player: LobbyPlayer };

/**
 * A player's profile, opened over the map: their figure (wearing their headwear), name,
 * level and title, and a wall of every badge — earned ones in colour, the rest waiting as
 * "?" — that scrolls like the monster book. My own profile also shows how far I am to the next level, what unlocks next and how
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

    // Trophies (anyone's) and the nest (mine).
    const bw = Math.min(layout.px(190), (columnW - layout.px(40)) / (mine ? 2 : 1));
    const bh = layout.touch(64);
    y += layout.px(30) + bh / 2;
    const trophies = [...earned].filter((id) => badgeList.find((b) => b.id === id)?.trophy);
    const buttons: Array<[string, () => void]> = [[`${ic("trophy")} ${trophies.length}`, () => this.open("Trophies", { earned: trophies, back: "Profile" })]];
    if (mine) buttons.push([`${ic("egg")} ${mine.eggs?.length ?? 0}`, () => this.open("Nest", { save: mine, back: "Profile" })]);
    buttons.forEach(([label, onTap], i) => {
      const x = hx + (i - (buttons.length - 1) / 2) * (bw + layout.px(16));
      createButton(this, x, y, label, onTap, { width: bw, height: bh, fontSize: layout.font(26), backgroundColor: C.button });
    });
    y += bh / 2;

    // The badge wall: below in portrait, to the right in landscape (clear of the close button).
    const area = layout.portrait
      ? { left: safe.left + layout.px(16), right: width - safe.right - layout.px(16), top: y + layout.px(50), bottom: height - safe.bottom - layout.px(16) }
      : { left: safe.left + columnW, right: width - safe.right - layout.px(16), top: safe.top + layout.touch(64) + layout.px(20), bottom: height - safe.bottom - layout.px(12) };
    const areaW = area.right - area.left;
    const areaH = Math.max(0, area.bottom - area.top);
    const wall = badgeList.filter((b) => !b.trophy); // trophies have their own room
    // Badges at a readable size (a little smaller on a phone), as many per row as fit; the rest
    // scrolls like the monster book. The wall has its own camera, so it scrolls inside its area.
    const target = BADGE_CELL * Phaser.Math.Clamp(layout.s, 0.72, 1.2);
    const cols = Math.max(2, Math.min(wall.length, Math.floor(areaW / target)));
    const cell = Math.min(areaW / cols, BADGE_CELL * Math.max(1, layout.s));
    const rowH = cell * 1.25;
    const rows = Math.ceil(wall.length / cols);
    const badges = this.add.container(0, 0);
    wall.forEach((badge, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = areaW / 2 + (col - (cols - 1) / 2) * cell;
      const by = row * rowH + cell * 0.4;
      const has = earned.has(badge.id);
      const rad = cell * 0.34;
      badges.add(this.add.circle(x, by, rad, has ? C.panelMine : C.panel, has ? 1 : 0.6).setStrokeStyle(has ? 4 : 2, has ? C.accent : C.border, has ? 1 : 0.3));
      if (has) badges.add(addIcon(this, x, by, badge.icon, rad * 1.3));
      else badges.add(this.add.text(x, by, "?", { fontFamily: FONT, fontSize: `${Math.round(rad)}px`, color: CSS.faint }).setOrigin(0.5));
      const name = this.add
        .text(x, by + rad + Math.max(4, cell * 0.06), badge.navn, { fontFamily: FONT, fontSize: layout.font(Math.min(20, cell * 0.16)), color: has ? CSS.text : CSS.faint, align: "center", wordWrap: { width: cell * 0.95 } })
        .setOrigin(0.5, 0);
      // One long word ("Monsterkender") can't wrap: shrink it to fit its cell instead.
      if (name.width > cell * 0.95) name.setScale((cell * 0.95) / name.width);
      badges.add(name);
    });
    const camera = this.cameras.add(area.left, area.top, areaW, areaH);
    camera.ignore(this.children.list.filter((o) => o !== badges));
    this.cameras.main.ignore(badges);
    const inside = (p: Phaser.Input.Pointer) => p.x >= area.left && p.x <= area.right && p.y >= area.top && p.y <= area.bottom;
    addScrolling(this, camera, Math.max(0, rows * rowH + layout.px(8) - areaH), inside);
  }

  private open(key: string, data: object): void {
    this.scene.launch(key, data);
    this.scene.bringToTop(key);
    this.scene.pause();
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume("Overworld");
  }
}
