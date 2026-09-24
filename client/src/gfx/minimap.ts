import Phaser from "phaser";
import { getLayout } from "../ui/layout";
import { createButton } from "../ui/Button";
import { C, FONT, KANAGAWA } from "../ui/theme";

/** One dot on the overview map, in tile coordinates. */
export interface MinimapDot {
  x: number;
  y: number;
  colour: number;
  /** Drawn bigger with a white ring (me), or as a 🐉 (the dragon). */
  kind?: "me" | "dragon";
  dim?: boolean;
}

const COLOURS: Record<"ground" | "tree" | "water" | "path" | "grass", number> = {
  ground: KANAGAWA.autumnGreen,
  tree: KANAGAWA.winterGreen,
  water: KANAGAWA.waveBlue2,
  path: KANAGAWA.boatYellow2,
  grass: KANAGAWA.springGreen,
};
const DEPTH = 30;

/**
 * The overview map, opened from the 🗺️ button: the whole area as a picture over the
 * game, with dots for me, the other players and the dragon, and a frame showing
 * what the camera sees. Tap anywhere (or ✗) to close. The terrain is baked once into
 * a one-texel-per-tile texture; only the dots are redrawn while it is open.
 */
export class Minimap {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private image?: Phaser.GameObjects.Image;
  private dots?: Phaser.GameObjects.Graphics;
  private dragonMarker?: Phaser.GameObjects.Text;
  private scale = 1;
  private origin = { x: 0, y: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: Phaser.Tilemaps.Tilemap,
    ground: Phaser.Tilemaps.TilemapLayer,
    grass: Phaser.Tilemaps.TilemapLayer,
    /** Tile ids on the ground layer drawn as trees, water or paths; everything else is open ground. */
    ids: { tree: number[]; water: number[]; path: number[] },
    private readonly key: string
  ) {
    if (!scene.textures.exists(key)) {
      const g = scene.add.graphics();
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const index = ground.getTileAt(x, y)?.index ?? -1;
          let colour = COLOURS.ground;
          if (ids.tree.includes(index)) colour = COLOURS.tree;
          else if (ids.water.includes(index)) colour = COLOURS.water;
          else if (grass.getTileAt(x, y)) colour = COLOURS.grass;
          else if (ids.path.includes(index)) colour = COLOURS.path;
          g.fillStyle(colour, 1).fillRect(x, y, 1, 1);
        }
      }
      g.generateTexture(key, map.width, map.height);
      g.destroy();
      // One texel per tile: keep it crisp when scaled up, never smoothed.
      scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  }

  get isOpen(): boolean {
    return this.objects.length > 0;
  }

  open(): void {
    this.close();
    const layout = getLayout(this.scene);
    const { width, height, safe } = layout;
    const margin = layout.px(24);
    const room = { w: width - safe.left - safe.right - margin * 2, h: height - safe.top - safe.bottom - margin * 2 };
    this.scale = Math.max(1, Math.floor(Math.min(room.w / this.map.width, room.h / this.map.height)));
    const w = this.map.width * this.scale;
    const h = this.map.height * this.scale;
    this.origin = { x: safe.left + margin + (room.w - w) / 2, y: safe.top + margin + (room.h - h) / 2 };

    const backdrop = this.scene.add.rectangle(0, 0, width, height, C.overlay, 0.85).setOrigin(0, 0);
    // Tapping anywhere closes the map; it also stops taps from walking the player underneath.
    backdrop.setInteractive();
    backdrop.on("pointerup", () => this.close());
    const frame = this.scene.add.rectangle(this.origin.x - 4, this.origin.y - 4, w + 8, h + 8, C.overlay).setOrigin(0, 0).setStrokeStyle(3, C.border);
    this.image = this.scene.add.image(this.origin.x, this.origin.y, this.key).setOrigin(0, 0).setScale(this.scale);
    this.image.setInteractive();
    this.image.on("pointerup", () => this.close());
    this.dots = this.scene.add.graphics();
    this.dragonMarker = this.scene.add.text(0, 0, "🐉", { fontFamily: FONT, fontSize: "18px" }).setOrigin(0.5).setVisible(false);
    const size = layout.touch(64);
    const close = createButton(this.scene, width - safe.right - size / 2 - 12, safe.top + size / 2 + 12, "✗", () => this.close(), {
      width: size,
      height: size,
      fontSize: layout.font(32),
      backgroundColor: C.buttonQuiet,
    });
    this.objects = [backdrop, frame, this.image, this.dots, this.dragonMarker, close];
    for (const o of this.objects) (o as Phaser.GameObjects.Image).setScrollFactor(0).setDepth(DEPTH);
  }

  close(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
    this.image = this.dots = this.dragonMarker = undefined;
  }

  /** After a rotation: lay the open map out again for the new screen size. */
  relayout(): void {
    if (this.isOpen) this.open();
  }

  /** Redraws the dots and the camera frame; call every frame (does nothing while closed). */
  draw(dots: MinimapDot[], view: Phaser.Geom.Rectangle, tileSize: number): void {
    if (!this.dots || !this.dragonMarker) return;
    const s = this.scale;
    const g = this.dots.clear();
    const px = (tile: number) => tile * s + s / 2;
    g.lineStyle(2, C.border, 0.9).strokeRect(
      this.origin.x + (view.x / tileSize) * s,
      this.origin.y + (view.y / tileSize) * s,
      (view.width / tileSize) * s,
      (view.height / tileSize) * s
    );
    const r = Math.max(4, s * 1.2);
    this.dragonMarker.setVisible(false);
    for (const d of dots) {
      const x = this.origin.x + px(d.x);
      const y = this.origin.y + px(d.y);
      if (d.kind === "dragon") {
        this.dragonMarker.setPosition(x, y).setFontSize(Math.round(r * 4.5)).setAlpha(d.dim ? 0.5 : 1).setVisible(true);
        continue;
      }
      const radius = d.kind === "me" ? r * 1.5 : r;
      // A white ring around me, a dark one around other players, so every dot shows on grass and water.
      g.fillStyle(d.kind === "me" ? C.border : C.overlay, 1).fillCircle(x, y, radius + (d.kind === "me" ? 2 : 1.5));
      g.fillStyle(d.colour, d.dim ? 0.45 : 1).fillCircle(x, y, radius);
    }
  }
}
