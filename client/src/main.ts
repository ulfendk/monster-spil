import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { PreloadScene } from "./scenes/PreloadScene";
import { SetupScene } from "./scenes/SetupScene";
import { StarterScene } from "./scenes/StarterScene";
import { OverworldScene } from "./scenes/OverworldScene";
import { BattleScene } from "./scenes/BattleScene";
import { MonsterbogScene } from "./scenes/MonsterbogScene";
import { MonsterInfoScene } from "./scenes/MonsterInfoScene";
import { InteractScene } from "./scenes/InteractScene";
import { SettingsScene } from "./scenes/SettingsScene";
import { ScoreboardScene } from "./scenes/ScoreboardScene";
import { keepAppUpToDate } from "./pwa-update";
import { CSS } from "./ui/theme";

keepAppUpToDate();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: CSS.ink,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1024,
    height: 768,
  },
  dom: {
    createContainer: true,
  },
  scene: [BootScene, PreloadScene, SetupScene, StarterScene, OverworldScene, BattleScene, MonsterbogScene, MonsterInfoScene, InteractScene, SettingsScene, ScoreboardScene],
});

// Development only: lets automated checks drive scenes (e.g. at iPhone sizes) without guessing tap positions.
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
