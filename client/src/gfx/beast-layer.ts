import Phaser from "phaser";
import type { BeastDefinition, BeastView } from "@shared";
import { beastsById } from "../content/load-beasts";
import { ic, richChip } from "../ui/rich-text";
import { setMapHint } from "./map-hints";
import { CSS, FONT, KANAGAWA } from "../ui/theme";

/** Beasts sit where the dragon does: over the ground and food, under players' labels. */
const DEPTH_BEAST = 5;
const DEPTH_LABEL = 7;
const DEPTH_AIR = 9;
const SCALE = 0.9;
/** How long coming up and leaving take. */
const ARRIVE_MS = 1400;
const LEAVE_MS = 1100;

interface Drawn {
  view: BeastView;
  def: BeastDefinition;
  sprite: Phaser.GameObjects.Image;
  label?: Phaser.GameObjects.Container;
  /** Coming up or leaving: no HP label meanwhile, and a leaving one no longer blocks. */
  animating: boolean;
}

/**
 * The visiting beasts on the overworld: a sand serpent rises out of the sand in a spray of
 * grains and sinks back into it; a giant eagle swoops down from the sky onto the forest's
 * edge and flies off again. Each shows its shared HP above it. The server decides where
 * and when; this only shows it (and says which tiles are taken).
 */
export class BeastLayer {
  private drawn = new Map<string, Drawn>();
  /** Beasts playing their leaving animation: drawn, but no longer in the way. */
  private leavingIds = new Set<string>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly tileSize: number,
    /** A beast came up on this map while I watched (a toast, and step off its tile). */
    private readonly onArrive: (view: BeastView, def: BeastDefinition) => void
  ) {}

  /** Makes the drawn beasts match the server's list for this map. `animate`: show arrivals and departures. */
  sync(views: readonly BeastView[], areaId: string, animate = true): void {
    const here = new Map(views.filter((v) => v.areaId === areaId && beastsById[v.beastId]).map((v) => [v.id, v]));
    for (const [id, d] of this.drawn) {
      if (here.has(id) || d.animating) continue;
      this.leave(id, d, animate);
    }
    for (const view of here.values()) {
      const d = this.drawn.get(view.id);
      if (d) {
        d.view = view;
        if (!d.animating) this.drawLabel(d);
      } else {
        this.arrive(view, animate);
      }
    }
  }

  /** The beast standing on this tile (only settled ones: one still arriving or leaving can't be met). */
  beastAt(x: number, y: number): BeastView | undefined {
    for (const d of this.drawn.values()) if (!d.animating && d.view.x === x && d.view.y === y) return d.view;
    return undefined;
  }

  /** Nobody walks through a beast — not even one still coming up. */
  blocks(x: number, y: number): boolean {
    for (const [id, d] of this.drawn) if (d.view.x === x && d.view.y === y && this.stillHere(id)) return true;
    return false;
  }

  /** For the overview map. */
  views(): Array<{ view: BeastView; def: BeastDefinition }> {
    return [...this.drawn.values()].map((d) => ({ view: d.view, def: d.def }));
  }

  destroy(): void {
    for (const d of this.drawn.values()) {
      d.sprite.destroy();
      d.label?.destroy();
    }
    this.drawn.clear();
  }

  private stillHere(id: string): boolean {
    return !this.leavingIds.has(id);
  }

  private centre(view: BeastView): { x: number; y: number } {
    return { x: view.x * this.tileSize + this.tileSize / 2, y: view.y * this.tileSize + this.tileSize / 2 - 8 };
  }

  private arrive(view: BeastView, animate: boolean): void {
    const def = beastsById[view.beastId]!;
    const c = this.centre(view);
    const sprite = this.scene.add.image(c.x, c.y, def.spriteFront).setScale(SCALE).setDepth(DEPTH_BEAST);
    const d: Drawn = { view, def, sprite, animating: animate };
    this.drawn.set(view.id, d);
    if (!animate) return this.drawLabel(d);
    this.onArrive(view, def);
    const done = () => {
      d.animating = false;
      this.drawLabel(d);
    };
    if (def.habitat === "sand") {
      // Rising out of the sand: it grows up from the ground while grains spray around it.
      sprite.setOrigin(0.5, 1).setPosition(c.x, c.y + this.tileSize * 0.45).setScale(SCALE, 0);
      this.sandSpray(c.x, c.y + this.tileSize * 0.4);
      this.scene.tweens.add({ targets: sprite, scaleY: SCALE, duration: ARRIVE_MS, ease: "Back.easeOut", onComplete: () => {
        sprite.setOrigin(0.5, 0.5).setPosition(c.x, c.y);
        done();
      } });
    } else {
      // Swooping down from the sky, its shadow growing on the ground where it will land.
      const shadow = this.scene.add.ellipse(c.x, c.y + this.tileSize * 0.38, this.tileSize * 0.3, this.tileSize * 0.12, KANAGAWA.sumiInk0, 0.35).setDepth(DEPTH_BEAST - 1);
      sprite.setPosition(c.x - this.tileSize * 3, c.y - this.tileSize * 5).setScale(SCALE * 1.4).setDepth(DEPTH_AIR);
      this.scene.tweens.add({ targets: shadow, width: this.tileSize * 0.8, height: this.tileSize * 0.28, duration: ARRIVE_MS });
      this.scene.tweens.add({ targets: sprite, x: c.x, y: c.y, scale: SCALE, duration: ARRIVE_MS, ease: "Quad.easeIn", onComplete: () => {
        shadow.destroy();
        sprite.setDepth(DEPTH_BEAST);
        this.scene.cameras.main.shake(160, 0.003);
        done();
      } });
    }
  }

  private leave(id: string, d: Drawn, animate: boolean): void {
    d.label?.destroy();
    d.label = undefined;
    const gone = () => {
      d.sprite.destroy();
      this.drawn.delete(id);
      this.leavingIds.delete(id);
    };
    if (!animate) return gone();
    d.animating = true;
    this.leavingIds.add(id);
    const c = this.centre(d.view);
    if (d.def.habitat === "sand") {
      // Sinking back into the sand.
      d.sprite.setOrigin(0.5, 1).setPosition(c.x, c.y + this.tileSize * 0.45);
      this.sandSpray(c.x, c.y + this.tileSize * 0.4);
      this.scene.tweens.add({ targets: d.sprite, scaleY: 0, duration: LEAVE_MS, ease: "Quad.easeIn", onComplete: gone });
    } else {
      // Beating its wings and flying off over the trees.
      d.sprite.setDepth(DEPTH_AIR);
      this.scene.tweens.add({ targets: d.sprite, x: c.x + this.tileSize * 4, y: c.y - this.tileSize * 6, scale: SCALE * 1.4, alpha: 0, duration: LEAVE_MS, ease: "Quad.easeIn", onComplete: gone });
    }
  }

  /** A little burst of sand grains around where a serpent comes up or goes down. */
  private sandSpray(x: number, y: number): void {
    for (let i = 0; i < 14; i++) {
      const a = Math.PI + (i / 13) * Math.PI;
      const grain = this.scene.add.circle(x, y, 3 + (i % 3), i % 2 ? KANAGAWA.boatYellow2 : KANAGAWA.oldWhite).setDepth(DEPTH_BEAST + 1);
      this.scene.tweens.add({
        targets: grain,
        x: x + Math.cos(a) * this.tileSize * (0.5 + (i % 4) * 0.15),
        y: y + Math.sin(a) * this.tileSize * 0.7,
        alpha: 0,
        duration: 700 + (i % 5) * 80,
        ease: "Quad.easeOut",
        onComplete: () => grain.destroy(),
      });
    }
  }

  private drawLabel(d: Drawn): void {
    d.label?.destroy();
    const c = this.centre(d.view);
    d.label = richChip(this.scene, c.x, c.y + 8 - this.tileSize * 0.98, `${ic("heart")} ${d.view.hp}/${d.view.maxHp}`, { fontFamily: FONT, fontSize: "18px", color: CSS.text }).setDepth(DEPTH_LABEL);
    setMapHint(d.label, { dy: this.tileSize * 0.98 - 8, lift: 2 });
  }
}
