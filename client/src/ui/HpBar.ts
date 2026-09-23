import Phaser from "phaser";

export interface HpBarHandle {
  container: Phaser.GameObjects.Container;
  setHp(current: number, max: number): void;
}

const BAR_WIDTH = 220;
const BAR_HEIGHT = 24;
const FILL_INSET = 3;

export function createHpBar(scene: Phaser.Scene, x: number, y: number, label: string): HpBarHandle {
  const nameText = scene.add.text(x - BAR_WIDTH / 2, y - 36, label, {
    fontFamily: "sans-serif",
    fontSize: "22px",
    color: "#ffffff",
  });
  const track = scene.add.rectangle(x, y, BAR_WIDTH, BAR_HEIGHT, 0x2b2f52).setStrokeStyle(3, 0xffffff);
  const fill = scene.add
    .rectangle(x - BAR_WIDTH / 2 + FILL_INSET, y, BAR_WIDTH - FILL_INSET * 2, BAR_HEIGHT - FILL_INSET * 2, 0x4caf50)
    .setOrigin(0, 0.5);

  const container = scene.add.container(0, 0, [track, fill, nameText]);

  return {
    container,
    setHp(current: number, max: number) {
      const fraction = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
      fill.width = (BAR_WIDTH - FILL_INSET * 2) * fraction;
      fill.setFillStyle(fraction > 0.5 ? 0x4caf50 : fraction > 0.2 ? 0xf4a261 : 0xe63946);
    },
  };
}
