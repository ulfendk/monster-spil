import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { PreloadScene } from "./scenes/PreloadScene";
import { SetupScene } from "./scenes/SetupScene";
import { StarterScene } from "./scenes/StarterScene";
import { OverworldScene } from "./scenes/OverworldScene";
import { BattleScene } from "./scenes/BattleScene";
import { MonsterbogScene } from "./scenes/MonsterbogScene";
import { InteractScene } from "./scenes/InteractScene";
import { SettingsScene } from "./scenes/SettingsScene";
import { keepAppUpToDate } from "./pwa-update";

keepAppUpToDate();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#1b1f3b",
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1024,
    height: 768,
  },
  dom: {
    createContainer: true,
  },
  scene: [BootScene, PreloadScene, SetupScene, StarterScene, OverworldScene, BattleScene, MonsterbogScene, InteractScene, SettingsScene],
});
