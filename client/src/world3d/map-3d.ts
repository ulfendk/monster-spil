import Phaser from "phaser";
import * as THREE from "three";
import { MapStage, type MapTileIds } from "./map-stage";
import { mapHint } from "../gfx/map-hints";
import { KANAGAWA } from "../ui/theme";

/**
 * The overworld's 3D view, over the 2D map it replaces (OverworldScene keeps running the
 * 2D one: tiles, collisions, tweens, everything the game does is unchanged).
 *
 * Every frame, just before Phaser draws, this looks at what the scene has on the map and
 * shows it in 3D instead:
 * - pictures and circles (players, monsters, the dragon, food, icons) become sprites that
 *   stand upright on their spot in the 3D world (hidden from Phaser's camera), with a soft
 *   shadow under the bigger ones;
 * - ellipses and rectangles (shadows, glows, marked tiles) lie flat on the ground;
 * - everything else (names, health labels, the cave mouth) stays Phaser's, moved to where
 *   its spot is on screen and scaled with the distance — for that frame only; afterwards it
 *   is put back, so tweens and game code never notice.
 * A few objects say how they stand with a hint (gfx/map-hints.ts).
 */

export interface Map3DOptions {
  ground: Phaser.Tilemaps.TilemapLayer;
  grass: Phaser.Tilemaps.TilemapLayer;
  tileset: HTMLImageElement | HTMLCanvasElement;
  tileSize: number;
  ids: MapTileIds;
  /** Where the camera follows (map pixels): the player. */
  focus: () => { x: number; y: number };
}

type Kind = "stand" | "flat" | "float";

interface Mirror {
  kind: "stand" | "flat";
  object: THREE.Mesh | THREE.Sprite;
  shadow?: THREE.Mesh;
  textureKey?: string;
  seen: boolean;
}

interface Moved {
  object: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Visible;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  sfx: number;
  sfy: number;
  visible: boolean;
}

/** How often (ms) the tiles are compared with what's drawn (felled trees, disasters). */
const SYNC_MS = 300;
/** Pictures at least this big (px) cast a shadow and can be tapped in 3D. */
const TOKEN_PX = 48;

export class Map3D {
  private readonly stage: MapStage;
  private readonly canvas: HTMLCanvasElement;
  private readonly mirrors = new Map<Phaser.GameObjects.GameObject, Mirror>();
  private readonly textures = new Map<string, THREE.Texture>();
  private readonly disc: THREE.Texture;
  private readonly flatPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private moved: Moved[] = [];
  private readonly centre = new THREE.Vector2();
  private centred = false;
  private sinceSync = 0;
  private readonly T: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: Map3DOptions
  ) {
    this.T = options.tileSize;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "cave-stage";
    document.getElementById("game")!.prepend(this.canvas);
    try {
      this.stage = new MapStage(this.canvas, {
        width: options.ground.layer.width,
        height: options.ground.layer.height,
        tileset: options.tileset,
        tilePx: options.tileSize,
        ids: options.ids,
        tileAt: (x, y) => ({ ground: options.ground.getTileAt(x, y)?.index ?? 0, grass: options.grass.getTileAt(x, y)?.index ?? 0 }),
      });
    } catch (error) {
      this.canvas.remove();
      throw error;
    }
    this.disc = this.makeDisc();
    options.ground.setVisible(false);
    options.grass.setVisible(false);
    scene.events.on("prerender", this.beforeRender, this);
    scene.events.on("render", this.afterRender, this);
    scene.scale.on("resize", this.fit, this);
    scene.events.once("shutdown", () => this.destroy());
    this.fit();
  }

  /** The tile under a point on the screen: a player, monster or the dragon standing there first, else the ground. */
  tileAt(sx: number, sy: number): { x: number; y: number } | undefined {
    const tokens = [...this.mirrors.values()].filter((m) => m.kind === "stand" && m.shadow && m.object.visible).map((m) => m.object);
    const hit = this.stage.pick(sx, sy, tokens);
    const source = hit?.userData.source as (Phaser.GameObjects.GameObject & { x: number; y: number }) | undefined;
    if (source) return { x: Math.floor(source.x / this.T), y: Math.floor(source.y / this.T) };
    const ground = this.stage.groundAt(sx, sy);
    return ground ? { x: Math.floor(ground.x), y: Math.floor(ground.z) } : undefined;
  }

  destroy(): void {
    this.scene.events.off("prerender", this.beforeRender, this);
    this.scene.events.off("render", this.afterRender, this);
    this.scene.scale.off("resize", this.fit, this);
    for (const t of this.textures.values()) t.dispose();
    this.disc.dispose();
    this.stage.destroy();
    this.canvas.remove();
  }

  private fit(): void {
    const host = document.getElementById("game");
    if (host) this.stage.resize(host.clientWidth, host.clientHeight);
  }

  // ------------------------------------------------------------ every frame

  private beforeRender(): void {
    const delta = this.scene.game.loop.delta;
    this.sinceSync += delta;
    if (this.sinceSync > SYNC_MS) {
      this.sinceSync = 0;
      this.stage.sync();
    }
    // The camera follows the player softly, and shakes when Phaser's camera shakes.
    const focus = this.options.focus();
    if (!this.centred) this.centre.set(focus.x, focus.y);
    this.centre.lerp(new THREE.Vector2(focus.x, focus.y), 1 - Math.exp(-delta / 90));
    this.centred = true;
    const shake = this.scene.cameras.main.shakeEffect as unknown as { isRunning: boolean; _offsetX: number; _offsetY: number };
    const sx = shake.isRunning ? shake._offsetX : 0;
    const sy = shake.isRunning ? shake._offsetY : 0;
    this.stage.lookAt((this.centre.x - sx) / this.T, (this.centre.y - sy) / this.T);

    for (const m of this.mirrors.values()) m.seen = false;
    this.moved = [];
    for (const object of this.scene.children.list) {
      const o = object as Phaser.GameObjects.GameObject & Partial<Phaser.GameObjects.Components.ScrollFactor>;
      if (o instanceof Phaser.Tilemaps.TilemapLayer || o.scrollFactorX !== 1 || !o.active) continue;
      const kind = this.kindOf(o);
      if (kind === "float") this.float(o as Moved["object"]);
      else this.mirror(o, kind);
    }
    for (const [o, m] of this.mirrors) {
      if (m.seen) continue;
      this.stage.scene.remove(m.object);
      if (m.shadow) this.stage.scene.remove(m.shadow);
      (m.object.material as THREE.Material).dispose();
      (m.shadow?.material as THREE.Material | undefined)?.dispose();
      this.mirrors.delete(o);
    }
    this.stage.render();
  }

  /** Puts the floating labels back where the game had them. */
  private afterRender(): void {
    for (const m of this.moved) {
      m.object.setScrollFactor(m.sfx, m.sfy);
      m.object.setPosition(m.x, m.y);
      m.object.setScale(m.scaleX, m.scaleY);
      m.object.setVisible(m.visible);
    }
    this.moved = [];
  }

  private kindOf(o: Phaser.GameObjects.GameObject): Kind {
    const hint = mapHint(o);
    if (hint?.flat) return "flat";
    if (o instanceof Phaser.GameObjects.Ellipse || o instanceof Phaser.GameObjects.Rectangle) return "flat";
    if (o instanceof Phaser.GameObjects.Image || o instanceof Phaser.GameObjects.Arc) return "stand";
    return "float";
  }

  /** A label or drawing that stays Phaser's: moved to its spot's place on screen for this frame. */
  private float(o: Moved["object"]): void {
    const hint = mapHint(o);
    this.moved.push({ object: o, x: o.x, y: o.y, scaleX: o.scaleX, scaleY: o.scaleY, sfx: o.scrollFactorX, sfy: o.scrollFactorY, visible: o.visible });
    const p = this.stage.project(o.x / this.T, hint?.lift ?? 0, (o.y + (hint?.dy ?? 0)) / this.T);
    const s = Phaser.Math.Clamp(p.perTile / this.T, 0.55, 1.5);
    o.setScrollFactor(0);
    o.setPosition(p.x, p.y);
    o.setScale(o.scaleX * s, o.scaleY * s);
    if (p.behind) o.setVisible(false);
  }

  // ------------------------------------------------------------ the 3D stand-ins

  private mirror(o: Phaser.GameObjects.GameObject, kind: "stand" | "flat"): void {
    let m = this.mirrors.get(o);
    if (!m || m.kind !== kind) {
      if (m) this.stage.scene.remove(m.object);
      m = this.make(o, kind);
      this.mirrors.set(o, m);
      this.scene.cameras.main.ignore(o);
    }
    m.seen = true;
    const T = this.T;
    const hint = mapHint(o);
    const g = o as Phaser.GameObjects.Image & Phaser.GameObjects.Arc & Phaser.GameObjects.Ellipse;
    const arc = o instanceof Phaser.GameObjects.Arc;
    const shape = arc || o instanceof Phaser.GameObjects.Ellipse || o instanceof Phaser.GameObjects.Rectangle;
    const w = Math.abs(g.displayWidth);
    const h = Math.abs(g.displayHeight);
    const cx = g.x + (0.5 - g.originX) * w;
    const cy = g.y + (0.5 - g.originY) * h + (hint?.dy ?? 0);
    const alpha = g.alpha * (shape ? g.fillAlpha : 1);
    const visible = g.visible && alpha > 0.01 && w > 0.5 && h > 0.5;
    const material = m.object.material as THREE.SpriteMaterial | THREE.MeshBasicMaterial;
    material.opacity = Math.min(1, alpha);
    if (shape) material.color.setHex(g.fillColor);
    else material.color.setHex(g.isTinted ? g.tintTopLeft : 0xffffff);
    if (!shape) this.retexture(m, g);
    m.object.visible = visible;
    const depth = (g as unknown as { depth: number }).depth ?? 0;
    if (kind === "flat") {
      m.object.position.set(cx / T, 0.02 + depth * 0.002, cy / T);
      m.object.scale.set(w / T, 1, h / T);
      m.object.rotation.y = -g.rotation;
    } else {
      const lift = hint?.lift ?? 0;
      m.object.position.set(cx / T, h / T / 2 + lift, cy / T);
      // Things drawn over each other on the 2D map (a face on its circle) stay in that order.
      m.object.position.add(this.stage.camera.position.clone().sub(m.object.position).normalize().multiplyScalar(depth * 0.012));
      m.object.scale.set((w / T) * (g.flipX ? -1 : 1), h / T, 1);
      (material as THREE.SpriteMaterial).rotation = -g.rotation;
    }
    if (m.shadow) {
      m.shadow.visible = visible && (hint?.lift ?? 0) < 0.5;
      m.shadow.position.set(cx / T, 0.015, cy / T + 0.04);
      m.shadow.scale.set((w / T) * 0.85, 1, (w / T) * 0.38);
      (m.shadow.material as THREE.MeshBasicMaterial).opacity = 0.32 * Math.min(1, alpha);
    }
  }

  private make(o: Phaser.GameObjects.GameObject, kind: "stand" | "flat"): Mirror {
    const g = o as Phaser.GameObjects.Image;
    const round = o instanceof Phaser.GameObjects.Arc || o instanceof Phaser.GameObjects.Ellipse;
    const picture = o instanceof Phaser.GameObjects.Image;
    const map = round ? this.disc : picture ? this.textureFor(g) : null;
    let object: THREE.Mesh | THREE.Sprite;
    if (kind === "stand") {
      object = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, alphaTest: 0.35, fog: true }));
    } else {
      object = new THREE.Mesh(this.flatPlane, new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, fog: true }));
    }
    object.userData.source = o;
    this.stage.scene.add(object);
    const mirror: Mirror = { kind, object, seen: true, textureKey: picture ? this.keyOf(g) : undefined };
    // The bigger standing things (players, monsters, the dragon) get a soft shadow at their feet, and can be tapped.
    const big = Math.max(Math.abs(g.displayWidth), Math.abs(g.displayHeight)) >= TOKEN_PX;
    if (kind === "stand" && (o instanceof Phaser.GameObjects.Arc || big)) {
      mirror.shadow = new THREE.Mesh(this.flatPlane, new THREE.MeshBasicMaterial({ map: this.disc, color: KANAGAWA.sumiInk0, transparent: true, depthWrite: false }));
      this.stage.scene.add(mirror.shadow);
    }
    return mirror;
  }

  private keyOf(g: Phaser.GameObjects.Image): string {
    return `${g.texture.key}#${g.frame.name}`;
  }

  /** A picture changed (a new hat, another frame): swap its texture. */
  private retexture(m: Mirror, g: Phaser.GameObjects.Image): void {
    const key = this.keyOf(g);
    if (m.textureKey === key) return;
    m.textureKey = key;
    const material = m.object.material as THREE.SpriteMaterial;
    material.map = this.textureFor(g);
    material.needsUpdate = true;
  }

  /** The three.js texture for a Phaser picture (a whole image, or one frame of a sheet). */
  private textureFor(g: Phaser.GameObjects.Image): THREE.Texture {
    const key = this.keyOf(g);
    const cached = this.textures.get(key);
    if (cached) return cached;
    const frame = g.frame;
    const source = frame.source;
    const texture = new THREE.Texture(source.image as HTMLImageElement | HTMLCanvasElement);
    texture.colorSpace = THREE.SRGBColorSpace;
    if (frame.cutWidth !== source.width || frame.cutHeight !== source.height) {
      texture.repeat.set(frame.cutWidth / source.width, frame.cutHeight / source.height);
      texture.offset.set(frame.cutX / source.width, 1 - (frame.cutY + frame.cutHeight) / source.height);
    }
    texture.needsUpdate = true;
    this.textures.set(key, texture);
    return texture;
  }

  /** A soft-edged white disc: circles, ellipses and shadows are drawn with it (tinted). */
  private makeDisc(): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff";
    g.beginPath();
    g.arc(32, 32, 31, 0, Math.PI * 2);
    g.fill();
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
}
