import Phaser from "phaser";
import type { SaveData } from "../save/schema";
import type { GameContent } from "../content/load-content";
import { setState, persist } from "../save/game-state";
import { t } from "../i18n/da";
import { createButton } from "../ui/Button";
import { C, CSS, FONT, KANAGAWA, PLAYER_COLOURS } from "../ui/theme";
import { getLayout, onRelayout, wrapGrid } from "../ui/layout";
import { addScreenBackdrop } from "../gfx/motifs";

export interface SetupSceneData {
  content: GameContent;
}

const AVATARS = ["figur1", "figur2", "figur3", "figur4"] as const;
const COLOURS = PLAYER_COLOURS;

type Step = "navn" | "figur" | "farve";

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
    this.step = "navn";
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
        this.add.text(width / 2, height * 0.2, t("setup_title_figur"), title).setOrigin(0.5)
      );
      const spots = wrapGrid(AVATARS.length, 160, 150, usableW, width / 2, height * 0.48);
      AVATARS.forEach((id, i) => {
        const { x, y } = spots[i]!;
        const circle = this.add
          .circle(x, y, 56, C.panel)
          .setStrokeStyle(this.avatarId === id ? 6 : 3, this.avatarId === id ? C.accent : C.border, this.avatarId === id ? 1 : 0.4);
        this.stepChildren.push(circle, this.drawAvatarIcon(i, x, y));

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

  /** Each avatar gets a distinct accent shape so the 4 options are tellable apart. */
  private drawAvatarIcon(index: number, x: number, y: number): Phaser.GameObjects.GameObject {
    switch (index) {
      case 0:
        return this.add.star(x, y, 5, 10, 22, KANAGAWA.carpYellow);
      case 1:
        return this.add.triangle(x, y, 0, -22, -20, 16, 20, 16, KANAGAWA.springBlue);
      case 2:
        return this.add.rectangle(x, y, 28, 28, KANAGAWA.waveRed).setRotation(Math.PI / 4);
      default:
        return this.add.circle(x, y, 20, KANAGAWA.springGreen);
    }
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
