import Phaser from "phaser";
import { getLayout, restartOnResize, type Layout } from "../../ui/layout";
import { addCloseButton } from "../../ui/Button";
import { ic, richChip, richText } from "../../ui/rich-text";
import { addScreenBackdrop } from "../../gfx/motifs";
import { CSS, FONT } from "../../ui/theme";

/** Where the hint sits: just below the row of the ✕ button. */
export function hintY(layout: Layout): number {
  return layout.safe.top + layout.touch(64) + layout.px(30);
}

/** Where a game's strength bar sits: below the hint. */
export function barY(layout: Layout): number {
  return hintY(layout) + layout.px(56);
}

/** What every minigame gets: who plays (for the figure), how big the task is, and whom to tell how it went. */
export interface MinigameData {
  avatarId: string;
  farve: string;
  /** How much there is to do: tiles of water or mountain to cross (at least 1). */
  size?: number;
  /** Called once, when the game ends: done or not (✕ or ran out of breath). */
  done: (success: boolean) => void;
}

/**
 * The frame every minigame shares: a full screen over the map (which is paused), a hint at
 * the top, ✕ to give up, and a short result before it hands back to the map. A game draws
 * itself in `build` and calls `finish` when it's over. Every game is played by tapping —
 * the youngest player is 6 — and restarts cleanly after a rotation.
 */
export abstract class Minigame extends Phaser.Scene {
  protected play!: MinigameData;
  private over = false;

  init(data: MinigameData): void {
    this.play = data;
    this.over = false;
  }

  create(): void {
    const layout = getLayout(this);
    addScreenBackdrop(this, layout.width, layout.height);
    this.build(layout);
    // Below the ✕ button's row, so a long hint never runs under it on a narrow phone.
    richChip(this, layout.width / 2, hintY(layout), this.hint(), { fontFamily: FONT, fontSize: layout.font(26), color: CSS.accent }).setDepth(20);
    addCloseButton(this, () => this.finish(false));
    restartOnResize(this, this.play);
  }

  protected abstract hint(): string;
  protected abstract build(layout: Layout): void;

  /** Ends the game: a short message (if any), then back to the map. */
  protected finish(success: boolean, message?: string, icon = success ? "cheer" : "faint"): void {
    if (this.over) return;
    this.over = true;
    const layout = getLayout(this);
    if (message) {
      richText(this, layout.width / 2, layout.height / 2, `${ic(icon)} ${message}`, { fontFamily: FONT, fontSize: layout.font(40), color: success ? CSS.accent : CSS.text, stroke: CSS.ink, strokeThickness: 6 }).setDepth(30);
    }
    this.time.delayedCall(message ? 1400 : 0, () => {
      this.scene.stop();
      this.scene.resume("Overworld");
      this.play.done(success);
    });
  }

  protected get isOver(): boolean {
    return this.over;
  }
}
