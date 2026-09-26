import Phaser from "phaser";
import { getLayout, restartOnResize } from "../ui/layout";
import { createButton } from "../ui/Button";
import { ic, richText } from "../ui/rich-text";
import { addScreenBackdrop } from "../gfx/motifs";
import { C, CSS, FONT } from "../ui/theme";
import { t } from "../i18n/da";
import { movedTo, moveUrl, prepareMove } from "../save/move";

/**
 * The only screen of an old build once the game lives at a new address (VITE_MOVED_TO):
 * it says so, shows the address, and one big button takes the player along — each game's
 * save goes to the server, which hands back one-time codes, and the new address opens
 * with them and restores everything (see save/move.ts). Nothing else can be played here,
 * so nobody keeps playing on at the old address and loses it later.
 */
export class MovedScene extends Phaser.Scene {
  private busy = false;

  constructor() {
    super("Moved");
  }

  create(): void {
    this.busy = false;
    const layout = getLayout(this);
    const { width, height } = layout;
    addScreenBackdrop(this, width, height, { sun: { x: width / 2, y: height * 0.22, r: Math.min(width, height) * 0.16 } });
    richText(this, width / 2, height * 0.22, ic("door"), { fontFamily: FONT, fontSize: layout.font(72), color: CSS.text });
    this.add.text(width / 2, height * 0.4, t("moved_title"), { fontFamily: FONT, fontSize: layout.font(44), color: CSS.accent }).setOrigin(0.5);
    const address = (movedTo ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
    this.add
      .text(width / 2, height * 0.5, address, { fontFamily: FONT, fontSize: layout.font(28), color: CSS.text, align: "center", wordWrap: { width: width - layout.safe.left - layout.safe.right - 40 } })
      .setOrigin(0.5);
    const status = this.add.text(width / 2, height * 0.8, t("moved_home"), { fontFamily: FONT, fontSize: layout.font(22), color: CSS.soft, align: "center" }).setOrigin(0.5);
    const button = createButton(this, width / 2, height * 0.65, `${ic("door")} ${t("moved_go")}`, () => void this.go(status), {
      width: layout.touch(300),
      height: layout.touch(84),
      fontSize: layout.font(34),
      backgroundColor: C.ok,
    });
    void button;
    restartOnResize(this);
  }

  private async go(status: Phaser.GameObjects.Text): Promise<void> {
    if (this.busy || !movedTo) return;
    this.busy = true;
    status.setText(t("moved_moving")).setColor(CSS.accent);
    const codes = await prepareMove();
    if (!codes) {
      // Offline, or the server said no: nothing has been lost, the save is still here.
      this.busy = false;
      status.setText(t("moved_failed")).setColor(CSS.danger);
      return;
    }
    window.location.href = moveUrl(codes);
  }
}
