import Phaser from "phaser";
import { fromKey, tileKey, zoneAt, type AreaTerrain, type DisasterKind, type DisasterMessage, type EventZone, type WorldSpawn } from "@shared";
import { addIcon } from "./icon-art";
import { richChip } from "../ui/rich-text";
import { DISASTER_ICONS } from "../ui/icons";
import { C, CSS, FONT, KANAGAWA } from "../ui/theme";

/** Where the disaster layer draws, between the ground (0) and food (3) / players (6). */
const DEPTH_ZONE = 2;
const DEPTH_WARNING = 4;
const DEPTH_SPAWN = 5;

/**
 * What natural disasters do to the map, drawn over the overworld: the changed tiles
 * (put straight into the tilemap, so walking and collisions follow), sparkles where
 * rare monsters live for a while, the UFO's alien waiting to be caught, and the
 * warning before a disaster strikes (the danger tiles glow red, with a countdown).
 * The server decides everything; this only shows it.
 */
export class WorldLayer {
  private readonly baseGround: number[] = [];
  private readonly baseGrass: number[] = [];
  private terrain?: AreaTerrain;
  private zoneMarks: Phaser.GameObjects.GameObject[] = [];
  private spawnViews = new Map<string, Phaser.GameObjects.GameObject[]>();
  private warning: Phaser.GameObjects.GameObject[] = [];
  private warningTimer?: Phaser.Time.TimerEvent;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: Phaser.Tilemaps.Tilemap,
    private readonly ground: Phaser.Tilemaps.TilemapLayer,
    private readonly grass: Phaser.Tilemaps.TilemapLayer,
    private readonly tileSize: number,
    /** A species' front picture texture key. */
    private readonly spriteOf: (speciesId: string) => string | undefined
  ) {
    // The map as drawn in Tiled; every change is laid over this.
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        this.baseGround.push(ground.getTileAt(x, y)?.index ?? 0);
        this.baseGrass.push(grass.getTileAt(x, y)?.index ?? 0);
      }
    }
  }

  /** Makes the tilemap match the terrain. Returns true if any tile changed. */
  apply(terrain: AreaTerrain | undefined): boolean {
    this.terrain = terrain;
    let changed = false;
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const i = y * this.map.width + x;
        const o = terrain?.overrides[tileKey(x, y)];
        const ground = o ? o.ground : this.baseGround[i]!;
        const grass = o ? o.grass : this.baseGrass[i]!;
        if ((this.ground.getTileAt(x, y)?.index ?? 0) !== ground) {
          this.ground.putTileAt(ground, x, y);
          changed = true;
        }
        const hasGrass = this.grass.getTileAt(x, y)?.index ?? 0;
        if (hasGrass !== grass) {
          if (grass) this.grass.putTileAt(grass, x, y);
          else this.grass.removeTileAt(x, y);
          changed = true;
        }
      }
    }
    this.drawZones();
    this.drawSpawns();
    return changed;
  }

  zoneAt(x: number, y: number): EventZone | undefined {
    return this.terrain ? zoneAt(this.terrain, x, y) : undefined;
  }

  spawnAt(x: number, y: number): WorldSpawn | undefined {
    return this.terrain?.spawns.find((s) => s.x === x && s.y === y);
  }

  private centre(x: number, y: number): { x: number; y: number } {
    return { x: x * this.tileSize + this.tileSize / 2, y: y * this.tileSize + this.tileSize / 2 };
  }

  /** A few twinkling sparkles on the tiles where rare monsters live for now. */
  private drawZones(): void {
    for (const o of this.zoneMarks) o.destroy();
    this.zoneMarks = [];
    for (const zone of this.terrain?.zones ?? []) {
      zone.tiles.forEach((key, i) => {
        if (i % 3 !== 0) return; // not every tile: a hint, not a carpet
        const { x, y } = fromKey(key);
        const c = this.centre(x, y);
        const mark = addIcon(this.scene, c.x + 14, c.y - 14, "sparkle", 22).setDepth(DEPTH_ZONE).setAlpha(0.7);
        this.scene.tweens.add({ targets: mark, alpha: 0.2, duration: 900 + (i % 5) * 150, yoyo: true, repeat: -1 });
        this.zoneMarks.push(mark);
      });
    }
  }

  /** The UFO's alien (or any single waiting monster): its picture on the tile, glowing — dim while someone battles it. */
  private drawSpawns(): void {
    const wanted = new Map((this.terrain?.spawns ?? []).map((s) => [s.id, s]));
    for (const [id, views] of this.spawnViews) {
      if (wanted.has(id)) continue;
      for (const v of views) v.destroy();
      this.spawnViews.delete(id);
    }
    for (const spawn of wanted.values()) {
      const taken = Boolean(spawn.claimedBy && spawn.claimedUntil && Date.parse(spawn.claimedUntil) > Date.now());
      let views = this.spawnViews.get(spawn.id);
      if (!views) {
        const c = this.centre(spawn.x, spawn.y);
        const glow = this.scene.add.circle(c.x, c.y, this.tileSize * 0.45, KANAGAWA.springGreen, 0.35).setDepth(DEPTH_SPAWN);
        this.scene.tweens.add({ targets: glow, scale: 1.25, alpha: 0.1, duration: 800, yoyo: true, repeat: -1 });
        // The species' own picture (its spriteFront texture: a drawing, or the placeholder).
        const sprite = this.scene.add.image(c.x, c.y - 6, this.spriteKey(spawn)).setDepth(DEPTH_SPAWN);
        sprite.setDisplaySize(this.tileSize * 0.9, this.tileSize * 0.9);
        this.scene.tweens.add({ targets: sprite, y: c.y - 12, duration: 600, yoyo: true, repeat: -1, ease: "Sine.inOut" });
        views = [glow, sprite];
        this.spawnViews.set(spawn.id, views);
      }
      for (const v of views) (v as Phaser.GameObjects.Image).setAlpha(taken ? 0.35 : 1);
    }
  }

  private spriteKey(spawn: WorldSpawn): string {
    return this.spriteOf(spawn.speciesId) ?? "__MISSING";
  }

  /** The warning: danger tiles glow red, the disaster's icon hovers over its centre with a countdown. */
  showWarning(message: DisasterMessage): void {
    this.clearWarning();
    const g = this.scene.add.graphics().setDepth(DEPTH_WARNING);
    g.fillStyle(C.danger, 1);
    for (const key of message.danger) {
      const { x, y } = fromKey(key);
      g.fillRect(x * this.tileSize + 2, y * this.tileSize + 2, this.tileSize - 4, this.tileSize - 4);
    }
    g.setAlpha(0.2);
    this.scene.tweens.add({ targets: g, alpha: 0.5, duration: 450, yoyo: true, repeat: -1 });
    const c = this.centre(message.center.x, message.center.y);
    const icon = addIcon(this.scene, c.x, c.y - this.tileSize * 0.6, DISASTER_ICONS[message.kind], this.tileSize * 1.6).setDepth(DEPTH_WARNING + 3);
    this.scene.tweens.add({ targets: icon, y: icon.y - 12, duration: 400, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    this.warning = [g, icon];
    const countdown = () => {
      const left = Math.max(0, Math.ceil((Date.parse(message.strikeAt) - Date.now()) / 1000));
      this.warning[2]?.destroy();
      this.warning[2] = richChip(this.scene, c.x, c.y + this.tileSize * 0.55, `${left}`, { fontFamily: FONT, fontSize: "30px", color: CSS.accent }).setDepth(DEPTH_WARNING + 3);
    };
    countdown();
    this.warningTimer = this.scene.time.addEvent({ delay: 250, loop: true, callback: countdown });
  }

  clearWarning(): void {
    this.warningTimer?.remove();
    this.warningTimer = undefined;
    for (const o of this.warning) o?.destroy();
    this.warning = [];
  }

  /** The strike itself: a flash and a shake to match, and the icon bursting at the centre. */
  strike(message: DisasterMessage): void {
    this.clearWarning();
    const camera = this.scene.cameras.main;
    const effects: Record<DisasterKind, () => void> = {
      meteor: () => {
        camera.flash(450, 255, 160, 102);
        camera.shake(600, 0.012);
      },
      ufo: () => {
        camera.flash(500, 152, 187, 108);
        camera.shake(500, 0.01);
      },
      earthquake: () => camera.shake(1400, 0.02),
      flood: () => camera.flash(700, 127, 180, 202),
      hurricane: () => {
        camera.flash(300, 220, 215, 186);
        camera.shake(900, 0.008);
      },
      dragonfire: () => camera.flash(600, 195, 64, 67),
    };
    effects[message.kind]();
    const c = this.centre(message.center.x, message.center.y);
    const burst = addIcon(this.scene, c.x, c.y, DISASTER_ICONS[message.kind], this.tileSize * 1.2).setDepth(DEPTH_WARNING + 3);
    this.scene.tweens.add({ targets: burst, scale: burst.scale * 3, alpha: 0, duration: 900, ease: "Cubic.out", onComplete: () => burst.destroy() });
  }

  destroy(): void {
    this.clearWarning();
    for (const o of this.zoneMarks) o.destroy();
    for (const views of this.spawnViews.values()) for (const v of views) v.destroy();
    this.zoneMarks = [];
    this.spawnViews.clear();
  }
}
