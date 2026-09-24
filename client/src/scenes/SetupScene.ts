import Phaser from "phaser";
import type { SaveData } from "../save/schema";
import type { GameContent } from "../content/load-content";
import { setState, persist } from "../save/game-state";
import { t } from "../i18n/da";
import { addCloseButton, createButton } from "../ui/Button";
import { C, CSS, FONT, KANAGAWA, PLAYER_COLOURS } from "../ui/theme";
import { getLayout, onRelayout, wrapGrid } from "../ui/layout";
import { addScreenBackdrop } from "../gfx/motifs";
import { AVATARS } from "../ui/avatars";
import { addAvatar } from "../gfx/avatar-sprites";
import { multiplayerEnabled } from "../net/lobby";
import { currentGame } from "../save/games";

export interface SetupSceneData {
  content: GameContent;
}

const COLOURS = PLAYER_COLOURS;

/** "start" (only in an online game): new player, or fetch a backed-up one. */
type Step = "start" | "navn" | "figur" | "farve";

const TITLE_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: FONT,
  fontSize: "36px",
  color: CSS.text,
};

export class SetupScene extends Phaser.Scene {
  private step: Step = "navn";
  private navn = "";
  private avatarId = "";
  private farve = "";
  private nameInput?: Phaser.GameObjects.DOMElement;
  private stepChildren: Phaser.GameObjects.GameObject[] = [];
  private nextButton?: Phaser.GameObjects.Container;
  private content!: GameContent;

  constructor() {
    super("Setup");
  }

  create(data: SetupSceneData): void {
    this.content = data.content;
    this.step = currentGame()?.online ? "start" : "navn";
    this.navn = "";
    this.avatarId = "";
    this.farve = "";
    this.renderStep();
    onRelayout(this, () => {
      if (this.step === "navn") this.navn = this.readName(); // keep what was typed
      this.renderStep();
    });
  }

  private clearStep(): void {
    for (const child of this.stepChildren) child.destroy();
    this.stepChildren = [];
    this.nameInput?.destroy();
    this.nameInput = undefined;
    this.nextButton?.destroy();
    this.nextButton = undefined;
  }

  private renderStep(): void {
    this.clearStep();
    for (const o of addScreenBackdrop(this, this.scale.width, this.scale.height, { sun: { x: this.scale.width / 2, y: this.scale.height * 0.22, r: Math.min(this.scale.width, this.scale.height) * 0.16 } })) this.stepChildren.push(o);
    const layout = getLayout(this);
    const { width, height, safe } = layout;
    const title = { ...TITLE_STYLE, fontSize: layout.font(36) };
    const usableW = width - safe.left - safe.right - 32;
    // Changed your mind about this game: back to the game list (builds with a server only).
    if (multiplayerEnabled) this.stepChildren.push(addCloseButton(this, () => this.scene.start("Games", { content: this.content })).button);

    if (this.step === "start") {
      // Played before (on this or another device)? Fetch your player from the game server.
      this.stepChildren.push(this.add.text(width / 2, height * 0.25, t("setup_title_start"), title).setOrigin(0.5));
      const buttonW = Math.min(300, usableW);
      const buttonH = layout.touch(96);
      const fresh = createButton(this, width / 2, height * 0.46, t("setup_new"), () => {
        this.step = "navn";
        this.renderStep();
      }, { width: buttonW, height: buttonH, fontSize: layout.font(26), icon: "sparkle", backgroundColor: C.ok });
      const restore = createButton(this, width / 2, height * 0.46 + buttonH + layout.px(24), t("setup_restore"), () => {
        this.scene.start("Restore", { content: this.content });
      }, { width: buttonW, height: buttonH, fontSize: layout.font(26), icon: "refresh" });
      this.stepChildren.push(fresh, restore);
      return;
    }

    if (this.step === "navn") {
      this.stepChildren.push(
        this.add.text(width / 2, height * 0.25, t("setup_title_navn"), title).setOrigin(0.5)
      );
      this.nameInput = this.add.dom(
        width / 2,
        height * 0.42,
        "input",
        `font-size:${layout.font(32)};width:${Math.min(360, usableW - 40)}px;padding:16px;border-radius:16px;border:none;text-align:center;`
      );
      const el = this.nameInput.node as HTMLInputElement;
      el.placeholder = t("setup_placeholder_navn");
      el.maxLength = 12;
      el.value = this.navn;
    } else if (this.step === "figur") {
      this.stepChildren.push(
        this.add.text(width / 2, height * 0.17, t("setup_title_figur"), title).setOrigin(0.5),
        // What the choice is for, in one short line.
        this.add.text(width / 2, height * 0.17 + layout.px(48), t("setup_figur_hint"), { ...title, fontSize: layout.font(24), color: CSS.soft }).setOrigin(0.5)
      );
      const spots = wrapGrid(AVATARS.length, 150, 160, usableW, width / 2, height * 0.54);
      AVATARS.forEach(({ id, navn }, i) => {
        const { x, y } = spots[i]!;
        const chosen = this.avatarId === id;
        const circle = this.add
          .circle(x, y, 56, C.panel)
          .setStrokeStyle(chosen ? 6 : 3, chosen ? C.accent : C.border, chosen ? 1 : 0.4);
        const face = addAvatar(this, x, y, id, 100);
        const label = this.add.text(x, y + 72, navn, { fontFamily: FONT, fontSize: layout.font(22), color: chosen ? CSS.accent : CSS.soft }).setOrigin(0.5);
        this.stepChildren.push(circle, face, label);

        circle.setInteractive({ useHandCursor: true });
        circle.on("pointerdown", () => {
          this.avatarId = id;
          this.renderStep();
        });
      });
    } else {
      this.stepChildren.push(
        this.add.text(width / 2, height * 0.2, t("setup_title_farve"), title).setOrigin(0.5)
      );
      const spots = wrapGrid(COLOURS.length, 115, 115, usableW, width / 2, height * 0.48);
      COLOURS.forEach((hex, i) => {
        const { x, y } = spots[i]!;
        const colorNum = Phaser.Display.Color.HexStringToColor(hex).color;
        const circle = this.add.circle(x, y, 48, colorNum);
        if (this.farve === hex) circle.setStrokeStyle(6, C.accent);
        // The chosen animal on every colour: this is how you will look on the map.
        this.stepChildren.push(addAvatar(this, x, y, this.avatarId, 84).setDepth(1));
        circle.setInteractive({ useHandCursor: true });
        circle.on("pointerdown", () => {
          this.farve = hex;
          this.renderStep();
        });
        this.stepChildren.push(circle);
      });
    }

    const isLast = this.step === "farve";
    const buttonW = Math.min(220, usableW);
    const buttonH = layout.touch(72);
    this.nextButton = createButton(
      this,
      width - safe.right - 16 - buttonW / 2,
      height - safe.bottom - 24 - buttonH / 2,
      isLast ? t("setup_start") : t("setup_next"),
      () => this.onNext(),
      { width: buttonW, height: buttonH, fontSize: layout.font(28) }
    );
  }

  private readName(): string {
    const el = this.nameInput?.node as HTMLInputElement | undefined;
    return el?.value.trim() ?? "";
  }

  private onNext(): void {
    if (this.step === "navn") {
      this.navn = this.readName();
      if (!this.navn) return;
      this.step = "figur";
      this.renderStep();
    } else if (this.step === "figur") {
      if (!this.avatarId) return;
      this.step = "farve";
      this.renderStep();
    } else {
      if (!this.farve) return;
      this.finishSetup();
    }
  }

  private finishSetup(): void {
    const now = new Date().toISOString();
    const save: SaveData = {
      version: 1,
      player: {
        id: crypto.randomUUID(),
        navn: this.navn,
        avatarId: this.avatarId,
        farve: this.farve,
      },
      creatures: [],
      seenSpeciesIds: [],
      caughtCounts: {},
      pendingScore: [],
      bag: [],
      position: { areaId: "startskoven", x: 0, y: 0 },
      createdAt: now,
      updatedAt: now,
    };
    setState(save);
    persist().then(() => {
      this.scene.start("Starter", { content: this.content });
    });
  }
}
