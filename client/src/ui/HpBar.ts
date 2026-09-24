import Phaser from "phaser";
import { C, CSS, FONT } from "./theme";

export interface HpBarHandle {
  container: Phaser.GameObjects.Container;
  setHp(current: number, max: number): void;
}

const BAR_WIDTH = 220;
const BAR_HEIGHT = 24;
const FILL_INSET = 3;

/** `size` scales the whole bar (1 = the iPad design size); the label sits above it. */
export function createHpBar(scene: Phaser.Scene, x: number, y: number, label: string, size = 1): HpBarHandle {
  const BAR_WIDTH_S = Math.round(BAR_WIDTH * size);
  const nameText = scene.add.text(x - BAR_WIDTH_S / 2, y - Math.round(36 * size), label, {
    fontFamily: FONT,
    fontSize: `${Math.max(16, Math.round(22 * size))}px`,
    color: CSS.text,
  });
  const BAR_HEIGHT_S = Math.max(14, Math.round(BAR_HEIGHT * size));
  const track = scene.add.rectangle(x, y, BAR_WIDTH_S, BAR_HEIGHT_S, C.panel).setStrokeStyle(2, C.border, 0.8);
  const fill = scene.add
    .rectangle(x - BAR_WIDTH_S / 2 + FILL_INSET, y, BAR_WIDTH_S - FILL_INSET * 2, BAR_HEIGHT_S - FILL_INSET * 2, C.hpGood)
    .setOrigin(0, 0.5);

  const container = scene.add.container(0, 0, [track, fill, nameText]);

  return {
    container,
    setHp(current: number, max: number) {
      const fraction = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
      fill.width = (BAR_WIDTH_S - FILL_INSET * 2) * fraction;
      fill.setFillStyle(fraction > 0.5 ? C.hpGood : fraction > 0.2 ? C.hpMid : C.hpLow);
    },
  };
}
