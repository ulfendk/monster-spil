import Phaser from "phaser";
import type { GameContent } from "../content/load-content";
import { loadContent } from "../content/load-content";
import { contentAssets } from "../content/load-assets";
import { cryKey } from "../audio/creature-sound";
import { generatePlaceholderSprites } from "../gfx/placeholder-sprites";
import { loadInitialState } from "../save/game-state";

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super("Preload");
  }

  private content!: GameContent;

  /**
   * Loads any real pictures and sounds shipped for the monsters. Anything without a
   * file is skipped here and covered by the placeholder sprite / fallback blip.
   */
  preload(): void {
    this.content = loadContent();
    for (const species of Object.values(this.content.speciesById)) {
      for (const key of [species.spriteFront, species.spriteBack]) {
        const url = contentAssets[key];
        if (url) this.load.image(key, url);
      }
      const sound = species.sound ? contentAssets[species.sound] : undefined;
      if (sound) this.load.audio(cryKey(species.id), sound);
    }
  }

  create(): void {
    const content = this.content;
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
