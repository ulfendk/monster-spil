import Phaser from "phaser";
import type { GameContent } from "../content/load-content";
import type { SaveData } from "../save/schema";
import { addGame, listGames, removeGame, savesByGame, type GameEntry } from "../save/games";
import { lookupGame } from "../net/backup";
import { addCloseButton, createButton } from "../ui/Button";
import { getLayout, onRelayout, wrapGrid } from "../ui/layout";
import { addScreenBackdrop } from "../gfx/motifs";
import { addAvatar } from "../gfx/avatar-sprites";
import { addIcon } from "../gfx/icon-art";
import { C, CSS, FONT } from "../ui/theme";
import { t } from "../i18n/da";
import { hasIcons, ic, richText } from "../ui/rich-text";
import { startGame } from "./start-game";

export interface GamesSceneData {
  content: GameContent;
}

type Step =
  | { kind: "list" }
  | { kind: "add" }
  | { kind: "key"; notice?: string }
  | { kind: "busy" }
  | { kind: "remove"; game: GameEntry };

/**
 * The game list, shown at start when the device plays more than one game (and from ⚙ to
 * switch or add one). Each game is a card with who you are in it; ＋ adds a game with a
 * spilnøgle from a parent, or one to play alone. A game can be taken off the device.
 */
export class GamesScene extends Phaser.Scene {
  private content!: GameContent;
  private step: Step = { kind: "list" };
  private ui: Phaser.GameObjects.GameObject[] = [];
  private keyInput?: Phaser.GameObjects.DOMElement;
  private saves = new Map<string, SaveData>();

  constructor() {
    super("Games");
  }

  create(data: GamesSceneData): void {
    this.content = data.content;
    this.step = listGames().length === 0 ? { kind: "add" } : { kind: "list" };
    onRelayout(this, () => this.draw());
    this.draw();
    void savesByGame().then((saves) => {
      this.saves = saves;
      this.draw();
    });
  }

  private go(step: Step): void {
    this.step = step;
    this.draw();
  }

  private clear(): void {
    for (const o of this.ui) o.destroy();
    this.ui = [];
    this.keyInput?.destroy();
    this.keyInput = undefined;
  }

  private text(x: number, y: number, value: string, size: number, color: string = CSS.text): void {
    const layout = getLayout(this);
    const style = { fontFamily: FONT, fontSize: layout.font(size), color, align: "center" as const, wordWrap: { width: layout.width - 40 } };
    this.ui.push(hasIcons(value) ? richText(this, x, y, value, style) : this.add.text(x, y, value, style).setOrigin(0.5));
  }

  private draw(): void {
    const typed = (this.keyInput?.node as HTMLInputElement | undefined)?.value;
    this.clear();
    const layout = getLayout(this);
    const { width, height } = layout;
    this.ui.push(...addScreenBackdrop(this, width, height));
    const step = this.step;
    // Back to the list from any other step — unless there is no list yet.
    if (step.kind !== "list" && step.kind !== "busy" && listGames().length > 0) {
      this.ui.push(addCloseButton(this, () => this.go({ kind: "list" })).button);
    }
    if (step.kind === "busy") return this.text(width / 2, height / 2, ic("hourglass"), 72);
    if (step.kind === "list") return this.drawList();
    if (step.kind === "add") return this.drawAdd();
    if (step.kind === "key") return this.drawKey(step.notice, typed);
    this.drawRemove(step.game);
  }

  private drawList(): void {
    const layout = getLayout(this);
    const { width, height, safe } = layout;
    const top = safe.top + layout.px(56);
    this.text(width / 2, top, t("games_title"), 38);
    const games = listGames();
    const count = games.length + 1; // + the add card
    const usableW = width - safe.left - safe.right - 24;
    const perRow = layout.portrait ? 2 : Math.min(4, count);
    const cellW = Math.min(250, usableW / perRow);
    const cardW = cellW - layout.px(18);
    // Each card has its remove button underneath, so the row is that much taller.
    const below = layout.touch(64) + layout.px(10);
    const rows = Math.ceil(count / perRow);
    const cardH = Math.min(cardW * 1.1, layout.px(260), (height - top - layout.px(60) - safe.bottom) / rows - below - layout.px(18));
    const spots = wrapGrid(count, cellW, cardH + below + layout.px(18), usableW, width / 2, (top + layout.px(40) + height - safe.bottom) / 2);
    games.forEach((game, i) => this.drawCard(game, spots[i]!.x, spots[i]!.y - below / 2, cardW, cardH));

    // ＋ : add a game.
    const { x } = spots[games.length]!;
    const y = spots[games.length]!.y - below / 2;
    const add = this.add.rectangle(x, y, cardW, cardH, C.panel, 0.55).setStrokeStyle(3, C.border, 0.35).setInteractive({ useHandCursor: true });
    add.on("pointerup", () => this.go({ kind: "add" }));
    this.ui.push(add, addIcon(this, x, y - cardH * 0.08, "plus", Math.min(cardW, cardH) * 0.42));
    this.text(x, y + cardH * 0.32, t("games_add"), 24, CSS.soft);
  }

  private drawCard(game: GameEntry, x: number, y: number, w: number, h: number): void {
    const layout = getLayout(this);
    const save = this.saves.get(game.id);
    const card = this.add.rectangle(x, y, w, h, C.panel, 0.95).setStrokeStyle(3, C.border, 0.6).setInteractive({ useHandCursor: true });
    card.on("pointerup", () => {
      this.go({ kind: "busy" });
      void startGame(this, game.id, this.content);
    });
    this.ui.push(card);
    // Online with others, or alone on this device.
    this.ui.push(addIcon(this, x - w / 2 + layout.px(26), y - h / 2 + layout.px(26), game.online ? "team" : "person", layout.px(36)));
    // A long name wraps onto two lines (clear of the icon), and only shrinks if it still doesn't fit.
    const nameW = w - 2 * (layout.px(26) + layout.px(18) + 8); // the icon's right edge, mirrored
    const name = this.add
      .text(x, y - h * 0.34, game.navn, { fontFamily: FONT, fontSize: layout.font(game.navn.length > 12 ? 20 : 26), color: CSS.text, align: "center", wordWrap: { width: nameW }, lineSpacing: -4 })
      .setOrigin(0.5);
    name.setScale(Math.min(1, nameW / name.width, (h * 0.26) / name.height));
    this.ui.push(name);
    const r = Math.min(w, h) * 0.2;
    if (save) {
      const colour = Phaser.Display.Color.HexStringToColor(save.player.farve).color;
      this.ui.push(this.add.circle(x, y + h * 0.02, r, colour).setStrokeStyle(3, C.border, 0.9), addAvatar(this, x, y + h * 0.02, save.player.avatarId, r * 1.7));
      this.text(x, y + h * 0.3, `${save.player.navn}  ${ic("paw")} ${save.creatures.length}`, 22, CSS.soft);
    } else {
      this.ui.push(addIcon(this, x, y + h * 0.02, "sparkle", r * 1.8));
      this.text(x, y + h * 0.3, t("games_new_player"), 22, CSS.soft);
    }
    // Take the game off this device (asks first) — under the card, away from the tap that opens it.
    const size = layout.touch(64);
    const trash = createButton(this, x, y + h / 2 + layout.px(10) + size / 2, ic("trash"), () => this.go({ kind: "remove", game }), {
      width: size,
      height: size,
      fontSize: `${Math.round(size * 0.4)}px`,
      backgroundColor: C.buttonQuiet,
    });
    this.ui.push(trash);
  }

  private drawAdd(): void {
    const layout = getLayout(this);
    const { width, height, safe } = layout;
    this.text(width / 2, height * 0.24, t("games_add_title"), 36);
    const buttonW = Math.min(320, width - safe.left - safe.right - 48);
    const buttonH = layout.touch(110);
    const gap = layout.px(28);
    this.ui.push(
      createButton(this, width / 2, height * 0.5, t("games_with_key"), () => this.go({ kind: "key" }), {
        width: buttonW,
        height: buttonH,
        fontSize: layout.font(26),
        icon: "key",
        backgroundColor: C.ok,
      }),
      createButton(this, width / 2, height * 0.5 + buttonH + gap, t("games_alone"), () => void this.addAlone(), {
        width: buttonW,
        height: buttonH,
        fontSize: layout.font(26),
        icon: "person",
      })
    );
  }

  private drawKey(notice: string | undefined, typed: string | undefined): void {
    const layout = getLayout(this);
    const { width, height } = layout;
    this.text(width / 2, height * 0.22, ic("key"), 64);
    this.text(width / 2, height * 0.22 + layout.px(70), notice ?? t("game_key_title"), 30, notice ? CSS.accent : CSS.soft);
    this.keyInput = this.add.dom(
      width / 2,
      height * 0.47,
      "input",
      `font-size:${layout.font(32)};width:${Math.min(360, width - 80)}px;padding:16px;border-radius:16px;border:none;text-align:center;`
    );
    const el = this.keyInput.node as HTMLInputElement;
    el.autocomplete = "off";
    el.autocapitalize = "off";
    el.spellcheck = false;
    el.setAttribute("autocorrect", "off");
    el.value = typed ?? "";
    this.ui.push(
      createButton(this, width / 2, height * 0.47 + layout.touch(72) + layout.px(30), "✓", () => void this.submitKey(el.value.trim()), {
        width: 140,
        height: layout.touch(72),
        fontSize: layout.font(36),
        backgroundColor: C.ok,
      })
    );
  }

  /** Looks the key up on the server, adds that game (or updates its key) and opens it. */
  private async submitKey(key: string): Promise<void> {
    if (!key) return;
    this.go({ kind: "busy" });
    const found = await lookupGame(key);
    if (!found.ok) return this.go({ kind: "key", notice: found.reason === "code" ? t("lobby_code_wrong") : t("lobby_offline") });
    const game = await addGame({ id: found.value.gameId, navn: found.value.navn, online: true, key });
    await startGame(this, game.id, this.content);
  }

  private async addAlone(): Promise<void> {
    const taken = new Set(listGames().map((g) => g.navn));
    let navn = t("games_alone_name");
    for (let n = 2; taken.has(navn); n++) navn = `${t("games_alone_name")} ${n}`;
    const game = await addGame({ id: `alene-${crypto.randomUUID().slice(0, 8)}`, navn, online: false });
    await startGame(this, game.id, this.content);
  }

  private drawRemove(game: GameEntry): void {
    const layout = getLayout(this);
    const { width, height } = layout;
    const save = this.saves.get(game.id);
    this.text(width / 2, height * 0.2, ic("trash"), 64);
    this.text(width / 2, height * 0.2 + layout.px(74), `${t("games_remove_title")} ${game.navn}?`, 32);
    if (save) {
      const r = layout.px(52);
      const colour = Phaser.Display.Color.HexStringToColor(save.player.farve).color;
      this.ui.push(this.add.circle(width / 2, height * 0.5, r, colour).setStrokeStyle(3, C.border, 0.9), addAvatar(this, width / 2, height * 0.5, save.player.avatarId, r * 1.7));
      this.text(width / 2, height * 0.5 + r + layout.px(28), `${save.player.navn}  ${ic("paw")} ${save.creatures.length}`, 24, CSS.soft);
    }
    // Online games have a backup on the server; a game alone is gone for good.
    this.text(width / 2, height * 0.7, game.online ? t("games_remove_online") : t("games_remove_alone"), 22, CSS.danger);
    const size = layout.touch(80);
    this.ui.push(
      createButton(this, width / 2 - size, height * 0.84, "✕", () => this.go({ kind: "list" }), { width: size * 1.4, height: size, fontSize: layout.font(34), backgroundColor: C.buttonQuiet }),
      createButton(this, width / 2 + size, height * 0.84, ic("trash"), () => void this.remove(game), { width: size * 1.4, height: size, fontSize: layout.font(30), backgroundColor: C.danger })
    );
  }

  private async remove(game: GameEntry): Promise<void> {
    await removeGame(game.id);
    this.saves.delete(game.id);
    this.go(listGames().length ? { kind: "list" } : { kind: "add" });
  }
}
