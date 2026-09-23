import Phaser from "phaser";
import type { CreatureInstance, CreatureSpecies } from "@shared";
import type { SaveData } from "../save/schema";
import type { GameContent } from "../content/load-content";

export interface BattleSceneData {
  save: SaveData;
  content: GameContent;
  wildInstance: CreatureInstance;
  wildSpecies: CreatureSpecies;
}

export class BattleScene extends Phaser.Scene {
  constructor() {
    super("Battle");
  }

  create(data: BattleSceneData): void {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 2, `Kamp mod ${data.wildSpecies.navn}! (kommer snart)`, {
        fontFamily: "sans-serif",
        fontSize: "32px",
        color: "#ffffff",
      })
      .setOrigin(0.5);
  }
}
