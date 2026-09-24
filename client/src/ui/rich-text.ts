import Phaser from "phaser";
import { addIcon } from "../gfx/icon-art";

const TOKEN = /\[\[([a-z0-9-]+)\]\]/g;

/** An inline icon in a string for `richText`: `ic("heart")` → "[[heart]]". */
export const ic = (name: string): string => `[[${name}]]`;

/** True if the string holds any `[[icon]]`. */
export const hasIcons = (s: string): boolean => s.includes("[[");

/**
 * A one-line label mixing text and drawn icons: "[[dragon]] Kæmpedragen [[heart]] 600".
 * Icons are drawn a little larger than the font. Returns a container positioned by
 * `originX`/`originY` like a Text's origin (0.5 = centred).
 */
export function richText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
  originX = 0.5,
  originY = 0.5
): Phaser.GameObjects.Container {
  const fontPx = parseInt(String(style.fontSize ?? "24"), 10) || 24;
  const iconPx = Math.round(fontPx * 1.3);
  const parts: Phaser.GameObjects.GameObject[] = [];
  let cursor = 0;
  let last = 0;
  const addText = (s: string) => {
    if (!s) return;
    const t = scene.add.text(cursor, 0, s, style).setOrigin(0, 0.5);
    parts.push(t);
    cursor += t.width;
  };
  for (const m of content.matchAll(TOKEN)) {
    addText(content.slice(last, m.index));
    const img = addIcon(scene, cursor + iconPx / 2 + 1, 0, m[1]!, iconPx);
    parts.push(img);
    cursor += iconPx + Math.round(fontPx * 0.2);
    last = m.index! + m[0].length;
  }
  addText(content.slice(last));
  const height = Math.max(iconPx, fontPx * 1.2);
  for (const p of parts) (p as Phaser.GameObjects.Text).x -= cursor * originX;
  const container = scene.add.container(x, y + height * (0.5 - originY), parts);
  container.setSize(cursor, height);
  return container;
}

/**
 * `richText` on a rounded ink background (toasts, the bag chip). The whole thing is
 * one container, placed by its origin like `richText`.
 */
export function richChip(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
  originX = 0.5,
  originY = 0.5,
  background = 0x16161d
): Phaser.GameObjects.Container {
  const label = richText(scene, 0, 0, content, style, 0.5, 0.5);
  const padX = 14;
  const padY = 8;
  const w = label.width + padX * 2;
  const h = label.height + padY * 2;
  const bg = scene.add.graphics();
  bg.fillStyle(background, 0.85).fillRoundedRect(-w / 2, -h / 2, w, h, Math.min(14, h / 2));
  const chip = scene.add.container(x + w * (0.5 - originX), y + h * (0.5 - originY), [bg, label]);
  chip.setSize(w, h);
  return chip;
}
