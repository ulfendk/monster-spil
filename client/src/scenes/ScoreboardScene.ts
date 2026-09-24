import Phaser from "phaser";
import type { ScoreRow } from "@shared";
import { presence } from "../net/presence";
import { bossesById } from "../content/load-raid";
import { addCloseButton } from "../ui/Button";
import { getLayout, onRelayout } from "../ui/layout";
import { CAUGHT_ICON, DRAGON_ICON, DUEL_WIN_ICON, MEDALS, POINTS_ICON, SCORES_ICON, SLEEP_ICON } from "../ui/icons";
import { t } from "../i18n/da";
import { addAvatar } from "../gfx/avatar-sprites";
import { C, CSS, FONT } from "../ui/theme";
import { addSeigaiha } from "../gfx/motifs";


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
    this.ui = this.add.container(0, 0);

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
    onRelayout(this, () => this.draw());
    this.draw();
  }

  private close(): void {
    this.off?.();
    this.scene.stop();
    this.scene.resume("Overworld");
  }

  private text(x: number, y: number, value: string, size: number, color = CSS.text, originX = 0.5): void {
    this.ui.add(this.add.text(x, y, value, { fontFamily: FONT, fontSize: getLayout(this).font(size), color }).setOrigin(originX, 0.5));
  }

  private draw(): void {
    this.ui.removeAll(true);
    const layout = getLayout(this);
    const { width, height, safe } = layout;
    const backdrop = this.add.rectangle(0, 0, width, height, C.overlay, 1).setOrigin(0, 0).setInteractive();
    this.ui.add(backdrop);
    this.ui.add(addSeigaiha(this, 0, height * 0.66, width, height * 0.34));
    const { button, headerH, size } = addCloseButton(this, () => this.close());
    this.ui.add(button);
    // The title is centred in the space left of the close button.
    const titleCx = (safe.left + width - safe.right - size - 24) / 2;
    this.text(titleCx, headerH / 2 + safe.top / 2, `${SCORES_ICON} ${t("scores_title")}`, 38);

    if (presence.status !== "online") return this.text(width / 2, height / 2, `📵 ${t("lobby_offline")}`, 32, CSS.soft);
    if (!presence.raidSupported) return this.text(width / 2, height / 2, t("lobby_server_old"), 30, CSS.accent);

    this.drawDragon(width / 2, headerH + layout.px(8));
    if (!this.rows) return this.text(width / 2, height / 2, "⏳", 64);

    // Number columns from the right edge; the name gets what is left.
    const left = safe.left + 12;
    const right = width - safe.right - 12;
    const cw = Phaser.Math.Clamp(layout.px(110), 46, 120);
    const cols = { points: right - cw / 2, dragons: right - cw * 1.5, duels: right - cw * 2.5, catches: right - cw * 3.5 };
    const medalX = left + layout.px(20);
    const dotX = medalX + Math.max(40, layout.px(70));
    const nameX = dotX + Math.max(22, layout.px(26));
    const top = headerH + Math.max(84, layout.px(110));
    // Column headers are icons only: caught, duels won, dragon victories, points.
    this.text(cols.catches, top, CAUGHT_ICON, 30);
    this.text(cols.duels, top, DUEL_WIN_ICON, 30);
    this.text(cols.dragons, top, DRAGON_ICON, 30);
    this.text(cols.points, top, POINTS_ICON, 30);

    const rowH = Math.min(layout.touch(80), (height - safe.bottom - top - layout.px(40)) / Math.max(1, this.rows.length));
    this.rows.forEach((row, i) => {
      const y = top + layout.px(50) + i * rowH + rowH / 2 - layout.px(10);
      const mine = row.playerId === presence.myId;
      this.ui.add(this.add.rectangle((left + right) / 2, y, right - left, rowH - 8, mine ? C.panelMine : C.background).setStrokeStyle(2, C.border, mine ? 0.8 : 0.2));
      this.text(medalX, y, MEDALS[row.rank - 1] ?? String(row.rank), row.rank <= 3 ? 38 : 28, CSS.text, 0);
      this.ui.add(this.add.circle(dotX, y, Math.max(12, layout.px(18)), Phaser.Display.Color.HexStringToColor(row.farve).color));
      if (row.avatarId) {
        this.ui.add(addAvatar(this, dotX, y, row.avatarId, Math.max(24, layout.px(36)) * 1.5));
      }
      this.text(nameX, y, row.navn, 30, CSS.text, 0);
      this.text(cols.catches, y, String(row.catches), 30);
      this.text(cols.duels, y, String(row.duels), 30);
      this.text(cols.dragons, y, String(row.dragons), 30);
      this.text(cols.points, y, String(row.points), 34, CSS.accent);
    });
  }

  /** This week's dragon: its name and HP on one line, a bar of its shared HP below — or asleep once beaten. */
  private drawDragon(cx: number, y: number): void {
    const raid = presence.raid;
    const boss = raid ? bossesById[raid.bossId] : undefined;
    if (!raid || !boss) return;
    const layout = getLayout(this);
    if (raid.defeated) return this.text(cx, y + layout.px(20), `${DRAGON_ICON} ${boss.navn} ${SLEEP_ICON}`, 28, CSS.soft);
    this.text(cx, y, `${DRAGON_ICON} ${boss.navn}   ❤️ ${raid.hp}`, 26);
    const barW = Math.min(420, layout.width - layout.safe.left - layout.safe.right - 48);
    const barY = y + Math.max(30, layout.px(40));
    this.ui.add(this.add.rectangle(cx - barW / 2, barY, barW, Math.max(16, layout.px(24)), C.panel).setOrigin(0, 0.5).setStrokeStyle(2, C.border, 0.6));
    this.ui.add(this.add.rectangle(cx - barW / 2, barY, barW * (raid.hp / raid.maxHp), Math.max(16, layout.px(24)), C.catch).setOrigin(0, 0.5));
  }
}
