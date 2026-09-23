import Phaser from "phaser";
import { loadContent } from "../content/load-content";
import { generatePlaceholderSprites } from "../gfx/placeholder-sprites";
import { loadInitialState } from "../save/game-state";

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super("Preload");
  }

  create(): void {
    const content = loadContent();
    generatePlaceholderSprites(this, Object.values(content.speciesById));

    loadInitialState().then((save) => {
      if (save) {
        this.scene.start("Overworld", { save, content });
      } else {
        this.scene.start("Setup", { content });
      }
    });
  }
}
