import Phaser from "phaser";
import type { SaveData } from "../save/schema";
import type { GameContent } from "../content/load-content";
import { setState, persist } from "../save/game-state";
import { t } from "../i18n/da";
import { createButton } from "../ui/Button";
import { getLayout, onRelayout, wrapGrid } from "../ui/layout";

export interface SetupSceneData {
  content: GameContent;
}

const AVATARS = ["figur1", "figur2", "figur3", "figur4"] as const;
const COLOURS = ["#e63946", "#f4a261", "#e9c46a", "#2a9d8f", "#457b9d", "#9b5de5"];

type Step = "navn" | "figur" | "farve";

const TITLE_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: "sans-serif",
  fontSize: "36px",
  color: "#ffffff",
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
          .circle(x, y, 56, 0x2b2f52)
          .setStrokeStyle(this.avatarId === id ? 6 : 3, 0xffffff, this.avatarId === id ? 1 : 0.4);
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
        if (this.farve === hex) circle.setStrokeStyle(6, 0xffffff);
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
        return this.add.star(x, y, 5, 10, 22, 0xffce54);
      case 1:
        return this.add.triangle(x, y, 0, -22, -20, 16, 20, 16, 0x4cc9f0);
      case 2:
        return this.add.rectangle(x, y, 28, 28, 0xff6b6b).setRotation(Math.PI / 4);
      default:
        return this.add.circle(x, y, 20, 0x9bf6a0);
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
