import * as THREE from "three";
import { setMonsterEnvironment } from "../cave/monster-model";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { AreaLook3d } from "@shared";
import { KANAGAWA } from "../ui/theme";

/** A palette colour by name, or the fallback. */
const colour = (name: string | undefined, fallback: number) => (name ? ((KANAGAWA as Record<string, number>)[name] ?? fallback) : fallback);

/**
 * The overworld in 3D (three.js, loaded when the map opens): a landscape seen from above at an
 * angle. The tiles are still the game's grid, but they're drawn as one continuous land: the
 * ground rolls a little, rises into real mountains where the mountain tiles are (rugged,
 * with snow up high — or glowing, on a volcano) and dips into beds where the water is, with a
 * water surface over them that ripples, and foam along the shores (lava glows instead). The
 * colours come from the world's own tileset (meadow, path, sand, forest floor, tall grass
 * gold, ash, snow…) and blend into each other across ragged, natural edges, with a painted
 * texture of their own. Pines, cherry trees, susuki, stumps, fallen logs, rubble and the UFO's
 * wreck stand on it as models. Craters, holes and fissures are dips in the ground.
 *
 * The map is cut into chunks, so only what the camera sees is drawn, and the land around a
 * changed tile (a felled tree, a disaster, a hole) is rebuilt.
 *
 * Units: one tile = one unit; x runs east, z south (the map's y), y is up. Tile (x, y) covers
 * x…x+1, y…y+1. The land's height anywhere: `heightAt`. It renders into its own canvas under
 * Phaser's.
 */

/** Which tile ids mean what (the area's `terrain` ids); what isn't given is plain ground. */
export interface MapTileIds {
  ground: number;
  water?: number;
  flood?: number;
  /** Tall grass (on the grass layer): the encounter zones, golden meadow with susuki. */
  grass?: number;
  tree?: number;
  mountain?: number;
  path?: number;
  sand?: number;
  burnt?: number;
  crater?: number;
  log?: number;
  crack?: number;
  rubble?: number;
  wreck?: number;
  stump?: number;
  hole?: number;
  /** Other blocking tiles drawn as trees (an area without `terrain` ids). */
  extraTrees?: number[];
}

export interface MapSource {
  width: number;
  height: number;
  /** The tileset image (its tiles' colours colour the land) and its tile size. */
  tileset: HTMLImageElement | HTMLCanvasElement;
  tilePx: number;
  ids: MapTileIds;
  /** How this world looks: its trees, peaks, sky — and whether its water is lava. */
  look?: AreaLook3d;
  /** The ground tile id and whether tall grass grows there, right now (0 = none). */
  tileAt(x: number, y: number): { ground: number; grass: number };
}

const CHUNK = 16;
/** Land vertices per tile along each side (a vertex at every half tile). */
const SUB = 2;
/** The water's surface (the beds lie below it, the land above). */
const WATER_Y = -0.14;
/** How the camera looks down on the map (degrees above the horizon) and its field of view. */
const PITCH = 57;
const FOV = 38;

/** The camera's angle around the player, tilt and zoom (camera mode changes them). */
export interface MapView {
  /** Radians the camera has turned around the player; 0 = looking north from the south. */
  yaw: number;
  /** Degrees above the horizon it looks down from. */
  pitch: number;
  /** 1 = the usual distance; smaller is closer. */
  zoom: number;
}

export const DEFAULT_VIEW: MapView = { yaw: 0, pitch: PITCH, zoom: 1 };
/** How far camera mode may tilt and zoom. */
export const VIEW_LIMITS = { pitch: [28, 82], zoom: [0.55, 1.8] } as const;

type ModelKind = "pines" | "tufts" | "stumps" | "logs" | "rocks" | "wrecks";
const MODEL_KINDS: ModelKind[] = ["pines", "tufts", "stumps", "logs", "rocks", "wrecks"];

interface Chunk {
  cx: number;
  cy: number;
  land: THREE.Mesh;
  water: THREE.Mesh;
  models: Record<ModelKind, THREE.InstancedMesh>;
}

/** A stable pseudo-random number (0…1) for a tile, so things keep their shape between rebuilds. */
function hash(x: number, y: number, salt = 0): number {
  let h = Math.imul(x * 374761393 + y * 668265263 + salt * 2147483647, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise (0…1) over the map, for gentle hills and rugged mountains. */
function noise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = hash(ix, iz, 7), b = hash(ix + 1, iz, 7), c = hash(ix, iz + 1, 7), d = hash(ix + 1, iz + 1, 7);
  return a + (b - a) * s(fx) + (c - a) * s(fz) + (a - b - c + d) * s(fx) * s(fz);
}
const fbm = (x: number, z: number) => noise(x, z) * 0.6 + noise(x * 2.3, z * 2.3) * 0.3 + noise(x * 5.1, z * 5.1) * 0.1;

/** GLSL: value noise and a few octaves of it, for the painted texture on the land and the ripples. */
const GLSL_NOISE = `
float mh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float mnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mh(i), mh(i + vec2(1.0, 0.0)), u.x), mix(mh(i + vec2(0.0, 1.0)), mh(i + vec2(1.0, 1.0)), u.x), u.y);
}
float mfbm(vec2 p) { return mnoise(p) * 0.55 + mnoise(p * 2.7) * 0.3 + mnoise(p * 6.3) * 0.15; }
`;

export class MapStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 120);
  private readonly source: MapSource;
  private readonly chunks: Chunk[] = [];
  /** The tiles as last drawn: ground id and grass id per tile. */
  private readonly drawn: Int32Array;
  /** The land at every vertex (SUB per tile): height, and colour (linear RGB). */
  private readonly vx: number;
  private readonly vz: number;
  private readonly heights: Float32Array;
  private readonly colours: Float32Array;
  /** Each tile id's colour on the land, from the tileset (linear RGB). */
  private readonly palette = new Map<number, THREE.Color>();
  private readonly grassTint: THREE.Color;
  private readonly forestFloor: THREE.Color;
  private readonly rock: THREE.Color;
  private readonly landMaterial: THREE.Material;
  private readonly waterMaterial: THREE.Material;
  private readonly modelMaterial: THREE.Material;
  /** The susuki's own material: the same look, swaying in the breeze. */
  private readonly grassMaterial: THREE.Material;
  private readonly geometries: Record<ModelKind, THREE.BufferGeometry>;
  /** Seconds since the map opened, for the water and the breeze. */
  private readonly time = { value: 0 };
  private readonly clock = new THREE.Clock();
  private readonly raycaster = new THREE.Raycaster();
  private size = { width: 1, height: 1 };
  /** How many tiles wide the view is where the camera looks. */
  private viewTiles = 12;
  private readonly target = new THREE.Vector3();
  /** Where the camera looks from (camera mode turns, tilts and zooms it). */
  view: MapView = { ...DEFAULT_VIEW };

  constructor(canvas: HTMLCanvasElement, source: MapSource) {
    setMonsterEnvironment();
    this.source = source;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const look = source.look ?? {};
    this.scene.background = new THREE.Color(colour(look.sky, KANAGAWA.springBlue));
    this.scene.fog = new THREE.Fog(colour(look.fog, colour(look.sky, KANAGAWA.springBlue)), 30, 60);
    // (lookAt moves the fog with the camera's distance.)
    this.scene.add(new THREE.HemisphereLight(KANAGAWA.fujiWhite, KANAGAWA.sumiInk4, 1.6));
    const sun = new THREE.DirectionalLight(KANAGAWA.fujiWhite, 1.9);
    sun.position.set(-4, 7, 3);
    this.scene.add(sun);

    // The land's colours from the world's own tiles.
    const ids = source.ids;
    this.readPalette();
    const ground = this.tileColour(ids.ground);
    this.forestFloor = ground.clone().multiplyScalar(0.72);
    this.grassTint = ids.grass ? ground.clone().lerp(this.featureColour(ids.grass, ground), 0.55) : ground.clone();
    // The mountains' rock: what's drawn on the mountain tile, leaving out its snow-white peak.
    this.rock = ids.mountain ? this.featureColour(ids.mountain, ground, true) : new THREE.Color(KANAGAWA.sumiInk6);

    const lava = look.water === "lava";
    this.landMaterial = this.makeLandMaterial(look, lava);
    this.waterMaterial = this.makeWaterMaterial(ids.water ? this.tileColour(ids.water) : new THREE.Color(KANAGAWA.waveBlue2), lava);
    this.modelMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
    this.grassMaterial = this.makeGrassMaterial();
    this.geometries = {
      pines: MapStage.tree(look.tree ?? "pine"),
      tufts: MapStage.tuft(),
      stumps: MapStage.stump(),
      logs: MapStage.log(),
      rocks: MapStage.rock(),
      wrecks: MapStage.wreck(),
    };

    // Beyond the map's edge: forest floor, so the view never ends in empty sky.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(source.width + 120, source.height + 120), new THREE.MeshLambertMaterial({ color: this.forestFloor }));
    floor.rotation.x = -Math.PI / 2;
    // (Below the lake beds, so it never covers the water.)
    floor.position.set(source.width / 2, -0.8, source.height / 2);
    this.scene.add(floor);

    this.vx = source.width * SUB + 1;
    this.vz = source.height * SUB + 1;
    this.heights = new Float32Array(this.vx * this.vz);
    this.colours = new Float32Array(this.vx * this.vz * 3);
    this.drawn = new Int32Array(source.width * source.height * 2).fill(-1);
    for (let cy = 0; cy < Math.ceil(source.height / CHUNK); cy++) {
      for (let cx = 0; cx < Math.ceil(source.width / CHUNK); cx++) this.chunks.push(this.makeChunk(cx, cy));
    }
    this.sync();
  }

  // ------------------------------------------------------------ the view

  resize(width: number, height: number): void {
    this.size = { width, height };
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    // About as many tiles across as the 2D map shows, a little more on a narrow phone.
    this.viewTiles = Math.max(7.5, Math.min(15, (width / 64) * 0.85 + 1));
    this.camera.updateProjectionMatrix();
  }

  /** Looks at a point on the map (in tiles): from the south and above, or as camera mode left it. */
  lookAt(x: number, z: number): void {
    this.target.set(x, Math.max(0, this.heightAt(x, z)), z);
    const hfov = 2 * Math.atan(Math.tan((FOV * Math.PI) / 360) * this.camera.aspect);
    const distance = (this.viewTiles / 2 / Math.tan(hfov / 2)) * this.view.zoom;
    const pitch = (this.view.pitch * Math.PI) / 180;
    const across = Math.cos(pitch) * distance;
    this.camera.position.set(x + Math.sin(this.view.yaw) * across, this.target.y + Math.sin(pitch) * distance, z + Math.cos(this.view.yaw) * across);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
    // The mist starts past what the camera is looking at, however far away that is.
    const fog = this.scene.fog as THREE.Fog;
    fog.near = distance + 12;
    fog.far = distance + 40;
    this.camera.far = distance + 60;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.time.value += Math.min(0.1, this.clock.getDelta());
    this.renderer.render(this.scene, this.camera);
  }

  /** Where a point in the world (tiles) is on the canvas, in pixels, and how many pixels one tile is there. */
  project(x: number, y: number, z: number): { x: number; y: number; perTile: number; behind: boolean } {
    const p = new THREE.Vector3(x, y, z);
    const distance = p.distanceTo(this.camera.position);
    p.project(this.camera);
    const perTile = this.size.height / (2 * Math.tan((FOV * Math.PI) / 360) * distance);
    return { x: ((p.x + 1) / 2) * this.size.width, y: ((1 - p.y) / 2) * this.size.height, perTile, behind: p.z > 1 };
  }

  /** The land's height at a point (tiles): what things standing there stand on (never below the water). */
  heightAt(x: number, z: number): number {
    const gx = Math.min(this.vx - 1.001, Math.max(0, x * SUB));
    const gz = Math.min(this.vz - 1.001, Math.max(0, z * SUB));
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const h = (a: number, b: number) => this.heights[b * this.vx + a]!;
    const y = (h(i, j) * (1 - fx) + h(i + 1, j) * fx) * (1 - fz) + (h(i, j + 1) * (1 - fx) + h(i + 1, j + 1) * fx) * fz;
    return Math.max(WATER_Y - 0.08, y);
  }

  /** The point on the land under a point on the canvas (in tiles), if any. */
  groundAt(sx: number, sy: number): { x: number; z: number } | undefined {
    this.pointRay(sx, sy);
    const hit = this.raycaster.intersectObjects(this.chunks.map((c) => c.land), false)[0];
    if (hit) return { x: hit.point.x, z: hit.point.z };
    const flat = this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    return flat ? { x: flat.x, z: flat.z } : undefined;
  }

  /** The nearest of `objects` under a point on the canvas. */
  pick<T extends THREE.Object3D>(sx: number, sy: number, objects: T[]): T | undefined {
    this.pointRay(sx, sy);
    // (A model is a group of parts: the hit is a part; give back the object that was asked about.)
    const hit = this.raycaster.intersectObjects(objects, true)[0]?.object;
    let o: THREE.Object3D | null | undefined = hit;
    while (o && !objects.includes(o as T)) o = o.parent;
    return o as T | undefined;
  }

  private pointRay(sx: number, sy: number): void {
    this.raycaster.setFromCamera(new THREE.Vector2((sx / this.size.width) * 2 - 1, 1 - (sy / this.size.height) * 2), this.camera);
  }

  destroy(): void {
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
    });
    for (const m of [this.landMaterial, this.waterMaterial, this.modelMaterial, this.grassMaterial]) m.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  // ------------------------------------------------------------ the land's colours

  private tilePixels?: { data: Uint8ClampedArray; width: number };

  private readPalette(): void {
    const img = this.source.tileset;
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const g = canvas.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(img, 0, 0);
    this.tilePixels = { data: g.getImageData(0, 0, img.width, img.height).data, width: img.width };
  }

  /** The pixels (sRGB 0–255) of a tile in the tileset. */
  private *pixels(id: number): Generator<[number, number, number]> {
    const t = this.source.tilePx;
    const px = this.tilePixels;
    if (!px || id < 1) return;
    const cols = Math.max(1, Math.floor(px.width / t));
    const ox = ((id - 1) % cols) * t;
    const oy = Math.floor((id - 1) / cols) * t;
    for (let y = 2; y < t - 2; y++) {
      for (let x = 2; x < t - 2; x++) {
        const i = ((oy + y) * px.width + ox + x) * 4;
        if (px.data[i + 3]! > 128) yield [px.data[i]!, px.data[i + 1]!, px.data[i + 2]!];
      }
    }
  }

  /** A tile's average colour: what that kind of ground looks like from a little way off. */
  private tileColour(id: number): THREE.Color {
    const cached = this.palette.get(id);
    if (cached) return cached.clone();
    let r = 0, g = 0, b = 0, n = 0;
    for (const [pr, pg, pb] of this.pixels(id)) {
      r += pr; g += pg; b += pb; n++;
    }
    const c = n ? new THREE.Color().setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace) : new THREE.Color(KANAGAWA.autumnGreen);
    this.palette.set(id, c);
    return c.clone();
  }

  /** The colour of what's drawn on a tile over its background (the rock of a mountain, the plumes of tall grass). */
  private featureColour(id: number, background: THREE.Color, darkOnly = false): THREE.Color {
    const bg = background.clone().convertLinearToSRGB();
    let r = 0, g = 0, b = 0, n = 0;
    for (const [pr, pg, pb] of this.pixels(id)) {
      if (Math.abs(pr / 255 - bg.r) + Math.abs(pg / 255 - bg.g) + Math.abs(pb / 255 - bg.b) < 0.25) continue;
      if (darkOnly && pr + pg + pb > 480) continue;
      r += pr; g += pg; b += pb; n++;
    }
    return n ? new THREE.Color().setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace) : this.tileColour(id);
  }

  /** What a tile looks like on the land, and how high it lies. */
  private surface(ground: number, grass: number, x: number, y: number): { colour: THREE.Color; height: number } {
    const ids = this.source.ids;
    // Mountains: each tile its own height, so a range has peaks and saddles, not a plateau.
    if (ground === ids.mountain) return { colour: this.rock, height: 0.9 + hash(x, y, 3) * 1.4 };
    if (this.isTree(ground)) return { colour: this.forestFloor, height: 0.1 };
    if (ground === ids.water) return { colour: this.tileColour(ground).multiplyScalar(0.55), height: -0.5 };
    if (ground === ids.flood) return { colour: this.tileColour(ground), height: -0.22 };
    if (ground === ids.crater) return { colour: this.tileColour(ground), height: -0.1 };
    if (ground === ids.hole) return { colour: this.tileColour(ground).multiplyScalar(0.6), height: -0.1 };
    if (ground === ids.crack) return { colour: this.tileColour(ground).multiplyScalar(0.7), height: -0.12 };
    if (ground === ids.stump || ground === ids.log || ground === ids.wreck) return { colour: ground === ids.wreck ? this.tileColour(ids.burnt ?? ids.ground) : this.tileColour(ids.ground), height: 0.05 };
    if (grass && ground === ids.ground) return { colour: this.grassTint, height: 0.06 };
    if (ground === ids.path) return { colour: this.tileColour(ground), height: 0.01 };
    if (ground === ids.sand) return { colour: this.tileColour(ground), height: 0.02 };
    return { colour: this.tileColour(ground), height: 0.05 };
  }

  private isTree(id: number): boolean {
    const ids = this.source.ids;
    return id === ids.tree || (ids.extraTrees?.includes(id) ?? false);
  }

  // ------------------------------------------------------------ the land

  /** Redraws the land around every tile that changed since the last look (cheap when nothing did). */
  sync(): void {
    const { width, height } = this.source;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const t = this.source.tileAt(x, y);
        const i = (y * width + x) * 2;
        if (this.drawn[i] === t.ground && this.drawn[i + 1] === t.grass) continue;
        this.drawn[i] = t.ground;
        this.drawn[i + 1] = t.grass;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
    }
    if (x0 === Infinity) return;
    // The land is blended across tiles: what changed reaches a tile or so further.
    const m = 2;
    this.computeLand(Math.max(0, x0 - m), Math.max(0, y0 - m), Math.min(width - 1, x1 + m), Math.min(height - 1, y1 + m));
    for (const chunk of this.chunks) {
      const cx0 = chunk.cx * CHUNK, cy0 = chunk.cy * CHUNK;
      if (cx0 > x1 + m + 1 || cy0 > y1 + m + 1 || cx0 + CHUNK < x0 - m - 1 || cy0 + CHUNK < y0 - m - 1) continue;
      this.rebuild(chunk);
    }
  }

  /** The drawn tile at (x, y), clamped to the map. */
  private tile(x: number, y: number): { ground: number; grass: number } {
    const { width, height } = this.source;
    const cx = Math.min(width - 1, Math.max(0, x));
    const cy = Math.min(height - 1, Math.max(0, y));
    const i = (cy * width + cx) * 2;
    return { ground: this.drawn[i]!, grass: this.drawn[i + 1]! };
  }

  /**
   * Works out the land's height and colour at every vertex over these tiles: a few samples
   * scattered around each vertex (so edges between kinds of ground come out ragged, not along
   * the grid), then gentle hills everywhere and rugged rock on the mountains.
   */
  private computeLand(tx0: number, ty0: number, tx1: number, ty1: number): void {
    const samples = [[0.3, 0.1], [-0.1, 0.32], [-0.3, -0.12], [0.12, -0.3], [0, 0]] as const;
    const c = new THREE.Color();
    const acc = new THREE.Color();
    for (let j = ty0 * SUB; j <= (ty1 + 1) * SUB; j++) {
      for (let i = tx0 * SUB; i <= (tx1 + 1) * SUB; i++) {
        const x = i / SUB, z = j / SUB;
        // Each vertex's own twist of the sample pattern, and a wobble from the noise: ragged edges.
        const turn = hash(i, j, 11) * Math.PI * 2;
        const wob = (noise(x * 1.7, z * 1.7) - 0.5) * 0.5;
        let h = 0, mountain = 0, water = 0;
        acc.setRGB(0, 0, 0);
        for (const [sx, sz] of samples) {
          const px = x + (sx * Math.cos(turn) - sz * Math.sin(turn)) * 1.1 + wob * 0.8;
          const pz = z + (sx * Math.sin(turn) + sz * Math.cos(turn)) * 1.1 - wob * 0.8;
          const tx = Math.floor(px), ty = Math.floor(pz);
          const t = this.tile(tx, ty);
          const s = this.surface(t.ground, t.grass, tx, ty);
          acc.r += s.colour.r; acc.g += s.colour.g; acc.b += s.colour.b;
          h += s.height;
          if (t.ground === this.source.ids.mountain) mountain++;
          if (t.ground === this.source.ids.water) water++;
        }
        const n = samples.length;
        c.setRGB(acc.r / n, acc.g / n, acc.b / n);
        const m = mountain / n;
        // Hills everywhere (gentle), rugged rock on the mountains, a smooth bed under the water.
        // (Ridged noise on the mountains: sharp crests, rugged slopes.)
        const ridge = 1 - Math.abs(fbm(x * 0.9, z * 0.9) * 2 - 1);
        h = h / n + (fbm(x * 0.35, z * 0.35) - 0.5) * 0.12 * (1 - water / n) + (ridge * 1.3 - 0.5 + (fbm(x * 2.2, z * 2.2) - 0.5) * 0.5) * m * m;
        const k = j * this.vx + i;
        this.heights[k] = h;
        this.colours[k * 3] = c.r;
        this.colours[k * 3 + 1] = c.g;
        this.colours[k * 3 + 2] = c.b;
      }
    }
  }

  private makeChunk(cx: number, cy: number): Chunk {
    const w = Math.min(CHUNK, this.source.width - cx * CHUNK);
    const h = Math.min(CHUNK, this.source.height - cy * CHUNK);
    const nx = w * SUB + 1, nz = h * SUB + 1;
    const positions = new Float32Array(nx * nz * 3);
    const colours = new Float32Array(nx * nz * 3);
    const normals = new Float32Array(nx * nz * 3);
    const index: number[] = [];
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = (j * nx + i) * 3;
        positions[k] = cx * CHUNK + i / SUB;
        positions[k + 2] = cy * CHUNK + j / SUB;
        if (i < nx - 1 && j < nz - 1) {
          const a = j * nx + i;
          index.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    geometry.setIndex(index);
    const land = new THREE.Mesh(geometry, this.landMaterial);
    this.scene.add(land);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 1, 1).rotateX(-Math.PI / 2), this.waterMaterial);
    water.position.set(cx * CHUNK + w / 2, WATER_Y, cy * CHUNK + h / 2);
    water.visible = false;
    this.scene.add(water);
    const models = {} as Record<ModelKind, THREE.InstancedMesh>;
    for (const kind of MODEL_KINDS) {
      const mesh = new THREE.InstancedMesh(this.geometries[kind], kind === "tufts" ? this.grassMaterial : this.modelMaterial, w * h * (kind === "tufts" || kind === "rocks" ? 2 : 1));
      mesh.count = 0;
      this.scene.add(mesh);
      models[kind] = mesh;
    }
    return { cx, cy, land, water, models };
  }

  /** Copies the land into a chunk (heights, colours, normals from the whole map, so chunk edges don't show) and places its models. */
  private rebuild(chunk: Chunk): void {
    const { width } = this.source;
    const ids = this.source.ids;
    const w = Math.min(CHUNK, width - chunk.cx * CHUNK);
    const h = Math.min(CHUNK, this.source.height - chunk.cy * CHUNK);
    const nx = w * SUB + 1, nz = h * SUB + 1;
    const geometry = chunk.land.geometry;
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    const col = geometry.attributes.color as THREE.BufferAttribute;
    const nor = geometry.attributes.normal as THREE.BufferAttribute;
    const H = (i: number, j: number) => this.heights[Math.min(this.vz - 1, Math.max(0, j)) * this.vx + Math.min(this.vx - 1, Math.max(0, i))]!;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const gi = chunk.cx * CHUNK * SUB + i, gj = chunk.cy * CHUNK * SUB + j;
        const k = j * nx + i;
        const g = gj * this.vx + gi;
        pos.setY(k, this.heights[g]!);
        col.setXYZ(k, this.colours[g * 3]!, this.colours[g * 3 + 1]!, this.colours[g * 3 + 2]!);
        const dx = (H(gi + 1, gj) - H(gi - 1, gj)) * SUB * 0.5;
        const dz = (H(gi, gj + 1) - H(gi, gj - 1)) * SUB * 0.5;
        const len = Math.hypot(dx, 1, dz);
        nor.setXYZ(k, -dx / len, 1 / len, -dz / len);
      }
    }
    pos.needsUpdate = col.needsUpdate = nor.needsUpdate = true;
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const counts: Record<ModelKind, number> = { pines: 0, tufts: 0, stumps: 0, logs: 0, rocks: 0, wrecks: 0 };
    const place = (kind: ModelKind, x: number, z: number, scale: THREE.Vector3, turn: number, sink = 0) => {
      const mesh = chunk.models[kind];
      if (counts[kind] >= mesh.instanceMatrix.count) return;
      q.setFromAxisAngle(up, turn);
      m.compose(new THREE.Vector3(x, this.heightAt(x, z) - sink, z), q, scale);
      mesh.setMatrixAt(counts[kind]++, m);
    };
    let wet = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const X = chunk.cx * CHUNK + x;
        const Z = chunk.cy * CHUNK + y;
        const t = this.tile(X, Z);
        const r1 = hash(X, Z, 1);
        const r2 = hash(X, Z, 2);
        const jitter = (r: number) => (r - 0.5) * 0.35;
        if (t.ground === ids.water || t.ground === ids.flood) wet = true;
        if (this.isTree(t.ground)) {
          const s = 0.75 + r1 * 0.55;
          place("pines", X + 0.5 + jitter(r2), Z + 0.5 + jitter(r1), new THREE.Vector3(s, s * (0.85 + r2 * 0.4), s), r2 * Math.PI * 2);
        } else if (t.ground === ids.mountain) {
          // Boulders on the slopes.
          if (r1 < 0.45) place("rocks", X + 0.2 + r2 * 0.6, Z + 0.2 + r1 * 0.6, new THREE.Vector3(0.5 + r2 * 0.5, 0.4 + r1 * 0.4, 0.5 + r1 * 0.5), r1 * 6, 0.05);
        } else if (t.ground === ids.stump) {
          place("stumps", X + 0.5, Z + 0.5, new THREE.Vector3(1, 1, 1), r1 * 6);
        } else if (t.ground === ids.log) {
          place("logs", X + 0.5, Z + 0.5, new THREE.Vector3(1, 1, 1), r1 * 6);
        } else if (t.ground === ids.rubble) {
          place("rocks", X + 0.3, Z + 0.35, new THREE.Vector3(0.6, 0.5, 0.6), r1 * 6);
          place("rocks", X + 0.7, Z + 0.65, new THREE.Vector3(0.45, 0.35, 0.5), r2 * 6);
        } else if (t.ground === ids.wreck) {
          place("wrecks", X + 0.5, Z + 0.5, new THREE.Vector3(1, 1, 1), r1 * 6, 0.05);
        }
        if (t.grass) {
          place("tufts", X + 0.3 + r2 * 0.1, Z + 0.35, new THREE.Vector3(0.8, 1.1 + r1 * 0.5, 0.8), r1 * Math.PI * 2);
          place("tufts", X + 0.65, Z + 0.7 - r1 * 0.1, new THREE.Vector3(0.75, 1.0 + r2 * 0.5, 0.75), r2 * Math.PI * 2);
        }
      }
    }
    chunk.water.visible = wet;
    for (const kind of MODEL_KINDS) {
      const mesh = chunk.models[kind];
      mesh.count = counts[kind];
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }

  // ------------------------------------------------------------ materials

  /**
   * The land: its vertex colours lit by the sun, with a painted texture (soft blotches and
   * speckles in world space), foam where it meets the water, and snow on the high peaks (or,
   * on a volcano, a glow).
   */
  private makeLandMaterial(look: AreaLook3d, lava: boolean): THREE.Material {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const snow = (look.peak ?? "snow") === "snow";
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.time;
      shader.uniforms.uFoam = { value: new THREE.Color(lava ? KANAGAWA.surimiOrange : KANAGAWA.fujiWhite) };
      shader.uniforms.uTop = { value: new THREE.Color(snow ? KANAGAWA.washi : KANAGAWA.surimiOrange) };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vLand;")
        .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvLand = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\nvarying vec3 vLand;\nuniform float uTime;\nuniform vec3 uFoam;\nuniform vec3 uTop;\n${GLSL_NOISE}`)
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          // A painted texture: soft blotches and fine speckles.
          float paint = mfbm(vLand.xz * 1.3);
          diffuseColor.rgb *= 0.86 + 0.26 * paint + (mh(floor(vLand.xz * 18.0)) - 0.5) * 0.06;
          // Up high: snow (or a volcano's glow), ragged at its edge.
          float top = smoothstep(2.35, 2.6, vLand.y + (mnoise(vLand.xz * 2.1) - 0.5) * 0.4);
          diffuseColor.rgb = mix(diffuseColor.rgb, uTop, top * ${snow ? "0.9" : "0.75"});
          // Foam along the shore, coming and going.
          float shore = 1.0 - smoothstep(0.0, 0.07, abs(vLand.y - ${WATER_Y.toFixed(3)} - 0.02));
          float waves = 0.5 + 0.5 * sin(uTime * 1.6 + mnoise(vLand.xz * 3.0) * 6.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, uFoam, shore * waves * 0.85);`
        );
      if (!snow) {
        // The volcano's glowing tops light themselves.
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\ntotalEmissiveRadiance += uTop * 0.8 * smoothstep(2.3, 2.6, vLand.y + (mnoise(vLand.xz * 2.1) - 0.5) * 0.3);"
        );
      }
    };
    return material;
  }

  /** The water's surface: see-through, with ripples of light moving over it — or glowing lava. */
  private makeWaterMaterial(tint: THREE.Color, lava: boolean): THREE.Material {
    const material = new THREE.MeshLambertMaterial({ color: tint, transparent: true, opacity: lava ? 0.95 : 0.8, depthWrite: false });
    if (lava) material.emissive = tint.clone().multiplyScalar(0.8);
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.time;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vWater;")
        .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWater = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\nvarying vec3 vWater;\nuniform float uTime;\n${GLSL_NOISE}`)
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          // Ripples: two drifting layers of noise make bands of light that move over the surface.
          float r1 = mfbm(vWater.xz * vec2(1.2, 3.2) + vec2(uTime * 0.12, uTime * 0.05));
          float r2 = mfbm(vWater.xz * vec2(3.4, 1.4) - vec2(uTime * 0.07, -uTime * 0.1));
          // Thin glints where the two layers of ripples cross.
          float light = smoothstep(0.66, 0.78, (r1 + r2) * 0.5) * 0.45;
          diffuseColor.rgb = diffuseColor.rgb * (0.85 + 0.3 * r1) + vec3(${lava ? "0.5, 0.25, 0.05" : "0.35, 0.4, 0.42"}) * light;`
        );
    };
    return material;
  }

  /** The models' look for the susuki, which lean with a soft breeze (more at the top, out of step across the field). */
  private makeGrassMaterial(): THREE.Material {
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.time;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;")
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvec2 base = vec2(0.0);\n#ifdef USE_INSTANCING\nbase = instanceMatrix[3].xz;\n#endif\nfloat bend = transformed.y * transformed.y;\ntransformed.x += sin(uTime * 1.5 + base.x * 0.45 + base.y * 0.3) * 0.12 * bend;\ntransformed.z += cos(uTime * 1.1 + base.x * 0.3) * 0.05 * bend;"
        );
    };
    return material;
  }

  // ------------------------------------------------------------ the models (one tile ≈ one unit)

  /** A felled tree's stump, with its pale cut face. */
  private static stump(): THREE.BufferGeometry {
    const bark = new THREE.CylinderGeometry(0.16, 0.2, 0.22, 8);
    bark.translate(0, 0.11, 0);
    const face = new THREE.CylinderGeometry(0.155, 0.155, 0.02, 8);
    face.translate(0, 0.225, 0);
    return mergeGeometries([MapStage.coloured(bark, KANAGAWA.sumiInk5), MapStage.coloured(face, KANAGAWA.boatYellow2)])!;
  }

  /** A fallen tree trunk lying across the tile, a branch sticking up. */
  private static log(): THREE.BufferGeometry {
    const trunk = new THREE.CylinderGeometry(0.13, 0.15, 0.95, 7);
    trunk.rotateZ(Math.PI / 2);
    trunk.translate(0, 0.13, 0);
    const branch = new THREE.CylinderGeometry(0.03, 0.04, 0.35, 5);
    branch.rotateZ(-0.6);
    branch.translate(0.15, 0.35, 0);
    return mergeGeometries([MapStage.coloured(trunk, KANAGAWA.sumiInk5), MapStage.coloured(branch, KANAGAWA.sumiInk5)])!;
  }

  /** A boulder: a rough, flat-shaded rock. */
  private static rock(): THREE.BufferGeometry {
    const g = new THREE.DodecahedronGeometry(0.35, 0);
    g.scale(1, 0.7, 1);
    g.translate(0, 0.15, 0);
    return MapStage.coloured(g, KANAGAWA.katanaGray);
  }

  /** The UFO's wreck: a dented metal saucer, tipped over, its dome cracked. */
  private static wreck(): THREE.BufferGeometry {
    const saucer = new THREE.SphereGeometry(0.45, 14, 6);
    saucer.scale(1, 0.28, 1);
    saucer.rotateZ(0.3);
    saucer.translate(0, 0.14, 0);
    const dome = new THREE.SphereGeometry(0.18, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.rotateZ(0.3);
    dome.translate(-0.05, 0.24, 0);
    return mergeGeometries([MapStage.coloured(saucer, KANAGAWA.oldWhite), MapStage.coloured(dome, KANAGAWA.springGreen)])!;
  }

  private static coloured(geometry: THREE.BufferGeometry, colour: number): THREE.BufferGeometry {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const c = new THREE.Color(colour);
    const colours = new Float32Array(g.attributes.position!.count * 3);
    for (let i = 0; i < colours.length; i += 3) colours.set([c.r, c.g, c.b], i);
    g.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    g.deleteAttribute("uv");
    return g;
  }

  /**
   * A tree, as the world has them: a Japanese pine (a crooked trunk under three flat, layered
   * canopies, like the tile art), a pine with snow on it, a cherry tree in bloom, or a bare,
   * burnt pine.
   */
  private static tree(kind: NonNullable<AreaLook3d["tree"]>): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const trunk = new THREE.CylinderGeometry(0.06, 0.11, 1.0, 5);
    trunk.rotateZ(0.12);
    trunk.translate(0.03, 0.5, 0);
    parts.push(MapStage.coloured(trunk, kind === "deadPine" ? KANAGAWA.sumiInk3 : KANAGAWA.sumiInk5));
    if (kind === "sakura") {
      const pink = KANAGAWA.sakuraPink;
      const pale = new THREE.Color(KANAGAWA.sakuraPink).lerp(new THREE.Color(KANAGAWA.washi), 0.4).getHex();
      for (const [r, x, y, z, c] of [[0.42, -0.2, 0.95, 0.05, pink], [0.4, 0.22, 1.05, -0.1, pale], [0.36, 0, 1.3, 0.12, pink], [0.3, 0.05, 0.95, -0.28, pale]] as const) {
        const puff = new THREE.SphereGeometry(r, 8, 5);
        puff.translate(x, y, z);
        parts.push(MapStage.coloured(puff, c));
      }
      return mergeGeometries(parts)!;
    }
    if (kind === "deadPine") {
      // Bare branches, burnt black.
      for (const [len, y, turn, tilt] of [[0.5, 0.7, 0.3, 1.0], [0.4, 0.85, 2.4, 1.1], [0.35, 1.0, 4.2, 0.9]] as const) {
        const branch = new THREE.CylinderGeometry(0.02, 0.035, len, 4);
        branch.translate(0, len / 2, 0);
        branch.rotateZ(tilt);
        branch.rotateY(turn);
        branch.translate(0.03, y, 0);
        parts.push(MapStage.coloured(branch, KANAGAWA.sumiInk3));
      }
      return mergeGeometries(parts)!;
    }
    const dark = KANAGAWA.winterGreen;
    const light = new THREE.Color(KANAGAWA.winterGreen).lerp(new THREE.Color(KANAGAWA.autumnGreen), 0.35).getHex();
    const layers: Array<[number, number, number, number]> = [
      [0.56, 0.72, -0.05, dark],
      [0.44, 1.02, 0.08, light],
      [0.3, 1.3, 0.02, light],
    ];
    for (const [r, y, dx, c] of layers) {
      const canopy = new THREE.SphereGeometry(r, 9, 5);
      canopy.scale(1, 0.36, 1);
      canopy.translate(dx, y, 0);
      parts.push(MapStage.coloured(canopy, c));
      if (kind === "snowPine") {
        const cap = new THREE.SphereGeometry(r * 0.9, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2.5);
        cap.scale(1, 0.34, 1);
        cap.translate(dx, y + r * 0.08, 0);
        parts.push(MapStage.coloured(cap, KANAGAWA.washi));
      }
    }
    return mergeGeometries(parts)!;
  }

  /** A tuft of susuki: pale stems leaning every way, each with a feathery plume. */
  private static tuft(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2 + hash(i, 7) * 0.8;
      const out = 0.12 + hash(i, 3) * 0.26;
      const h = 0.42 + hash(i, 5) * 0.3;
      const lean = (hash(i, 9) - 0.5) * 0.6;
      const x = Math.cos(angle) * out;
      const z = Math.sin(angle) * out;
      const stem = new THREE.CylinderGeometry(0.008, 0.016, h, 3);
      stem.translate(0, h / 2, 0);
      stem.rotateZ(lean);
      stem.translate(x, 0, z);
      parts.push(MapStage.coloured(stem, KANAGAWA.boatYellow1));
      const plume = new THREE.ConeGeometry(0.035, 0.17, 4);
      plume.rotateZ(Math.PI);
      plume.translate(0, h + 0.02, 0);
      plume.rotateZ(lean);
      plume.translate(x, 0, z);
      parts.push(MapStage.coloured(plume, KANAGAWA.boatYellow2));
    }
    return mergeGeometries(parts)!;
  }
}
