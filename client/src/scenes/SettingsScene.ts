import Phaser from "phaser";
import { presence } from "../net/presence";
import { setFamilyCode } from "../net/lobby";
import { t } from "../i18n/da";
import { createButton } from "../ui/Button";

const FONT = "sans-serif";
const GREY = 0x555555;

/** Connection state and the family-code entry (🔑), opened from the ⚙ button on the map. */
export class SettingsScene extends Phaser.Scene {
  private ui!: Phaser.GameObjects.Container;
  private codeInput?: Phaser.GameObjects.DOMElement;
  private enteringCode = false;
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
    const { width, height } = this.scale;
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.85).setOrigin(0, 0);
    overlay.setInteractive(); // swallow taps so they don't reach the paused Overworld underneath
    this.ui = this.add.container(0, 0);

    const redraw = () => this.requestDraw();
    presence.events.on("status", redraw);
    presence.events.on("players", redraw);
    this.off = () => {
      presence.events.off("status", redraw);
      presence.events.off("players", redraw);
    };
    this.events.once("shutdown", () => this.off?.());
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
    const { width, height } = this.scale;
    this.addButton(width - 90, 50, "X", () => this.close(), 72, GREY);

    if (this.enteringCode) return this.drawCodeEntry();

    const symbol = { online: "🟢", connecting: "⏳", offline: "📵", needCode: "🔑", off: "📵" }[presence.status];
    this.addText(width / 2, height / 2 - 90, symbol, 96);
    if (presence.status === "online") {
      const others = presence.players.size;
      this.addText(width / 2, height / 2, others === 0 ? t("lobby_alone") : `👥 ${others}`, 32, "#cccccc");
      if (presence.serverVersion === "old" || (typeof presence.serverVersion === "number" && !presence.worldSupported)) {
        this.addText(width / 2, height / 2 + 50, t("lobby_server_old"), 26, "#ffce54");
      }
    } else if (presence.status === "offline") {
      this.addText(width / 2, height / 2, t("lobby_offline"), 32, "#cccccc");
    }
    this.addButton(90, height - 50, "🔑", () => {
      this.enteringCode = true;
      this.requestDraw();
    }, 72, GREY);
  }

  private drawCodeEntry(): void {
    const { width, height } = this.scale;
    this.addText(width / 2, height * 0.25, "🔑", 80);
    this.addText(width / 2, height * 0.25 + 70, presence.notice ?? t("lobby_code_title"), 30, presence.notice ? "#ffce54" : "#cccccc");
    this.codeInput = this.add.dom(
      width / 2,
      height * 0.5,
      "input",
      "font-size:32px;width:360px;padding:16px;border-radius:16px;border:none;text-align:center;"
    );
    const el = this.codeInput.node as HTMLInputElement;
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

  private addText(x: number, y: number, text: string, size: number, color = "#ffffff"): void {
    this.ui.add(this.add.text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color }).setOrigin(0.5));
  }

  private addButton(x: number, y: number, label: string, onTap: () => void, width: number, color?: number): void {
    this.ui.add(createButton(this, x, y, label, onTap, { width, height: 72, fontSize: "36px", backgroundColor: color }));
  }
}
