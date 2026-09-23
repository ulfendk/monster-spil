import Phaser from "phaser";
import { loadInitialState } from "../save/game-state";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  create(): void {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 2, "Monsterjagt", {
        fontFamily: "sans-serif",
        fontSize: "64px",
        color: "#ffce54",
      })
      .setOrigin(0.5);

    loadInitialState().then((save) => {
      if (save) {
        this.scene.start("Overworld", { save });
      } else {
        this.scene.start("Setup");
      }
    });
  }
}
