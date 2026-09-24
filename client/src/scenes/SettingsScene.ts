import Phaser from "phaser";
import { presence } from "../net/presence";
import { setFamilyCode } from "../net/lobby";
import { t } from "../i18n/da";
import { addCloseButton, createButton } from "../ui/Button";
import { getLayout, onRelayout } from "../ui/layout";
import { C, CSS, FONT } from "../ui/theme";
import { addSeigaiha } from "../gfx/motifs";
import { hasIcons, ic, richText } from "../ui/rich-text";

const GREY = C.buttonQuiet;

/** Connection state and the family-code entry (🔑), opened from the ⚙ button on the map. */
export class SettingsScene extends Phaser.Scene {
  private ui!: Phaser.GameObjects.Container;
  private codeInput?: Phaser.GameObjects.DOMElement;
  private enteringCode = false;
  private typed = "";
  private closing = false;
  private off?: () => void;

  constructor() {
    super("Settings");
  }

  init(): void {
    this.closing = false;
    // A missing or rejected code goes straight to the entry screen.
    this.enteringCode = presence.status === "needCode";
  }

  create(): void {

    this.ui = this.add.container(0, 0);

    const redraw = () => this.requestDraw();
    presence.events.on("status", redraw);
    presence.events.on("players", redraw);
    presence.events.on("backup", redraw);
    this.off = () => {
      presence.events.off("status", redraw);
      presence.events.off("players", redraw);
      presence.events.off("backup", redraw);
    };
    this.events.once("shutdown", () => this.off?.());
    onRelayout(this, () => {
      // Keep a half-typed family code across the redraw.
      this.typed = (this.codeInput?.node as HTMLInputElement | undefined)?.value ?? "";
      this.requestDraw();
    });
    this.requestDraw();
  }

  private close(): void {
    if (this.closing) return;
    this.closing = true;
    this.codeInput?.destroy();
    this.off?.();
    this.scene.stop();
    this.scene.resume("Overworld");
  }

  private requestDraw(): void {
    if (this.closing) return;
    this.time.delayedCall(0, () => {
      if (!this.closing) this.draw();
    });
  }

  private draw(): void {
    this.codeInput?.destroy();
    this.codeInput = undefined;
    this.ui.removeAll(true);
    const layout = getLayout(this);
    const { width, height } = layout;
    // Redrawn with the rest, so it always covers the whole screen; also swallows taps meant for the map underneath.
    this.ui.add(this.add.rectangle(0, 0, width, height, C.overlay, 0.9).setOrigin(0, 0).setInteractive());
    this.ui.add(addSeigaiha(this, 0, height * 0.66, width, height * 0.34));
    this.ui.add(addCloseButton(this, () => this.close()).button);

    if (this.enteringCode) return this.drawCodeEntry();

    const symbol = ic({ online: "online", connecting: "hourglass", offline: "offline", needCode: "key", off: "offline" }[presence.status]);
    this.addText(width / 2, height / 2 - 90, symbol, 96);
    if (presence.status === "online") {
      const others = presence.players.size;
      this.addText(width / 2, height / 2, others === 0 ? t("lobby_alone") : `${ic("team")} ${others}`, 32, CSS.soft);
      if (presence.serverVersion === "old" || (typeof presence.serverVersion === "number" && !presence.backupSupported)) {
        this.addText(width / 2, height / 2 + 50, t("lobby_server_old"), 26, CSS.accent);
      } else if (presence.lastBackupAt) {
        // When this device's save was last copied to the family server (safe to reinstall).
        const at = new Date(presence.lastBackupAt).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
        this.addText(width / 2, height / 2 + 50, `${ic("save")} ${t("backup_saved")} ${at}`, 24, CSS.soft);
      }
    } else if (presence.status === "offline") {
      this.addText(width / 2, height / 2, t("lobby_offline"), 32, CSS.soft);
    }
    this.addButton(layout.safe.left + 16 + 45, height - layout.safe.bottom - 16 - 36, ic("key"), () => {
      this.enteringCode = true;
      this.requestDraw();
    }, 72, GREY);
  }

  private drawCodeEntry(): void {
    const { width, height } = this.scale;
    this.addText(width / 2, height * 0.25, ic("key"), 80);
    this.addText(width / 2, height * 0.25 + 70, presence.notice ?? t("lobby_code_title"), 30, presence.notice ? CSS.accent : CSS.soft);
    this.codeInput = this.add.dom(
      width / 2,
      height * 0.5,
      "input",
      `font-size:${getLayout(this).font(32)};width:${Math.min(360, width - 80)}px;padding:16px;border-radius:16px;border:none;text-align:center;`
    );
    const el = this.codeInput.node as HTMLInputElement;
    el.value = this.typed;
    el.type = "password";
    el.autocomplete = "off";
    el.autocapitalize = "off";
    el.setAttribute("autocorrect", "off");
    this.addButton(width / 2, height * 0.5 + 110, "✓", () => {
      const code = el.value.trim();
      if (!code) return;
      setFamilyCode(code);
      this.enteringCode = false;
      presence.reconnect();
      this.requestDraw();
    }, 120);
  }

  private addText(x: number, y: number, text: string, size: number, color = CSS.text): void {
    const style = { fontFamily: FONT, fontSize: `${size}px`, color };
    this.ui.add(hasIcons(text) ? richText(this, x, y, text, style) : this.add.text(x, y, text, style).setOrigin(0.5));
  }

  private addButton(x: number, y: number, label: string, onTap: () => void, width: number, color?: number): void {
    this.ui.add(createButton(this, x, y, label, onTap, { width, height: 72, fontSize: "36px", backgroundColor: color }));
  }
}
