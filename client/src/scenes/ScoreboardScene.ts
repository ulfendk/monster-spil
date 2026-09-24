import Phaser from "phaser";
import type { ScoreRow } from "@shared";
import { presence } from "../net/presence";
import { bossesById } from "../content/load-raid";
import { createButton } from "../ui/Button";
import { CAUGHT_ICON, DRAGON_ICON, DUEL_WIN_ICON, MEDALS, POINTS_ICON, SCORES_ICON, SLEEP_ICON } from "../ui/icons";
import { t } from "../i18n/da";

const FONT = "sans-serif";

/** The family's last 7 days: who caught, duelled and fought the dragon the most. Opened from 🏆 on the map. */
export class ScoreboardScene extends Phaser.Scene {
  private ui!: Phaser.GameObjects.Container;
  private rows?: ScoreRow[];
  private off?: () => void;

  constructor() {
    super("Scoreboard");
  }

  init(): void {
    this.rows = undefined;
  }

  create(): void {
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0x10132a, 1).setOrigin(0, 0).setInteractive();
    this.ui = this.add.container(0, 0);
    createButton(this, width - 90, 50, "X", () => this.close(), { width: 72, height: 64, fontSize: "28px", backgroundColor: 0x555555 });

    const onScores = (rows: ScoreRow[]) => {
      this.rows = rows;
      this.draw();
    };
    const redraw = () => this.draw();
    presence.events.on("scores", onScores);
    presence.events.on("raid", redraw);
    presence.events.on("status", redraw);
    this.off = () => {
      presence.events.off("scores", onScores);
      presence.events.off("raid", redraw);
      presence.events.off("status", redraw);
    };
    this.events.once("shutdown", () => this.off?.());
    presence.send("getScores", {});
    this.draw();
  }

  private close(): void {
    this.off?.();
    this.scene.stop();
    this.scene.resume("Overworld");
  }

  private text(x: number, y: number, value: string, size: number, color = "#ffffff", originX = 0.5): void {
    this.ui.add(this.add.text(x, y, value, { fontFamily: FONT, fontSize: `${size}px`, color }).setOrigin(originX, 0.5));
  }

  private draw(): void {
    this.ui.removeAll(true);
    const { width, height } = this.scale;
    this.text(width / 2, 50, `${SCORES_ICON} ${t("scores_title")}`, 38);

    if (presence.status !== "online") return this.text(width / 2, height / 2, `📵 ${t("lobby_offline")}`, 32, "#cccccc");
    if (!presence.raidSupported) return this.text(width / 2, height / 2, t("lobby_server_old"), 30, "#ffce54");

    this.drawDragon(width / 2, 120);
    if (!this.rows) return this.text(width / 2, height / 2, "⏳", 64);

    // Column headers are icons only: caught, duels won, dragon victories, points.
    const cols = { name: width * 0.2, catches: width * 0.55, duels: width * 0.67, dragons: width * 0.79, points: width * 0.91 };
    const top = 200;
    this.text(cols.catches, top, CAUGHT_ICON, 30);
    this.text(cols.duels, top, DUEL_WIN_ICON, 30);
    this.text(cols.dragons, top, DRAGON_ICON, 30);
    this.text(cols.points, top, POINTS_ICON, 30);

    const rowH = Math.min(80, (height - top - 60) / Math.max(1, this.rows.length));
    this.rows.forEach((row, i) => {
      const y = top + 60 + i * rowH;
      const mine = row.playerId === presence.myId;
      this.ui.add(this.add.rectangle(width / 2, y, width - 80, rowH - 10, mine ? 0x2e3a6e : 0x1b1f3b).setStrokeStyle(2, 0xffffff, mine ? 0.8 : 0.2));
      this.text(80, y, MEDALS[row.rank - 1] ?? String(row.rank), row.rank <= 3 ? 38 : 28, "#ffffff", 0);
      this.ui.add(this.add.circle(cols.name - 30, y, 16, Phaser.Display.Color.HexStringToColor(row.farve).color));
      this.text(cols.name, y, row.navn, 30, "#ffffff", 0);
      this.text(cols.catches, y, String(row.catches), 30);
      this.text(cols.duels, y, String(row.duels), 30);
      this.text(cols.dragons, y, String(row.dragons), 30);
      this.text(cols.points, y, String(row.points), 34, "#ffce54");
    });
  }

  /** This week's dragon: a bar of its shared HP, or asleep once the family has beaten it. */
  private drawDragon(cx: number, y: number): void {
    const raid = presence.raid;
    const boss = raid ? bossesById[raid.bossId] : undefined;
    if (!raid || !boss) return;
    if (raid.defeated) return this.text(cx, y, `${DRAGON_ICON} ${boss.navn} ${SLEEP_ICON}`, 28, "#cccccc");
    const barW = 360;
    this.text(cx - barW / 2 - 20, y, `${DRAGON_ICON} ${boss.navn}`, 26, "#ffffff", 1);
    this.ui.add(this.add.rectangle(cx - barW / 2, y, barW, 26, 0x2b2f52).setOrigin(0, 0.5).setStrokeStyle(2, 0xffffff, 0.6));
    this.ui.add(this.add.rectangle(cx - barW / 2, y, barW * (raid.hp / raid.maxHp), 26, 0xe63946).setOrigin(0, 0.5));
    this.text(cx + barW / 2 + 16, y, `❤️ ${raid.hp}`, 24, "#ffffff", 0);
  }
}
