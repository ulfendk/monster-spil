import type Phaser from "phaser";
import type { GameContent } from "../content/load-content";
import { loadGameState } from "../save/game-state";

const PICK_FLAG = "monsterjagt-vaelg-spil";

/** Enters a game and opens it: the map, or the setup when this device hasn't played it yet. */
export async function startGame(scene: Phaser.Scene, gameId: string, content: GameContent): Promise<void> {
  const save = await loadGameState(gameId);
  if (!save) scene.scene.start("Setup", { content });
  else if (save.creatures.length === 0) scene.scene.start("Starter", { content }); // set up, but no first monster yet
  else scene.scene.start("Overworld", { save, content });
}

/**
 * Switching games restarts the whole app (so nothing from the old game — its connection,
 * its scenes — lingers) and opens the game list instead of the last game.
 */
export function reloadToGameList(): void {
  try {
    sessionStorage.setItem(PICK_FLAG, "1");
  } catch {
    // Without storage the app just opens the last game; the list is one tap away in ⚙.
  }
  location.reload();
}

/** True (once) right after reloadToGameList. */
export function gameListRequested(): boolean {
  try {
    const wanted = sessionStorage.getItem(PICK_FLAG) === "1";
    sessionStorage.removeItem(PICK_FLAG);
    return wanted;
  } catch {
    return false;
  }
}
