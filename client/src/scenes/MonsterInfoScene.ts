import Phaser from "phaser";
import type { CreatureSpecies } from "@shared";
import type { GameContent } from "../content/load-content";
import { playCreatureSound } from "../audio/creature-sound";
import { TYPE_COLOURS } from "../gfx/placeholder-sprites";
import { createButton } from "../ui/Button";
import { CAUGHT_ICON, OWNED_ICON, POWER_ICON, SOUND_ICON, STAT_ICONS, TYPE_ICONS } from "../ui/icons";
import { t } from "../i18n/da";
import type { StringKey } from "../i18n/da";

export interface MonsterInfoSceneData {
  content: GameContent;
  species: CreatureSpecies;
  /** False for a monster that has only been seen: silhouette, name and cry, but no stats or moves. */
  caught: boolean;
  owned: number;
  caughtCount: number;
}

const FONT = "sans-serif";
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
    const { width, height } = this.scale;
    const { species, caught, owned, caughtCount } = this.info;

    const overlay = this.add.rectangle(0, 0, width, height, 0x10132a, 1).setOrigin(0, 0);
    overlay.setInteractive(); // swallow taps so they don't reach the scenes underneath

    // Left: the monster itself.
    const cx = width * 0.29;
    this.add.circle(cx, 290, 150, 0x2b2f52).setStrokeStyle(4, 0xffffff, 0.9);
    const sprite = this.add.image(cx, 290, this.textures.exists(species.spriteFront) ? species.spriteFront : "__MISSING").setScale(2.2);
    if (!caught) sprite.setTint(0x000000);
    this.add.text(cx, 480, species.navn, { fontFamily: FONT, fontSize: "40px", color: "#ffffff" }).setOrigin(0.5);

    const badge = this.add.rectangle(cx - 60, 545, 190, 56, TYPE_COLOURS[species.type]).setStrokeStyle(3, 0xffffff);
    this.add.text(badge.x, badge.y, `${TYPE_ICONS[species.type]} ${t(`type_${species.type}` as StringKey)}`, { fontFamily: FONT, fontSize: "26px", color: "#ffffff" }).setOrigin(0.5);
    createButton(this, cx + 100, 545, SOUND_ICON, () => playCreatureSound(this, species), { width: 84, height: 64, fontSize: "32px", backgroundColor: 0x4a4e7a });

    // Right: stats, moves and counters.
    const left = width * 0.56;
    if (caught) {
      this.drawStats(left, 130);
      this.drawMoves(left, 400);
    } else {
      this.add.text(left + 160, 300, "?", { fontFamily: FONT, fontSize: "120px", color: "#555555" }).setOrigin(0.5);
    }
    this.add.text(left + 40, height - 80, `${CAUGHT_ICON} ${caughtCount}      ${OWNED_ICON} ${owned}`, { fontFamily: FONT, fontSize: "44px", color: "#ffffff" }).setOrigin(0, 0.5);

    createButton(this, width - 90, 50, "X", () => this.close(), { width: 72, height: 64, fontSize: "28px", backgroundColor: 0x555555 });

    playCreatureSound(this, species);
  }

  private drawStats(x: number, y: number): void {
    const stats = this.info.species.baseStats;
    (Object.keys(STAT_ICONS) as Array<keyof typeof STAT_ICONS>).forEach((key, i) => {
      const rowY = y + i * 62;
      this.add.text(x, rowY, STAT_ICONS[key], { fontFamily: FONT, fontSize: "38px" }).setOrigin(0, 0.5);
      this.add.rectangle(x + 70, rowY, 260, 26, 0x2b2f52).setOrigin(0, 0.5).setStrokeStyle(2, 0xffffff, 0.5);
      const fill = Math.min(1, stats[key] / STAT_MAX[key]);
      this.add.rectangle(x + 70, rowY, 260 * fill, 26, TYPE_COLOURS[this.info.species.type]).setOrigin(0, 0.5);
      this.add.text(x + 350, rowY, String(stats[key]), { fontFamily: FONT, fontSize: "30px", color: "#ffffff" }).setOrigin(0, 0.5);
    });
  }

  private drawMoves(x: number, y: number): void {
    const { species, content } = this.info;
    species.moveIds.forEach((id, i) => {
      const move = content.movesById[id];
      if (!move) return;
      const rowY = y + i * 58;
      this.add.rectangle(x, rowY, 300, 50, TYPE_COLOURS[move.type]).setOrigin(0, 0.5).setStrokeStyle(3, 0xffffff);
      this.add.text(x + 14, rowY, `${TYPE_ICONS[move.type]} ${move.navn}`, { fontFamily: FONT, fontSize: "24px", color: "#ffffff" }).setOrigin(0, 0.5);
      const power = move.power >= 50 ? 3 : move.power >= 30 ? 2 : 1;
      this.add.text(x + 320, rowY, POWER_ICON.repeat(power), { fontFamily: FONT, fontSize: "28px" }).setOrigin(0, 0.5);
    });
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume("Monsterbog");
  }
}
