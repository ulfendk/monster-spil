import Phaser from "phaser";
import { getLayout } from "../ui/layout";
import { createButton } from "../ui/Button";
import { C, FONT, KANAGAWA } from "../ui/theme";
import { addIcon } from "./icon-art";

/** One dot on the overview map, in tile coordinates. */
export interface MinimapDot {
  x: number;
  y: number;
  colour: number;
  /** Drawn bigger with a white ring (me), or as its icon (the dragon, a sand serpent, a giant eagle). */
  kind?: "me" | BossMarker;
  dim?: boolean;
}

type Kind = "tree" | "water" | "path" | "mountain" | "burnt" | "crater" | "flood" | "sand";
/** Bosses (and an open cave) shown on the overview map as their icon. */
const BOSS_MARKERS = ["dragon", "serpent", "eagle", "cave"] as const;
export type BossMarker = (typeof BOSS_MARKERS)[number];
const COLOURS: Record<Kind | "ground" | "grass", number> = {
  ground: KANAGAWA.autumnGreen,
  tree: KANAGAWA.winterGreen,
  water: KANAGAWA.waveBlue2,
  path: KANAGAWA.boatYellow2,
  grass: KANAGAWA.springGreen,
  mountain: KANAGAWA.katanaGray,
  burnt: KANAGAWA.sumiInk4,
  crater: KANAGAWA.boatYellow1,
  flood: KANAGAWA.springBlue,
  sand: KANAGAWA.oldWhite,
};
/** Which tile ids (on the ground layer) are drawn as what; anything else is open ground. */
export type MinimapIds = Partial<Record<Kind, number[]>>;
const DEPTH = 30;

/**
 * The overview map, opened from the 🗺️ button: the whole area as a picture over the
 * game, with dots for me, the other players and the dragon, and a frame showing
 * what the camera sees. Tap anywhere (or ✗) to close. The terrain is baked into a
 * one-texel-per-tile texture (again after a natural disaster changes the map); only the
 * dots are redrawn while it is open.
 */
export class Minimap {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private image?: Phaser.GameObjects.Image;
  private dots?: Phaser.GameObjects.Graphics;
  /** One icon per boss kind; beasts of one kind are never on the map twice at once. */
  private markers?: Record<BossMarker, Phaser.GameObjects.Image>;
  private scale = 1;
  private origin = { x: 0, y: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: Phaser.Tilemaps.Tilemap,
    private readonly ground: Phaser.Tilemaps.TilemapLayer,
    private readonly grass: Phaser.Tilemaps.TilemapLayer,
    private readonly ids: MinimapIds,
    private readonly key: string
  ) {
    if (!scene.textures.exists(key)) this.bake();
  }

  /** The map changed (a disaster): draw the picture again, and show it if the map is open. */
  refresh(): void {
    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
    this.bake();
    if (this.isOpen) this.open();
  }

  private bake(): void {
    const kinds = Object.entries(this.ids) as Array<[Kind, number[]]>;
    const g = this.scene.add.graphics();
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const index = this.ground.getTileAt(x, y)?.index ?? -1;
        const kind = kinds.find(([, list]) => list.includes(index))?.[0];
        let colour = kind ? COLOURS[kind] : COLOURS.ground;
        if (!kind && this.grass.getTileAt(x, y)) colour = COLOURS.grass;
        g.fillStyle(colour, 1).fillRect(x, y, 1, 1);
      }
    }
    g.generateTexture(this.key, this.map.width, this.map.height);
    g.destroy();
    // One texel per tile: keep it crisp when scaled up, never smoothed.
    this.scene.textures.get(this.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
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
    const markers = Object.fromEntries(BOSS_MARKERS.map((m) => [m, addIcon(this.scene, 0, 0, m, 24).setVisible(false)])) as Record<BossMarker, Phaser.GameObjects.Image>;
    this.markers = markers;
    const size = layout.touch(64);
    const close = createButton(this.scene, width - safe.right - size / 2 - 12, safe.top + size / 2 + 12, "✗", () => this.close(), {
      width: size,
      height: size,
      fontSize: layout.font(32),
      backgroundColor: C.buttonQuiet,
    });
    this.objects = [backdrop, frame, this.image, this.dots, ...Object.values(markers), close];
    for (const o of this.objects) (o as Phaser.GameObjects.Image).setScrollFactor(0).setDepth(DEPTH);
  }

  close(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
    this.image = this.dots = undefined;
    this.markers = undefined;
  }

  /** After a rotation: lay the open map out again for the new screen size. */
  relayout(): void {
    if (this.isOpen) this.open();
  }

  /** Redraws the dots and the camera frame; call every frame (does nothing while closed). */
  draw(dots: MinimapDot[], view: Phaser.Geom.Rectangle, tileSize: number): void {
    if (!this.dots || !this.markers) return;
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
    for (const m of Object.values(this.markers)) m.setVisible(false);
    for (const d of dots) {
      const x = this.origin.x + px(d.x);
      const y = this.origin.y + px(d.y);
      if (d.kind && d.kind !== "me") {
        this.markers[d.kind].setPosition(x, y).setDisplaySize(r * 5, r * 5).setAlpha(d.dim ? 0.5 : 1).setVisible(true);
        continue;
      }
      const radius = d.kind === "me" ? r * 1.5 : r;
      // A white ring around me, a dark one around other players, so every dot shows on grass and water.
      g.fillStyle(d.kind === "me" ? C.border : C.overlay, 1).fillCircle(x, y, radius + (d.kind === "me" ? 2 : 1.5));
      g.fillStyle(d.colour, d.dim ? 0.45 : 1).fillCircle(x, y, radius);
    }
  }
}
