import Phaser from "phaser";
import type { GameContent } from "../content/load-content";
import { adoptSave } from "../save/game-state";
import { fetchBackup, listBackups, type BackupSummary } from "../net/backup";
import { currentGame, updateGame } from "../save/games";
import { addCloseButton, createButton } from "../ui/Button";
import { getLayout, onRelayout, wrapGrid } from "../ui/layout";
import { addScreenBackdrop } from "../gfx/motifs";
import { addAvatar } from "../gfx/avatar-sprites";
import { C, CSS, FONT } from "../ui/theme";
import { t } from "../i18n/da";
import { hasIcons, ic, richText } from "../ui/rich-text";

export interface RestoreSceneData {
  content: GameContent;
}

type Step = { kind: "code"; notice?: string } | { kind: "busy" } | { kind: "pick"; code: string; players: BackupSummary[]; notice?: string };

/**
 * Getting a player back onto a new or reinstalled device: pick yourself from the game's
 * backed-up players and play on with your own monsters. Reached from the first setup
 * screen of an online game; the spilnøgle is asked for only if it turns out to be wrong.
 */
export class RestoreScene extends Phaser.Scene {
  private content!: GameContent;
  private step: Step = { kind: "code" };
  private ui: Phaser.GameObjects.GameObject[] = [];
  private codeInput?: Phaser.GameObjects.DOMElement;

  constructor() {
    super("Restore");
  }

  create(data: RestoreSceneData): void {
    this.content = data.content;
    this.step = { kind: "code" };
    onRelayout(this, () => this.draw());
    const key = currentGame()?.key;
    if (key) void this.submitCode(key);
    else this.draw();
  }

  private clear(): void {
    for (const o of this.ui) o.destroy();
    this.ui = [];
    this.codeInput?.destroy();
    this.codeInput = undefined;
  }

  private text(x: number, y: number, value: string, size: number, color: string = CSS.text): Phaser.GameObjects.GameObject {
    const layout = getLayout(this);
    if (hasIcons(value)) {
      const rich = richText(this, x, y, value, { fontFamily: FONT, fontSize: layout.font(size), color });
      this.ui.push(rich);
      return rich;
    }
    const label = this.add
      .text(x, y, value, { fontFamily: FONT, fontSize: layout.font(size), color, align: "center", wordWrap: { width: layout.width - 40 } })
      .setOrigin(0.5);
    this.ui.push(label);
    return label;
  }

  private draw(): void {
    const typed = (this.codeInput?.node as HTMLInputElement | undefined)?.value;
    this.clear();
    const layout = getLayout(this);
    const { width, height } = layout;
    this.ui.push(...addScreenBackdrop(this, width, height));
    this.ui.push(addCloseButton(this, () => this.scene.start("Setup", { content: this.content })).button);

    if (this.step.kind === "busy") {
      this.text(width / 2, height / 2, ic("hourglass"), 72);
      return;
    }
    if (this.step.kind === "code") return this.drawCode(this.step.notice, typed);
    this.drawPick(this.step.code, this.step.players, this.step.notice);
  }

  private drawCode(notice: string | undefined, typed: string | undefined): void {
    const layout = getLayout(this);
    const { width, height } = layout;
    this.text(width / 2, height * 0.22, ic("key"), 64);
    this.text(width / 2, height * 0.22 + layout.px(70), notice ?? t("lobby_code_title"), 30, notice ? CSS.accent : CSS.soft);
    this.codeInput = this.add.dom(
      width / 2,
      height * 0.47,
      "input",
      `font-size:${layout.font(32)};width:${Math.min(360, width - 80)}px;padding:16px;border-radius:16px;border:none;text-align:center;`
    );
    const el = this.codeInput.node as HTMLInputElement;
    el.autocomplete = "off";
    el.spellcheck = false;
    el.autocapitalize = "off";
    el.setAttribute("autocorrect", "off");
    el.value = typed ?? currentGame()?.key ?? "";
    this.ui.push(
      createButton(this, width / 2, height * 0.47 + layout.touch(72) + layout.px(30), "✓", () => void this.submitCode(el.value.trim()), {
        width: 140,
        height: layout.touch(72),
        fontSize: layout.font(36),
        backgroundColor: C.ok,
      })
    );
  }

  private async submitCode(code: string): Promise<void> {
    if (!code) return;
    this.step = { kind: "busy" };
    this.draw();
    const result = await listBackups(code);
    if (!result.ok) {
      this.step = { kind: "code", notice: result.reason === "code" ? t("lobby_code_wrong") : t("lobby_offline") };
    } else {
      this.step = { kind: "pick", code, players: result.value };
    }
    this.draw();
  }

  private drawPick(code: string, players: BackupSummary[], notice?: string): void {
    const layout = getLayout(this);
    const { width, height, safe } = layout;
    const top = safe.top + layout.touch(64) + layout.px(30);
    this.text(width / 2, top, t("restore_title"), 36);
    if (notice) this.text(width / 2, top + layout.px(46), notice, 24, CSS.accent);
    if (players.length === 0) {
      this.text(width / 2, height / 2, t("restore_none"), 30, CSS.soft);
      return;
    }
    const cell = Math.min(190, (width - safe.left - safe.right - 24) / Math.min(players.length, layout.portrait ? 2 : 4));
    const spots = wrapGrid(players.length, cell, cell * 1.05, width - safe.left - safe.right - 24, width / 2, (top + layout.px(60) + height - safe.bottom) / 2);
    players.forEach((p, i) => {
      const { x, y } = spots[i]!;
      const r = cell * 0.3;
      const colour = Phaser.Display.Color.HexStringToColor(p.farve).color;
      const circle = this.add.circle(x, y - r * 0.3, r, colour).setStrokeStyle(3, C.border, 0.9);
      circle.setInteractive({ useHandCursor: true });
      circle.on("pointerup", () => void this.pick(code, p));
      const face = addAvatar(this, x, y - r * 0.3, p.avatarId, r * 1.7);
      this.ui.push(circle, face);
      this.text(x, y + r * 0.95, p.navn, 26);
      this.text(x, y + r * 0.95 + layout.px(32), `${ic("paw")} ${p.creatures}`, 20, CSS.soft);
    });
  }

  /** Fetches the chosen player's save, makes it this device's save, and starts playing. */
  private async pick(code: string, player: BackupSummary): Promise<void> {
    const players = this.step.kind === "pick" ? this.step.players : [];
    this.step = { kind: "busy" };
    this.draw();
    const result = await fetchBackup(code, player.playerId);
    if (!result.ok) {
      this.step = { kind: "pick", code, players, notice: result.reason === "code" ? t("lobby_code_wrong") : t("lobby_offline") };
      return this.draw();
    }
    const game = currentGame();
    if (game) await updateGame(game.id, { key: code }); // the device will connect on its own from now on
    const save = await adoptSave(result.value);
    // Backed up before picking a first monster: pick it now.
    if (save.creatures.length === 0) this.scene.start("Starter", { content: this.content });
    else this.scene.start("Overworld", { save, content: this.content });
  }
}
