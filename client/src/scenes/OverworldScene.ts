import Phaser from "phaser";
import type { SaveData } from "../save/schema";
import type { GameContent } from "../content/load-content";

export interface OverworldSceneData {
  save: SaveData;
  content: GameContent;
}

export class OverworldScene extends Phaser.Scene {
  constructor() {
    super("Overworld");
  }

  create(data: OverworldSceneData): void {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 2, `Velkommen tilbage, ${data.save.player.navn}!\n(Overworld kommer snart)`, {
        fontFamily: "sans-serif",
        fontSize: "28px",
        color: "#ffffff",
        align: "center",
      })
      .setOrigin(0.5);
  }
}
