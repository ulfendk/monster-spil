import Phaser from "phaser";
import type { GameContent } from "../content/load-content";
import type { SaveData } from "../save/schema";
import { createButton } from "../ui/Button";

export interface MonsterbogSceneData {
  content: GameContent;
  save: SaveData;
}

const CELL_SIZE = 170;
const COLUMNS = 3;

export class MonsterbogScene extends Phaser.Scene {
  constructor() {
    super("Monsterbog");
  }

  create(data: MonsterbogSceneData): void {
    const { width, height } = this.scale;

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0, 0);
    overlay.setInteractive(); // swallow taps so they don't reach the paused Overworld underneath

    this.add.text(width / 2, 36, "Monsterbog", { fontFamily: "sans-serif", fontSize: "36px", color: "#ffffff" }).setOrigin(0.5, 0);

    const speciesList = Object.values(data.content.speciesById);
    const caughtIds = new Set(data.save.creatures.map((c) => c.speciesId));

    const gridWidth = COLUMNS * CELL_SIZE;
    const startX = width / 2 - gridWidth / 2 + CELL_SIZE / 2;
    const startY = 150;

    speciesList.forEach((species, i) => {
      const col = i % COLUMNS;
      const row = Math.floor(i / COLUMNS);
      const x = startX + col * CELL_SIZE;
      const y = startY + row * CELL_SIZE;
      const caught = caughtIds.has(species.id);
      const seen = data.save.seenSpeciesIds.includes(species.id);

      this.add.circle(x, y, 58, 0x2b2f52).setStrokeStyle(3, 0xffffff, caught ? 1 : 0.4);

      if (caught) {
        this.add.image(x, y, species.spriteFront);
        this.add
          .text(x, y + 72, species.navn, { fontFamily: "sans-serif", fontSize: "18px", color: "#ffffff" })
          .setOrigin(0.5);
      } else if (seen) {
        this.add.image(x, y, species.spriteFront).setTint(0x000000);
        this.add
          .text(x, y + 72, species.navn, { fontFamily: "sans-serif", fontSize: "18px", color: "#777777" })
          .setOrigin(0.5);
      } else {
        this.add
          .text(x, y, "?", { fontFamily: "sans-serif", fontSize: "48px", color: "#555555" })
          .setOrigin(0.5);
      }
    });

    createButton(this, width - 90, 50, "X", () => this.closeBook(), {
      width: 72,
      height: 64,
      fontSize: "28px",
      backgroundColor: 0x555555,
    });
  }

  private closeBook(): void {
    this.scene.stop();
    this.scene.resume("Overworld");
  }
}
