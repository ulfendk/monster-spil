import Phaser from "phaser";

export interface ButtonOptions {
  width?: number;
  height?: number;
  fontSize?: string;
  backgroundColor?: number;
  textColor?: string;
}

/** A big (>=64px) in-canvas touch button, since DOM buttons fight Safari's zoom/overlay behaviour. */
export function createButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onTap: () => void,
  options: ButtonOptions = {}
): Phaser.GameObjects.Container {
  const width = options.width ?? 220;
  const height = options.height ?? 72;
  const color = options.backgroundColor ?? 0x2e7d32;

  const bg = scene.add.rectangle(0, 0, width, height, color).setStrokeStyle(4, 0xffffff);
  const text = scene.add
    .text(0, 0, label, {
      fontFamily: "sans-serif",
      fontSize: options.fontSize ?? "28px",
      color: options.textColor ?? "#ffffff",
    })
    .setOrigin(0.5);

  const container = scene.add.container(x, y, [bg, text]);
  container.setSize(width, height);
  container.setInteractive({ useHandCursor: true });
  container.on("pointerdown", () => bg.setFillStyle(color, 0.7));
  container.on("pointerup", () => {
    bg.setFillStyle(color, 1);
    onTap();
  });
  container.on("pointerout", () => bg.setFillStyle(color, 1));

  return container;
}
