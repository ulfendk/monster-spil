import Phaser from "phaser";
import type { TypeId } from "@shared";
import { KANAGAWA } from "../ui/theme";
import { TYPE_COLOURS } from "./placeholder-sprites";

/**
 * A monster egg drawn in the game's woodblock style: an ink-outlined egg in a pale version of
 * its type's colour with darker speckles, and cracks that grow as it comes closer to hatching
 * (`progress` 0–1). Drawn around (0, 0), `size` tall, in a container you can wobble.
 */
export function drawEgg(scene: Phaser.Scene, x: number, y: number, size: number, type: TypeId, progress: number): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  const w = size * 0.78;
  const shell = Phaser.Display.Color.IntegerToColor(TYPE_COLOURS[type]).lighten(18).color;
  const speck = Phaser.Display.Color.IntegerToColor(TYPE_COLOURS[type]).darken(18).color;
  const pts: Phaser.Types.Math.Vector2Like[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const yy = Math.sin(a);
    // Narrower at the top.
    const k = yy < 0 ? 1 + yy * 0.18 : 1;
    pts.push({ x: Math.cos(a) * (w / 2) * k, y: yy * (size / 2) + (yy < 0 ? yy * size * 0.04 : 0) });
  }
  g.fillStyle(shell, 1).fillPoints(pts, true);
  g.fillStyle(0xffffff, 0.35).fillEllipse(-w * 0.18, -size * 0.2, w * 0.2, size * 0.28);
  g.fillStyle(speck, 1);
  for (const [sx, sy, r] of [[-0.18, -0.1, 0.06], [0.16, -0.22, 0.045], [0.12, 0.12, 0.07], [-0.1, 0.26, 0.05], [0.22, 0.05, 0.035]] as const) g.fillCircle(sx * size, sy * size, r * size);
  g.lineStyle(Math.max(2, size * 0.035), KANAGAWA.sumiInk0, 1).strokePoints(pts, true);
  // Cracks: a zigzag across the middle, longer and with a branch as it gets closer.
  if (progress > 0.35) {
    const len = Math.min(1, (progress - 0.35) / 0.55);
    g.lineStyle(Math.max(2, size * 0.03), KANAGAWA.sumiInk0, 1);
    g.beginPath();
    const zig = [[-0.34, -0.02], [-0.2, 0.06], [-0.08, -0.04], [0.04, 0.07], [0.16, -0.03], [0.3, 0.05]];
    const n = Math.max(2, Math.round(zig.length * len));
    g.moveTo(zig[0]![0] * size, zig[0]![1] * size);
    for (let i = 1; i < n; i++) g.lineTo(zig[i]![0] * size, zig[i]![1] * size);
    g.strokePath();
    if (progress > 0.75) g.lineBetween(-0.08 * size, -0.04 * size, -0.02 * size, -0.2 * size);
  }
  return scene.add.container(x, y, [g]);
}
