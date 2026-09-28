import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { PreloadScene } from "./scenes/PreloadScene";
import { SetupScene } from "./scenes/SetupScene";
import { RestoreScene } from "./scenes/RestoreScene";
import { GamesScene } from "./scenes/GamesScene";
import { StarterScene } from "./scenes/StarterScene";
import { OverworldScene } from "./scenes/OverworldScene";
import { BattleScene } from "./scenes/BattleScene";
import { MonsterbogScene } from "./scenes/MonsterbogScene";
import { MonsterInfoScene } from "./scenes/MonsterInfoScene";
import { InteractScene } from "./scenes/InteractScene";
import { SettingsScene } from "./scenes/SettingsScene";
import { ScoreboardScene } from "./scenes/ScoreboardScene";
import { CaveScene } from "./scenes/CaveScene";
import { MovedScene } from "./scenes/MovedScene";
import { ProfileScene } from "./scenes/ProfileScene";
import { CatchScene } from "./scenes/CatchScene";
import { WorldMapScene } from "./scenes/WorldMapScene";
import { HatchScene } from "./scenes/HatchScene";
import { NestScene } from "./scenes/NestScene";
import { TrophyScene } from "./scenes/TrophyScene";
import { GardenScene } from "./scenes/GardenScene";
import { CastleScene } from "./scenes/CastleScene";
import { ChopGame } from "./scenes/minigames/ChopGame";
import { DigGame } from "./scenes/minigames/DigGame";
import { keepAppUpToDate } from "./pwa-update";
import { CSS } from "./ui/theme";

keepAppUpToDate();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: CSS.ink,
  // See-through, so a cave's 3D canvas can show underneath (the page behind is the same ink).
  transparent: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1024,
    height: 768,
  },
  dom: {
    createContainer: true,
  },
  scene: [BootScene, PreloadScene, GamesScene, SetupScene, RestoreScene, StarterScene, OverworldScene, BattleScene, MonsterbogScene, MonsterInfoScene, InteractScene, SettingsScene, ScoreboardScene, CaveScene, MovedScene, ProfileScene, CatchScene, WorldMapScene, HatchScene, NestScene, TrophyScene, GardenScene, CastleScene, ChopGame, DigGame],
});

// Development only: lets automated checks drive scenes (e.g. at iPhone sizes) without guessing tap positions.
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
// Dev only: every monster's model on one sheet — `await __monsterSheet({ stage: 3 })` gives a canvas.
if (import.meta.env.DEV) {
  (window as unknown as { __monsterSheet: unknown }).__monsterSheet = async (opts: object = {}) => {
    const [{ monsterSheet }, { loadContent }] = await Promise.all([import("./dev/monster-sheet"), import("./content/load-content")]);
    return monsterSheet(Object.values(loadContent().speciesById), opts);
  };
  // …and one monster going its own way, frame by frame: `await __gaitStrip("sivsnog")`.
  (window as unknown as { __gaitStrip: unknown }).__gaitStrip = async (id: string, opts: object = {}) => {
    const [{ gaitStrip }, { loadContent }] = await Promise.all([import("./dev/gait-strip"), import("./content/load-content")]);
    return gaitStrip(loadContent().speciesById[id]!, opts);
  };
}
