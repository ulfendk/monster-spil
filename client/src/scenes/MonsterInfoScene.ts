import Phaser from "phaser";
import type { CreatureSpecies } from "@shared";
import type { GameContent } from "../content/load-content";
import { playCreatureSound } from "../audio/creature-sound";
import { TYPE_COLOURS } from "../gfx/placeholder-sprites";
import { createButton } from "../ui/Button";
import { CAUGHT_ICON, OWNED_ICON, POWER_ICON, SOUND_ICON, STAT_ICONS, TYPE_ICONS } from "../ui/icons";
import { t } from "../i18n/da";
import type { StringKey } from "../i18n/da";
import { getLayout, restartOnResize } from "../ui/layout";
import { C, CSS, FONT } from "../ui/theme";
import { addSeigaiha } from "../gfx/motifs";

export interface MonsterInfoSceneData {
  content: GameContent;
  species: CreatureSpecies;
  /** False for a monster that has only been seen: silhouette, name and cry, but no stats or moves. */
  caught: boolean;
  owned: number;
  caughtCount: number;
  /** Set when the page is rebuilt after a rotation, so the cry doesn't play again. */
  relayout?: boolean;
}

/** The two panels' design sizes (iPad); they are scaled and placed side by side or stacked. */
const HERO = { w: 440, h: 480 };
const DETAILS = { w: 470, h: 600 };

/** Bar length is stat / max, so the six starting monsters fill a bar sensibly. */
const STAT_MAX = { hp: 60, angreb: 20, forsvar: 20, fart: 20 } as const;

/** One monster's page, opened from the monster book. Plays its cry when it opens. */
export class MonsterInfoScene extends Phaser.Scene {
  private info!: MonsterInfoSceneData;

  constructor() {
    super("MonsterInfo");
  }

  init(data: MonsterInfoSceneData): void {
    this.info = data;
  }

  create(): void {
    restartOnResize(this, this.info);
    const layout = getLayout(this);
    const { width, height, safe } = layout;
    const { species, caught, owned, caughtCount } = this.info;

    const overlay = this.add.rectangle(0, 0, width, height, C.overlay, 1).setOrigin(0, 0);
    addSeigaiha(this, 0, height * 0.66, width, height * 0.34);
    overlay.setInteractive(); // swallow taps so they don't reach the scenes underneath

    // The monster itself, drawn in panel coordinates.
    const hero = this.add.container(0, 0);
    const cx = HERO.w / 2;
    hero.add(this.add.circle(cx, 160, 150, C.panel).setStrokeStyle(4, C.border, 0.9));
    const sprite = this.add.image(cx, 160, this.textures.exists(species.spriteFront) ? species.spriteFront : "__MISSING").setScale(2.2);
    if (!caught) sprite.setTint(C.overlay);
    hero.add(sprite);
    hero.add(this.add.text(cx, 355, species.navn, { fontFamily: FONT, fontSize: "40px", color: CSS.text }).setOrigin(0.5));
    const badge = this.add.rectangle(cx - 60, 430, 190, 56, TYPE_COLOURS[species.type]).setStrokeStyle(3, C.border);
    hero.add(badge);
    hero.add(this.add.text(badge.x, badge.y, `${TYPE_ICONS[species.type]} ${t(`type_${species.type}` as StringKey)}`, { fontFamily: FONT, fontSize: "26px", color: CSS.text }).setOrigin(0.5));
    hero.add(createButton(this, cx + 100, 430, SOUND_ICON, () => playCreatureSound(this, species), { width: 84, height: 64, fontSize: "32px", backgroundColor: C.button }));

    // Stats, moves and counters.
    const details = this.add.container(0, 0);
    if (caught) {
      this.drawStats(details, 10, 40);
      this.drawMoves(details, 10, 310);
    } else {
      details.add(this.add.text(DETAILS.w / 2, 260, "?", { fontFamily: FONT, fontSize: "120px", color: CSS.faint }).setOrigin(0.5));
    }
    details.add(this.add.text(DETAILS.w / 2, DETAILS.h - 40, `${CAUGHT_ICON} ${caughtCount}      ${OWNED_ICON} ${owned}`, { fontFamily: FONT, fontSize: "44px", color: CSS.text }).setOrigin(0.5));

    // Side by side on a wide screen, stacked on a tall one; scaled to fit either way.
    const closeSize = layout.touch(64);
    const top = safe.top + closeSize + layout.px(16);
    const area = { x: safe.left + 12, y: top, w: width - safe.left - safe.right - 24, h: height - top - safe.bottom - 12 };
    const gap = 24;
    const sideBySide = !layout.portrait;
    const totalW = sideBySide ? HERO.w + gap + DETAILS.w : Math.max(HERO.w, DETAILS.w);
    const totalH = sideBySide ? Math.max(HERO.h, DETAILS.h) : HERO.h + gap + DETAILS.h;
    const k = Math.min(1.25, area.w / totalW, area.h / totalH);
    const ox = area.x + (area.w - totalW * k) / 2;
    const oy = area.y + (area.h - totalH * k) / 2;
    hero.setScale(k).setPosition(sideBySide ? ox : ox + ((totalW - HERO.w) * k) / 2, sideBySide ? oy + ((totalH - HERO.h) * k) / 2 : oy);
    details.setScale(k).setPosition(
      sideBySide ? ox + (HERO.w + gap) * k : ox + ((totalW - DETAILS.w) * k) / 2,
      sideBySide ? oy : oy + (HERO.h + gap) * k
    );

    createButton(this, width - safe.right - 12 - closeSize / 2, safe.top + 10 + closeSize / 2, "✕", () => this.close(), {
      width: closeSize,
      height: closeSize,
      fontSize: layout.font(28),
      backgroundColor: C.buttonQuiet,
    });

    if (!this.info.relayout) playCreatureSound(this, species);
  }

  private drawStats(panel: Phaser.GameObjects.Container, x: number, y: number): void {
    const stats = this.info.species.baseStats;
    (Object.keys(STAT_ICONS) as Array<keyof typeof STAT_ICONS>).forEach((key, i) => {
      const rowY = y + i * 62;
      const fill = Math.min(1, stats[key] / STAT_MAX[key]);
      panel.add([
        this.add.text(x, rowY, STAT_ICONS[key], { fontFamily: FONT, fontSize: "38px" }).setOrigin(0, 0.5),
        this.add.rectangle(x + 70, rowY, 260, 26, C.panel).setOrigin(0, 0.5).setStrokeStyle(2, C.border, 0.5),
        this.add.rectangle(x + 70, rowY, 260 * fill, 26, TYPE_COLOURS[this.info.species.type]).setOrigin(0, 0.5),
        this.add.text(x + 350, rowY, String(stats[key]), { fontFamily: FONT, fontSize: "30px", color: CSS.text }).setOrigin(0, 0.5),
      ]);
    });
  }

  private drawMoves(panel: Phaser.GameObjects.Container, x: number, y: number): void {
    const { species, content } = this.info;
    species.moveIds.forEach((id, i) => {
      const move = content.movesById[id];
      if (!move) return;
      const rowY = y + i * 58;
      const power = move.power >= 50 ? 3 : move.power >= 30 ? 2 : 1;
      panel.add([
        this.add.rectangle(x, rowY, 300, 50, TYPE_COLOURS[move.type]).setOrigin(0, 0.5).setStrokeStyle(3, C.border),
        this.add.text(x + 14, rowY, `${TYPE_ICONS[move.type]} ${move.navn}`, { fontFamily: FONT, fontSize: "24px", color: CSS.text }).setOrigin(0, 0.5),
        this.add.text(x + 320, rowY, POWER_ICON.repeat(power), { fontFamily: FONT, fontSize: "28px" }).setOrigin(0, 0.5),
      ]);
    });
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume("Monsterbog");
  }
}
