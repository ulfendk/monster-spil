import Phaser from "phaser";
import { getLayout } from "./layout";
import { C, CSS, FONT } from "./theme";
import { hasIcons, richText } from "./rich-text";
import { addIcon } from "../gfx/icon-art";

export interface ButtonOptions {
  width?: number;
  height?: number;
  fontSize?: string;
  backgroundColor?: number;
  textColor?: string;
  /** A drawn icon (by name, see gfx/icon-art.ts) shown large above the label, so a child who reads little can tell buttons apart. */
  icon?: string;
}

/**
 * A big (>=64px) in-canvas touch button, since DOM buttons fight Safari's zoom/overlay
 * behaviour. Kanagawa style: a rounded card with a thin warm-white edge and a soft
 * ink shadow below, which it sinks into while pressed.
 */
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
  const color = options.backgroundColor ?? C.button;
  const radius = Math.min(16, height * 0.22);
  const drop = Math.max(3, Math.round(height * 0.06));

  const bg = scene.add.graphics();
  const draw = (pressed: boolean) => {
    const offset = pressed ? drop * 0.6 : 0;
    bg.clear();
    bg.fillStyle(C.shadow, 0.35).fillRoundedRect(-width / 2, -height / 2 + drop, width, height, radius);
    bg.fillStyle(color, pressed ? 0.85 : 1).fillRoundedRect(-width / 2, -height / 2 + offset, width, height, radius);
    bg.lineStyle(2, C.border, 0.75).strokeRoundedRect(-width / 2, -height / 2 + offset, width, height, radius);
  };
  draw(false);

  const style = { fontFamily: FONT, fontSize: options.fontSize ?? "28px", color: options.textColor ?? CSS.text };
  // A label may be plain text or hold [[icon]]s — an icon-only button is just "[[map]]".
  const iconOnly = /^\[\[[a-z0-9-]+\]\]$/.exec(label);
  const text = iconOnly
    ? addIcon(scene, 0, 0, label.slice(2, -2), Math.min(width, height) * 0.62)
    : hasIcons(label)
      ? richText(scene, 0, 0, label, style)
      : scene.add.text(0, 0, label, style).setOrigin(0.5);

  // Keep [bg, text] as the first two children; the icon goes last.
  const parts: Phaser.GameObjects.GameObject[] = [bg, text];
  if (options.icon) {
    (text as Phaser.GameObjects.Components.Transform).setY(height * 0.24);
    parts.push(addIcon(scene, 0, -height * 0.18, options.icon, height * 0.46));
  }

  const container = scene.add.container(x, y, parts);
  container.setSize(width, height);
  container.setInteractive({ useHandCursor: true });
  container.on("pointerdown", () => draw(true));
  container.on("pointerup", () => {
    draw(false);
    onTap();
  });
  container.on("pointerout", () => draw(false));

  return container;
}

/**
 * The ✗/X close button every overlay has in its top-right corner, clear of the iPhone
 * notch and status bar. Returns the button and how much height the header row takes.
 */
export function addCloseButton(scene: Phaser.Scene, onTap: () => void): { button: Phaser.GameObjects.Container; headerH: number; size: number } {
  const layout = getLayout(scene);
  const size = layout.touch(64);
  const button = createButton(scene, layout.width - layout.safe.right - 12 - size / 2, layout.safe.top + 10 + size / 2, "✕", onTap, {
    width: size,
    height: size,
    fontSize: `${Math.round(size * 0.42)}px`,
    backgroundColor: C.buttonQuiet,
  });
  return { button, headerH: layout.safe.top + 10 + size + 10, size };
}
