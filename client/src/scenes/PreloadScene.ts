import Phaser from "phaser";
import type { GameContent } from "../content/load-content";
import { loadContent } from "../content/load-content";
import { contentAssets } from "../content/load-assets";
import { cryKey } from "../audio/creature-sound";
import { bossesById } from "../content/load-raid";
import { bossSpecies } from "@shared";
import { generatePlaceholderSprites } from "../gfx/placeholder-sprites";
import { generateAvatarTextures } from "../gfx/avatar-sprites";
import { generateIcons } from "../gfx/icon-art";
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
    for (const species of [...Object.values(this.content.speciesById), ...Object.values(bossesById).map(bossSpecies)]) {
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
    const bosses = Object.values(bossesById);
    const dragonIds = new Set([...bosses.map((b) => b.id), ...bosses.map((b) => b.rewardSpeciesId)]);
    generatePlaceholderSprites(this, [...Object.values(content.speciesById), ...bosses.map(bossSpecies)], dragonIds);
    generateAvatarTextures(this);
    generateIcons(this);

    loadInitialState().then((save) => {
      if (save) {
        this.scene.start("Overworld", { save, content });
      } else {
        this.scene.start("Setup", { content });
      }
    });
  }
}
