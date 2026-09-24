import Phaser from "phaser";
import { getLayout } from "./layout";

export interface ButtonOptions {
  width?: number;
  height?: number;
  fontSize?: string;
  backgroundColor?: number;
  textColor?: string;
  /** An emoji drawn large above the label, so a child who reads little can tell buttons apart. */
  icon?: string;
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

  // Keep [bg, text] as the first two children (callers update the label via list[1]); the icon goes last.
  const parts: Phaser.GameObjects.GameObject[] = [bg, text];
  if (options.icon) {
    text.setY(height * 0.24);
    parts.push(scene.add.text(0, -height * 0.2, options.icon, { fontFamily: "sans-serif", fontSize: `${Math.round(height * 0.45)}px` }).setOrigin(0.5));
  }

  const container = scene.add.container(x, y, parts);
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

/**
 * The ✗/X close button every overlay has in its top-right corner, clear of the iPhone
 * notch and status bar. Returns the button and how much height the header row takes.
 */
export function addCloseButton(scene: Phaser.Scene, onTap: () => void): { button: Phaser.GameObjects.Container; headerH: number; size: number } {
  const layout = getLayout(scene);
  const size = layout.touch(64);
  const button = createButton(scene, layout.width - layout.safe.right - 12 - size / 2, layout.safe.top + 10 + size / 2, "X", onTap, {
    width: size,
    height: size,
    fontSize: layout.font(28),
    backgroundColor: 0x555555,
  });
  return { button, headerH: layout.safe.top + 10 + size + 10, size };
}
