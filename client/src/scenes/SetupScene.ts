import Phaser from "phaser";
import type { SaveData } from "../save/schema";
import { setState, persist } from "../save/game-state";
import { t } from "../i18n/da";
import { createButton } from "../ui/Button";

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

  constructor() {
    super("Setup");
  }

  create(): void {
    this.step = "navn";
    this.navn = "";
    this.avatarId = "";
    this.farve = "";
    this.renderStep();
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
    const { width, height } = this.scale;

    if (this.step === "navn") {
      this.stepChildren.push(
        this.add.text(width / 2, height * 0.25, t("setup_title_navn"), TITLE_STYLE).setOrigin(0.5)
      );
      this.nameInput = this.add.dom(
        width / 2,
        height * 0.45,
        "input",
        "font-size:32px;width:360px;padding:16px;border-radius:16px;border:none;text-align:center;"
      );
      const el = this.nameInput.node as HTMLInputElement;
      el.placeholder = t("setup_placeholder_navn");
      el.maxLength = 12;
      el.value = this.navn;
    } else if (this.step === "figur") {
      this.stepChildren.push(
        this.add.text(width / 2, height * 0.2, t("setup_title_figur"), TITLE_STYLE).setOrigin(0.5)
      );
      const spacing = 160;
      const startX = width / 2 - (spacing * (AVATARS.length - 1)) / 2;
      AVATARS.forEach((id, i) => {
        const x = startX + i * spacing;
        const y = height * 0.5;
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
        this.add.text(width / 2, height * 0.2, t("setup_title_farve"), TITLE_STYLE).setOrigin(0.5)
      );
      const spacing = 110;
      const startX = width / 2 - (spacing * (COLOURS.length - 1)) / 2;
      COLOURS.forEach((hex, i) => {
        const x = startX + i * spacing;
        const y = height * 0.5;
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
    this.nextButton = createButton(
      this,
      width - 140,
      height - 100,
      isLast ? t("setup_start") : t("setup_next"),
      () => this.onNext()
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
      position: { areaId: "startskoven", x: 0, y: 0 },
      createdAt: now,
      updatedAt: now,
    };
    setState(save);
    persist().then(() => {
      this.scene.start("Starter");
    });
  }
}
