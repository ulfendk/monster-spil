import Phaser from "phaser";
import type { CreatureInstance, CreatureSpecies } from "@shared";
import type { GameContent } from "../content/load-content";
import { getState, persist } from "../save/game-state";
import { t } from "../i18n/da";
import { getLayout, restartOnResize, wrapGrid } from "../ui/layout";
import { CSS, FONT } from "../ui/theme";
import { addScreenBackdrop } from "../gfx/motifs";

const STARTER_IDS = ["flammepels", "dryppel", "lovgro"];

const TITLE_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: FONT,
  fontSize: "36px",
  color: CSS.text,
};

const NAME_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: FONT,
  fontSize: "24px",
  color: CSS.text,
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
    restartOnResize(this, data);
    const layout = getLayout(this);
    const { width, height, safe } = layout;

    const titleY = safe.top + height * 0.1;
    addScreenBackdrop(this, width, height, { sun: { x: width / 2, y: titleY, r: Math.min(width, height) * 0.16 } });
    this.add.text(width / 2, titleY, t("starter_title"), { ...TITLE_STYLE, fontSize: layout.font(36) }).setOrigin(0.5);

    // Three in a row on a wide screen, stacked on a portrait phone.
    const itemW = Math.min(280, (width - safe.left - safe.right) / (layout.portrait ? 1 : 3));
    const areaTop = titleY + layout.px(50);
    const itemH = Math.min(260, (height - safe.bottom - areaTop) / (layout.portrait ? 3 : 1));
    const spots = wrapGrid(STARTER_IDS.length, itemW, itemH, width - safe.left - safe.right, width / 2, (areaTop + height - safe.bottom) / 2);
    const scale = Math.min(1.3, (itemH * 0.62) / 128);

    STARTER_IDS.forEach((id, i) => {
      const species = this.content.speciesById[id];
      const { x, y } = spots[i]!;

      const sprite = this.add.image(x, y - itemH * 0.08, species.spriteFront).setScale(scale);
      sprite.setInteractive({ useHandCursor: true });
      sprite.on("pointerdown", () => this.chooseStarter(species));

      this.add.text(x, y - itemH * 0.08 + 64 * scale + layout.px(24), species.navn, { ...NAME_STYLE, fontSize: layout.font(24) }).setOrigin(0.5);
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
