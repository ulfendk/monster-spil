import Phaser from "phaser";
import * as THREE from "three";
import { DEFAULT_VIEW, MapStage, VIEW_LIMITS, type MapTileIds, type MapView } from "./map-stage";
import { mapHint } from "../gfx/map-hints";
import { placeholderSpec } from "../gfx/placeholder-sprites";
import { buildMonsterModel, type MonsterModel } from "../cave/monster-model";
import { buildFoodModel, foodModelFor, type FoodModelIcon } from "./food-models";
import { buildAvatarModel, type AvatarModel } from "./avatar-model";
import { PeekLayer } from "./peeks";
import type { AreaLook3d } from "@shared";
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
  /** How this world looks in 3D (its trees, peaks and sky). */
  look?: AreaLook3d;
  /** Where the camera follows (map pixels): the player. */
  focus: () => { x: number; y: number };
}

type Kind = "stand" | "flat" | "float";

interface Mirror {
  kind: "stand" | "flat";
  /** A sprite or a ground decal — or the root of a monster's 3D model. */
  object: THREE.Object3D;
  model?: MonsterModel;
  /** Food, as its 3D model (world3d/food-models.ts). */
  food?: FoodModelIcon;
  /** A player's animal figure (world3d/avatar-model.ts), and what it wears now. */
  avatar?: AvatarModel;
  avatarKey?: string;
  /** Walking: where it was last frame, how much it's walking (eased), the step's phase, which way it faces. */
  walk?: { x: number; z: number; amount: number; phase: number; heading?: number };
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
/** Where this device remembers how the camera was left (a convenience; losing it is fine). */
const VIEW_KEY = "monsterjagt-kamera";

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
  /** Monsters peeking out of the tall grass (OverworldScene decides where and who). */
  readonly peeks: PeekLayer;

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
        look: options.look,
        tileAt: (x, y) => ({ ground: options.ground.getTileAt(x, y)?.index ?? 0, grass: options.grass.getTileAt(x, y)?.index ?? 0 }),
      });
    } catch (error) {
      this.canvas.remove();
      throw error;
    }
    this.disc = this.makeDisc();
    this.peeks = new PeekLayer(this.stage);
    this.stage.view = Map3D.loadView();
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

  // ------------------------------------------------------------ camera mode

  /** Which way the camera faces: 0 = north is up the screen. Walking turns with it. */
  get yaw(): number {
    return this.stage.view.yaw;
  }

  /** Whether the camera has been turned, tilted or zoomed from the usual view. */
  get turned(): boolean {
    const v = this.stage.view;
    return v.yaw !== DEFAULT_VIEW.yaw || v.pitch !== DEFAULT_VIEW.pitch || v.zoom !== DEFAULT_VIEW.zoom;
  }

  /** A finger dragged `dx`, `dy` px in camera mode: sideways turns around the player, up and down tilts. */
  orbit(dx: number, dy: number): void {
    const v = this.stage.view;
    v.yaw -= (dx / Math.max(200, this.canvas.clientWidth)) * Math.PI * 1.2;
    v.pitch = Phaser.Math.Clamp(v.pitch + dy * 0.25, VIEW_LIMITS.pitch[0], VIEW_LIMITS.pitch[1]);
    this.saveView();
  }

  /** Two fingers pinched: `factor` < 1 brings the camera closer. */
  zoomBy(factor: number): void {
    const v = this.stage.view;
    v.zoom = Phaser.Math.Clamp(v.zoom * factor, VIEW_LIMITS.zoom[0], VIEW_LIMITS.zoom[1]);
    this.saveView();
  }

  /** Back to the usual view: from the south, north up. The camera swings back over a moment. */
  resetView(): void {
    const from = { ...this.stage.view };
    // The short way round.
    const yaw = Math.atan2(Math.sin(from.yaw), Math.cos(from.yaw));
    const swing = { k: 0 };
    this.scene.tweens.add({
      targets: swing,
      k: 1,
      duration: 450,
      ease: "Sine.inOut",
      onUpdate: () => {
        this.stage.view = {
          yaw: yaw * (1 - swing.k),
          pitch: from.pitch + (DEFAULT_VIEW.pitch - from.pitch) * swing.k,
          zoom: from.zoom + (DEFAULT_VIEW.zoom - from.zoom) * swing.k,
        };
      },
      onComplete: () => {
        this.stage.view = { ...DEFAULT_VIEW };
        this.saveView();
      },
    });
  }

  private saveView(): void {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(this.stage.view));
    } catch {
      // Private mode or blocked storage: the view just isn't remembered.
    }
  }

  private static loadView(): MapView {
    try {
      const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? "null") as Partial<MapView> | null;
      if (v && [v.yaw, v.pitch, v.zoom].every((n) => typeof n === "number" && Number.isFinite(n))) {
        return {
          yaw: v.yaw!,
          pitch: Phaser.Math.Clamp(v.pitch!, VIEW_LIMITS.pitch[0], VIEW_LIMITS.pitch[1]),
          zoom: Phaser.Math.Clamp(v.zoom!, VIEW_LIMITS.zoom[0], VIEW_LIMITS.zoom[1]),
        };
      }
    } catch {
      // Nothing stored, or storage blocked: the usual view.
    }
    return { ...DEFAULT_VIEW };
  }

  destroy(): void {
    this.scene.events.off("prerender", this.beforeRender, this);
    this.scene.events.off("render", this.afterRender, this);
    this.scene.scale.off("resize", this.fit, this);
    for (const t of this.textures.values()) t.dispose();
    this.disc.dispose();
    this.peeks.destroy();
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
    this.peeks.update();

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
      if (m.model) m.model.dispose();
      else if (m.avatar) m.avatar.dispose();
      else if (m.food) {
        // (The food's geometry and look are shared by all food: nothing to free.)
      }
      else ((m.object as THREE.Mesh).material as THREE.Material).dispose();
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
    const gx = o.x / this.T, gz = (o.y + (hint?.dy ?? 0)) / this.T;
    const p = this.stage.project(gx, (hint?.lift ?? 0) + this.stage.heightAt(gx, gz), gz);
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
    if (hint?.avatar) {
      // A player: their animal standing on their spot (a new hat or badge: dressed again).
      const spec = hint.avatar();
      const key = `${spec.id}|${spec.look ?? ""}|${spec.badges.join(",")}`;
      if (m.avatarKey !== key || !m.avatar) {
        m.avatar?.dispose();
        m.object.clear();
        m.avatar = buildAvatarModel(spec, (icon) => this.iconTexture(icon));
        m.object.add(m.avatar.root);
        m.avatarKey = key;
      }
      m.object.visible = visible;
      const x = cx / T, z = cy / T;
      m.object.position.set(x, this.stage.heightAt(x, z), z);
      m.object.scale.setScalar(1.35);
      // Walking: steps in time with how fast it moves, and it faces the way it goes; standing,
      // it turns back to the camera, leaning back a little so the face shows from up there.
      const dt = Math.max(1, this.scene.game.loop.delta) / 1000;
      const w = (m.walk ??= { x, z, amount: 0, phase: 0 });
      const speed = Math.hypot(x - w.x, z - w.z) / dt;
      const moving = speed > 0.3;
      w.amount += ((moving ? 1 : 0) - w.amount) * Math.min(1, dt * 10);
      w.phase += dt * (moving ? 9 + speed * 1.5 : 9);
      if (moving) w.heading = Math.atan2(x - w.x, z - w.z);
      w.x = x;
      w.z = z;
      m.avatar.walk(w.phase, w.amount);
      const cam = this.stage.camera.position;
      const toCamera = Math.atan2(cam.x - x, cam.z - z);
      const target = w.heading !== undefined && w.amount > 0.05 ? w.heading : toCamera;
      if (w.amount <= 0.05) w.heading = undefined;
      // The short way round, eased.
      const current = m.object.rotation.y;
      const turn = Math.atan2(Math.sin(target - current), Math.cos(target - current));
      m.object.rotation.order = "YXZ";
      m.object.rotation.set(-0.5 * (1 - w.amount * 0.6), current + turn * Math.min(1, dt * 12), 0);
      m.object.traverse((o) => {
        const material = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (material) {
          material.transparent = alpha < 0.99;
          material.opacity = Math.min(1, alpha);
        }
      });
      this.updateShadow(m, visible, 0, cx, cy, T * 0.75, alpha);
      return;
    }
    if (m.food) {
      // Food lies on the ground, turning slowly and bobbing a little, so it catches the eye.
      const t = performance.now() / 1000;
      const phase = (cx * 0.37 + cy * 0.21) % 6.28;
      m.object.visible = visible;
      m.object.position.set(cx / T, this.stage.heightAt(cx / T, cy / T) + 0.03 + Math.max(0, Math.sin(t * 2 + phase)) * 0.05, cy / T);
      m.object.scale.setScalar((w / T) * 1.6);
      m.object.rotation.set(0, t * 0.8 + phase, 0);
      this.updateShadow(m, visible, 0, cx, cy, w * 0.8, alpha);
      return;
    }
    if (m.model) {
      // A monster the game draws itself, as its 3D model: standing on its spot, turned to the camera.
      const lift = hint?.lift ?? 0;
      m.object.visible = visible;
      m.object.position.set(cx / T, this.stage.heightAt(cx / T, cy / T) + h / T / 2 + lift, cy / T);
      m.object.scale.set((w / T) * (g.flipX ? -1 : 1), h / T, w / T);
      const cam = this.stage.camera.position;
      m.object.rotation.set(0, Math.atan2(cam.x - m.object.position.x, cam.z - m.object.position.z), -g.rotation);
      m.model.setOpacity(Math.min(1, alpha));
      this.updateShadow(m, visible, hint?.lift ?? 0, cx, cy, w, alpha);
      return;
    }
    const material = (m.object as THREE.Mesh).material as THREE.SpriteMaterial | THREE.MeshBasicMaterial;
    material.opacity = Math.min(1, alpha);
    if (shape) material.color.setHex(g.fillColor);
    else material.color.setHex(g.isTinted ? g.tintTopLeft : 0xffffff);
    if (!shape && !m.model && !m.food && !mapHint(o)?.avatar) this.retexture(m, g);
    m.object.visible = visible;
    const depth = (g as unknown as { depth: number }).depth ?? 0;
    // Everything stands (or lies) on the land, which rolls.
    const ground = this.stage.heightAt(cx / T, cy / T);
    if (kind === "flat") {
      m.object.position.set(cx / T, ground + 0.03 + depth * 0.002, cy / T);
      m.object.scale.set(w / T, 1, h / T);
      m.object.rotation.y = -g.rotation;
    } else {
      const lift = hint?.lift ?? 0;
      m.object.position.set(cx / T, ground + h / T / 2 + lift, cy / T);
      // Things drawn over each other on the 2D map (a face on its circle) stay in that order.
      m.object.position.add(this.stage.camera.position.clone().sub(m.object.position).normalize().multiplyScalar(depth * 0.012));
      m.object.scale.set((w / T) * (g.flipX ? -1 : 1), h / T, 1);
      (material as THREE.SpriteMaterial).rotation = -g.rotation;
    }
    this.updateShadow(m, visible, hint?.lift ?? 0, cx, cy, w, alpha);
  }

  private updateShadow(m: Mirror, visible: boolean, lift: number, cx: number, cy: number, w: number, alpha: number): void {
    if (!m.shadow) return;
    const T = this.T;
    m.shadow.visible = visible && lift < 0.5;
    m.shadow.position.set(cx / T, this.stage.heightAt(cx / T, cy / T) + 0.02, cy / T + 0.04);
    m.shadow.scale.set((w / T) * 0.85, 1, (w / T) * 0.38);
    (m.shadow.material as THREE.MeshBasicMaterial).opacity = 0.32 * Math.min(1, alpha);
  }

  private make(o: Phaser.GameObjects.GameObject, kind: "stand" | "flat"): Mirror {
    const g = o as Phaser.GameObjects.Image;
    const round = o instanceof Phaser.GameObjects.Arc || o instanceof Phaser.GameObjects.Ellipse;
    const picture = o instanceof Phaser.GameObjects.Image;
    const map = round ? this.disc : picture ? this.textureFor(g) : null;
    // A monster the game draws itself (the dragon, a beast, a waiting monster) stands there as its 3D model.
    const spec = picture && kind === "stand" ? placeholderSpec(g.texture.key) : undefined;
    let object: THREE.Object3D;
    let model: MonsterModel | undefined;
    // Food (an apple, a carrot…) lies there as its 3D model.
    const food = picture && kind === "stand" ? foodModelFor(g.texture.key) : undefined;
    if (spec) {
      model = buildMonsterModel(spec);
      object = model.root;
    } else if (food) {
      object = buildFoodModel(food);
    } else if (mapHint(o)?.avatar) {
      object = new THREE.Group(); // the figure is put in on the first frame (and whenever it changes)
    } else if (kind === "stand") {
      object = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, alphaTest: 0.35, fog: true }));
    } else {
      object = new THREE.Mesh(this.flatPlane, new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, fog: true }));
    }
    object.userData.source = o;
    this.stage.scene.add(object);
    const mirror: Mirror = { kind, object, seen: true, textureKey: picture ? this.keyOf(g) : undefined, ...(model ? { model } : {}), ...(food ? { food } : {}) };
    // The bigger standing things (players, monsters, the dragon) get a soft shadow at their feet, and can be tapped.
    const big = Math.max(Math.abs(g.displayWidth), Math.abs(g.displayHeight)) >= TOKEN_PX;
    if (kind === "stand" && (o instanceof Phaser.GameObjects.Arc || big || food || mapHint(o)?.avatar)) {
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
    const material = (m.object as THREE.Sprite).material;
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

  /** A drawn icon (`icon-<name>`) as a three.js texture: for the badges on a figure's chest. */
  private iconTexture(name: string): THREE.Texture | undefined {
    const key = `icon-${name}`;
    const cached = this.textures.get(key);
    if (cached) return cached;
    if (!this.scene.textures.exists(key)) return undefined;
    const texture = new THREE.Texture(this.scene.textures.get(key).getSourceImage() as HTMLCanvasElement);
    texture.colorSpace = THREE.SRGBColorSpace;
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
