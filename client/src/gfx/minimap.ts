import Phaser from "phaser";

/** One dot on the overview map, in tile coordinates. */
export interface MinimapDot {
  x: number;
  y: number;
  colour: number;
  /** Drawn bigger with a white ring (me) or with a dark ring (the dragon). */
  kind?: "me" | "dragon";
  dim?: boolean;
}

const COLOURS = { ground: 0x4caf50, tree: 0x1b5e20, water: 0x2979c8, path: 0xd7be8c, grass: 0xaed581 };
const SMALL_PX = 3;
const MARGIN = 16;

/**
 * The overview map: a small picture of the whole area in the top-left corner,
 * fixed on screen, with dots for me, other players and the dragon, and a frame
 * showing what the camera sees. Tapping it opens a big version; tapping again
 * closes it. The terrain is baked once into a texture; only the dots are redrawn.
 */
export class Minimap {
  private image: Phaser.GameObjects.Image;
  private frame: Phaser.GameObjects.Rectangle;
  private dots: Phaser.GameObjects.Graphics;
  /** The dragon gets its own 🐉 marker, so it never looks like a player of the same colour. */
  private dragonMarker: Phaser.GameObjects.Text;
  private backdrop?: Phaser.GameObjects.Rectangle;
  private big = false;
  private scale = SMALL_PX;
  private origin = { x: MARGIN, y: MARGIN };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: Phaser.Tilemaps.Tilemap,
    ground: Phaser.Tilemaps.TilemapLayer,
    grass: Phaser.Tilemaps.TilemapLayer,
    /** Tile ids on the ground layer: [tree, water, path]; everything else is open ground. */
    ids: { tree: number[]; water: number[]; path: number[] },
    key: string
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
    this.frame = scene.add.rectangle(0, 0, 10, 10, 0x000000, 0.55).setOrigin(0, 0).setStrokeStyle(3, 0xffffff, 0.9);
    this.image = scene.add.image(0, 0, key).setOrigin(0, 0);
    this.dots = scene.add.graphics();
    this.dragonMarker = scene.add.text(0, 0, "🐉", { fontFamily: "sans-serif", fontSize: "18px" }).setOrigin(0.5).setVisible(false);
    for (const o of [this.frame, this.image, this.dots, this.dragonMarker]) o.setScrollFactor(0).setDepth(12);
    this.image.setInteractive({ useHandCursor: true });
    this.image.on("pointerup", () => this.toggle());
    this.layout();
  }

  private toggle(): void {
    this.big = !this.big;
    this.backdrop?.destroy();
    this.backdrop = undefined;
    if (this.big) {
      const { width, height } = this.scene.scale;
      this.backdrop = this.scene.add.rectangle(0, 0, width, height, 0x000000, 0.7).setOrigin(0, 0).setScrollFactor(0).setDepth(11);
      // Tapping anywhere around the big map closes it too.
      this.backdrop.setInteractive();
      this.backdrop.on("pointerup", () => this.toggle());
    }
    this.layout();
  }

  private layout(): void {
    const { width, height } = this.scene.scale;
    if (this.big) {
      this.scale = Math.floor(Math.min((width - 80) / this.map.width, (height - 80) / this.map.height));
      this.origin = { x: (width - this.map.width * this.scale) / 2, y: (height - this.map.height * this.scale) / 2 };
    } else {
      this.scale = SMALL_PX;
      this.origin = { x: MARGIN, y: MARGIN };
    }
    this.image.setPosition(this.origin.x, this.origin.y).setScale(this.scale);
    this.frame.setPosition(this.origin.x - 4, this.origin.y - 4).setSize(this.map.width * this.scale + 8, this.map.height * this.scale + 8);
  }

  /** Redraws the dots and the camera frame; call every frame. */
  draw(dots: MinimapDot[], view: Phaser.Geom.Rectangle, tileSize: number): void {
    const s = this.scale;
    const g = this.dots.clear();
    const px = (tile: number) => tile * s + s / 2;
    g.lineStyle(2, 0xffffff, 0.8).strokeRect(
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
      // A dark ring around other players, a white one around me, so every dot shows on grass and water.
      g.fillStyle(d.kind === "me" ? 0xffffff : 0x000000, 1).fillCircle(x, y, radius + (d.kind === "me" ? 2 : 1.5));
      g.fillStyle(d.colour, d.dim ? 0.45 : 1).fillCircle(x, y, radius);
    }
  }
}
