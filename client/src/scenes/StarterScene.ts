import Phaser from "phaser";
import type { CreatureInstance, CreatureSpecies } from "@shared";
import type { GameContent } from "../content/load-content";
import { getState, persist } from "../save/game-state";
import { t } from "../i18n/da";

const STARTER_IDS = ["flammepels", "dryppel", "lovgro"];

const TITLE_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: "sans-serif",
  fontSize: "36px",
  color: "#ffffff",
};

const NAME_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: "sans-serif",
  fontSize: "24px",
  color: "#ffffff",
};

export interface StarterSceneData {
  content: GameContent;
}

export class StarterScene extends Phaser.Scene {
  private content!: GameContent;

  constructor() {
    super("Starter");
  }

  create(data: StarterSceneData): void {
    this.content = data.content;
    const { width, height } = this.scale;

    this.add.text(width / 2, height * 0.15, t("starter_title"), TITLE_STYLE).setOrigin(0.5);

    const spacing = 280;
    const startX = width / 2 - (spacing * (STARTER_IDS.length - 1)) / 2;

    STARTER_IDS.forEach((id, i) => {
      const species = this.content.speciesById[id];
      const x = startX + i * spacing;
      const y = height * 0.5;

      const sprite = this.add.image(x, y, species.spriteFront).setScale(1.3);
      sprite.setInteractive({ useHandCursor: true });
      sprite.on("pointerdown", () => this.chooseStarter(species));

      this.add.text(x, y + 100, species.navn, NAME_STYLE).setOrigin(0.5);
    });
  }

  private chooseStarter(species: CreatureSpecies): void {
    const save = getState();
    if (!save) return;

    const instance: CreatureInstance = {
      instanceId: crypto.randomUUID(),
      speciesId: species.id,
      ownerId: save.player.id,
      niveau: 1,
      currentHp: species.baseStats.hp,
      caughtAt: new Date().toISOString(),
    };

    save.creatures.push(instance);
    if (!save.seenSpeciesIds.includes(species.id)) {
      save.seenSpeciesIds.push(species.id);
    }

    persist().then(() => {
      this.scene.start("Overworld", { save, content: this.content });
    });
  }
}
