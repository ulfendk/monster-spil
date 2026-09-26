import Phaser from "phaser";
import type { CaveView } from "@shared";
import { KANAGAWA, kanagawaColour } from "../ui/theme";
import { caveKindFor } from "../content/load-caves";

/** Over the mountain tile, under players' labels. */
const DEPTH = 5;
const OPEN_MS = 1200;
const CLOSE_MS = 900;

interface Drawn {
  view: CaveView;
  mouth: Phaser.GameObjects.Graphics;
  glow: Phaser.GameObjects.Ellipse;
  closing: boolean;
}

/**
 * Open caves on the overworld: a dark arch in the mountain face with a glow breathing
 * inside, in the colour of its kind (caves.json). Opening, rocks tumble out and the arch grows; closing, it shrinks shut
 * in a puff of dust. The mouth stays a mountain tile, so nothing about walking changes.
 */
export class CaveLayer {
  private drawn = new Map<string, Drawn>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly tileSize: number,
    /** A cave opened on this map while I watched. */
    private readonly onOpen: (view: CaveView) => void
  ) {}

  sync(views: readonly CaveView[], areaId: string, animate = true): void {
    const here = new Map(views.filter((v) => v.areaId === areaId).map((v) => [v.id, v]));
    for (const [id, d] of this.drawn) if (!here.has(id) && !d.closing) this.close(id, d, animate);
    for (const view of here.values()) {
      const d = this.drawn.get(view.id);
      if (d) d.view = view;
      else this.open(view, animate);
    }
  }

  caveAt(x: number, y: number): CaveView | undefined {
    for (const d of this.drawn.values()) if (!d.closing && d.view.x === x && d.view.y === y) return d.view;
    return undefined;
  }

  views(): CaveView[] {
    return [...this.drawn.values()].filter((d) => !d.closing).map((d) => d.view);
  }

  destroy(): void {
    for (const d of this.drawn.values()) this.remove(d);
    this.drawn.clear();
  }

  private centre(view: CaveView): { x: number; y: number } {
    return { x: view.x * this.tileSize + this.tileSize / 2, y: view.y * this.tileSize + this.tileSize / 2 };
  }

  private open(view: CaveView, animate: boolean): void {
    const c = this.centre(view);
    const t = this.tileSize;
    // The arch, drawn around its own origin so it can grow from the ground up.
    const mouth = this.scene.add.graphics({ x: c.x, y: c.y + t * 0.42 }).setDepth(DEPTH);
    mouth.fillStyle(KANAGAWA.sumiInk0, 1).fillEllipse(0, -t * 0.3, t * 0.62, t * 0.62).fillRect(-t * 0.31, -t * 0.3, t * 0.62, t * 0.3);
    mouth.lineStyle(3, KANAGAWA.sumiInk4, 1).strokeEllipse(0, -t * 0.3, t * 0.62, t * 0.62);
    // The glow inside is the kind's own colour: ice blue, lava orange, mushroom green, …
    const colour = kanagawaColour(caveKindFor(view.kind)?.look.glow[0], KANAGAWA.waveAqua2);
    const glow = this.scene.add.ellipse(c.x, c.y + t * 0.18, t * 0.22, t * 0.16, colour, 0.8).setDepth(DEPTH);
    this.scene.tweens.add({ targets: glow, alpha: 0.35, duration: 1100, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    const d: Drawn = { view, mouth, glow, closing: false };
    this.drawn.set(view.id, d);
    if (!animate) return;
    this.onOpen(view);
    mouth.setScale(1, 0);
    glow.setScale(0);
    this.scene.tweens.add({ targets: mouth, scaleY: 1, duration: OPEN_MS, ease: "Back.easeOut" });
    this.scene.tweens.add({ targets: glow, scale: 1, duration: OPEN_MS, delay: OPEN_MS / 2 });
    this.rubble(c.x, c.y + t * 0.3, 10);
    this.scene.cameras.main.shake(260, 0.004);
  }

  private close(id: string, d: Drawn, animate: boolean): void {
    d.closing = true;
    if (!animate) {
      this.remove(d);
      this.drawn.delete(id);
      return;
    }
    const c = this.centre(d.view);
    this.rubble(c.x, c.y + this.tileSize * 0.3, 6);
    this.scene.tweens.add({ targets: [d.mouth, d.glow], scaleY: 0, duration: CLOSE_MS, ease: "Quad.easeIn", onComplete: () => {
      this.remove(d);
      this.drawn.delete(id);
    } });
  }

  private remove(d: Drawn): void {
    this.scene.tweens.killTweensOf([d.mouth, d.glow]);
    d.mouth.destroy();
    d.glow.destroy();
  }

  /** Stones tumbling out of the mountain face. */
  private rubble(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const stone = this.scene.add.circle(x, y, 3 + (i % 3) * 2, i % 2 ? KANAGAWA.katanaGray : KANAGAWA.sumiInk4).setDepth(DEPTH + 1);
      const a = Math.PI * (0.15 + 0.7 * (i / Math.max(1, n - 1)));
      this.scene.tweens.add({
        targets: stone,
        x: x + Math.cos(a) * this.tileSize * 0.9,
        y: y + Math.sin(a) * this.tileSize * 0.5,
        alpha: 0,
        duration: 650 + (i % 4) * 90,
        ease: "Quad.easeOut",
        onComplete: () => stone.destroy(),
      });
    }
  }
}
