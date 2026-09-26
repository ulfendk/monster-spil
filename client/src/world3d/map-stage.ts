import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { KANAGAWA } from "../ui/theme";

/**
 * The overworld in 3D (three.js, loaded only when the map opens): the map seen from above
 * at an angle, like a woodblock landscape. The ground is the area's own tile art (the same
 * tileset the 2D map draws), and what stands up out of it is modelled in the same palette:
 * Japanese pines where the map has trees, peaks with snow caps for mountains, susuki tufts
 * in the tall grass. The map is cut into chunks, so only what the camera sees is drawn,
 * and a chunk is rebuilt when a tile in it changes (a felled tree, a disaster, a hole).
 *
 * Units: one tile = one unit; x runs east, z south (the map's y), y is up. Tile (x, y)
 * covers x…x+1, y…y+1 on the ground. It renders into its own canvas under Phaser's.
 */

/** Which tile ids stand up (drawn as models on plain ground) and which ground tile they stand on. */
export interface MapTileIds {
  ground: number;
  /** Tall grass (the encounter zones): marked on the ground (a golden meadow) under the tufts, so it's easy to see. */
  grass?: number;
  tree?: number;
  mountain?: number;
  /** Other blocking tiles drawn as trees (an area without `terrain` ids). */
  extraTrees?: number[];
}

export interface MapSource {
  width: number;
  height: number;
  /** The tileset image (64 px tiles in a row or grid) and its tile size. */
  tileset: HTMLImageElement | HTMLCanvasElement;
  tilePx: number;
  ids: MapTileIds;
  /** The ground tile id and whether tall grass grows there, right now (0 = none). */
  tileAt(x: number, y: number): { ground: number; grass: number };
}

const CHUNK = 16;
/** Stands for the tall grass's ground in uvOf (not a real tile id). */
const GRASS_GROUND = -1;
/** Padding around each tile in the atlas, so mipmaps don't bleed neighbours in. */
const PAD = 4;
/** How the camera looks down on the map (degrees above the horizon) and its field of view. */
const PITCH = 57;
const FOV = 38;

interface Chunk {
  cx: number;
  cy: number;
  ground: THREE.Mesh;
  pines: THREE.InstancedMesh;
  peaks: THREE.InstancedMesh;
  tufts: THREE.InstancedMesh;
}

/** A stable pseudo-random number (0…1) for a tile, so trees keep their shape between rebuilds. */
function hash(x: number, y: number, salt = 0): number {
  let h = Math.imul(x * 374761393 + y * 668265263 + salt * 2147483647, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class MapStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 120);
  private readonly source: MapSource;
  private readonly atlas: { texture: THREE.Texture; cols: number; w: number; h: number };
  /** The atlas column of the tall grass's ground. */
  private grassCell = 0;
  private readonly chunks: Chunk[] = [];
  /** The tiles as last drawn: ground id and grass id per tile. */
  private readonly drawn: Int32Array;
  private readonly groundMaterial: THREE.Material;
  private readonly pineGeometry: THREE.BufferGeometry;
  private readonly peakGeometry: THREE.BufferGeometry;
  private readonly tuftGeometry: THREE.BufferGeometry;
  private readonly modelMaterial: THREE.Material;
  private readonly raycaster = new THREE.Raycaster();
  private size = { width: 1, height: 1 };
  /** How many tiles wide the view is where the camera looks. */
  private viewTiles = 12;
  private readonly target = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, source: MapSource) {
    this.source = source;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(KANAGAWA.springBlue);
    this.scene.fog = new THREE.Fog(KANAGAWA.springBlue, 30, 60);
    this.scene.add(new THREE.HemisphereLight(KANAGAWA.fujiWhite, KANAGAWA.autumnGreen, 1.7));
    const sun = new THREE.DirectionalLight(KANAGAWA.fujiWhite, 1.5);
    sun.position.set(-4, 10, 3);
    this.scene.add(sun);

    this.atlas = this.makeAtlas();
    // The tile art is shown as drawn: no lighting on the ground.
    this.groundMaterial = new THREE.MeshBasicMaterial({ map: this.atlas.texture });
    this.modelMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
    this.pineGeometry = MapStage.pine();
    this.peakGeometry = MapStage.peak();
    this.tuftGeometry = MapStage.tuft();

    // Beyond the map's edge: forest floor, so the view never ends in empty sky.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(source.width + 120, source.height + 120), new THREE.MeshBasicMaterial({ color: KANAGAWA.winterGreen }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(source.width / 2, -0.02, source.height / 2);
    this.scene.add(floor);

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

  /** Looks at a point on the map (in tiles), from the south and above. */
  lookAt(x: number, z: number): void {
    this.target.set(x, 0, z);
    const hfov = 2 * Math.atan(Math.tan((FOV * Math.PI) / 360) * this.camera.aspect);
    const distance = this.viewTiles / 2 / Math.tan(hfov / 2);
    const pitch = (PITCH * Math.PI) / 180;
    this.camera.position.set(x, Math.sin(pitch) * distance, z + Math.cos(pitch) * distance);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  render(): void {
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

  /** The point on the ground under a point on the canvas (in tiles), if any. */
  groundAt(sx: number, sy: number): { x: number; z: number } | undefined {
    this.pointRay(sx, sy);
    const hit = this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    return hit ? { x: hit.x, z: hit.z } : undefined;
  }

  /** The nearest of `objects` under a point on the canvas. */
  pick<T extends THREE.Object3D>(sx: number, sy: number, objects: T[]): T | undefined {
    this.pointRay(sx, sy);
    return this.raycaster.intersectObjects(objects, false)[0]?.object as T | undefined;
  }

  private pointRay(sx: number, sy: number): void {
    this.raycaster.setFromCamera(new THREE.Vector2((sx / this.size.width) * 2 - 1, 1 - (sy / this.size.height) * 2), this.camera);
  }

  destroy(): void {
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
    });
    for (const m of [this.groundMaterial, this.modelMaterial]) m.dispose();
    this.atlas.texture.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  // ------------------------------------------------------------ the tiles

  /** Redraws the chunks where a tile changed since the last look (cheap when nothing did). */
  sync(): void {
    const { width, height } = this.source;
    const dirty = new Set<Chunk>();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const t = this.source.tileAt(x, y);
        const i = (y * width + x) * 2;
        if (this.drawn[i] === t.ground && this.drawn[i + 1] === t.grass) continue;
        this.drawn[i] = t.ground;
        this.drawn[i + 1] = t.grass;
        dirty.add(this.chunkAt(x, y));
      }
    }
    for (const chunk of dirty) this.rebuild(chunk);
  }

  private chunkAt(x: number, y: number): Chunk {
    return this.chunks[Math.floor(y / CHUNK) * Math.ceil(this.source.width / CHUNK) + Math.floor(x / CHUNK)]!;
  }

  private isTree(id: number): boolean {
    const ids = this.source.ids;
    return id === ids.tree || (ids.extraTrees?.includes(id) ?? false);
  }

  /** The tileset, each tile with its edges stretched out a few pixels (see PAD). */
  private makeAtlas(): { texture: THREE.Texture; cols: number; w: number; h: number } {
    const img = this.source.tileset;
    const t = this.source.tilePx;
    const tileCols = Math.max(1, Math.floor(img.width / t));
    const rows = Math.max(1, Math.floor(img.height / t));
    // One extra column: the tall grass's ground, made from the plain ground tile (see GRASS_CELL).
    const cols = tileCols + 1;
    const cell = t + PAD * 2;
    const canvas = document.createElement("canvas");
    canvas.width = cols * cell;
    canvas.height = rows * cell;
    const g = canvas.getContext("2d")!;
    const ground = Math.max(0, this.source.ids.ground - 1);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const extra = c === tileCols;
        if (extra && r > 0) continue;
        const sx = extra ? (ground % tileCols) * t : c * t;
        const sy = extra ? Math.floor(ground / tileCols) * t : r * t;
        const dx = c * cell + PAD;
        const dy = r * cell + PAD;
        g.drawImage(img, sx, sy, t, t, dx, dy, t, t);
        g.drawImage(img, sx, sy, t, 1, dx, dy - PAD, t, PAD);
        g.drawImage(img, sx, sy + t - 1, t, 1, dx, dy + t, t, PAD);
        g.drawImage(img, sx, sy, 1, t, dx - PAD, dy, PAD, t);
        g.drawImage(img, sx + t - 1, sy, 1, t, dx + t, dy, PAD, t);
        if (extra) {
          // The meadow turned golden, where the susuki grows.
          g.globalCompositeOperation = "multiply";
          g.fillStyle = `#${KANAGAWA.carpYellow.toString(16).padStart(6, "0")}`;
          g.fillRect(dx - PAD, dy - PAD, cell, cell);
          g.globalCompositeOperation = "source-over";
        }
      }
    }
    this.grassCell = tileCols;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return { texture, cols, w: canvas.width, h: canvas.height };
  }

  /** The texture corners of a tile id in the atlas (GRASS_GROUND: the tall grass's ground): u0, v0 (bottom left), u1, v1 (top right). */
  private uvOf(id: number): [number, number, number, number] {
    const t = this.source.tilePx;
    const cell = t + PAD * 2;
    const tileCols = this.atlas.cols - 1;
    const index = Math.max(0, id - 1);
    const c = id === GRASS_GROUND ? this.grassCell : index % tileCols;
    const r = id === GRASS_GROUND ? 0 : Math.floor(index / tileCols);
    const x0 = c * cell + PAD + 0.5;
    const y0 = r * cell + PAD + 0.5;
    return [x0 / this.atlas.w, 1 - (y0 + t - 1) / this.atlas.h, (x0 + t - 1) / this.atlas.w, 1 - y0 / this.atlas.h];
  }

  private makeChunk(cx: number, cy: number): Chunk {
    const w = Math.min(CHUNK, this.source.width - cx * CHUNK);
    const h = Math.min(CHUNK, this.source.height - cy * CHUNK);
    const positions: number[] = [];
    const uvs: number[] = [];
    const index: number[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const X = cx * CHUNK + x;
        const Z = cy * CHUNK + y;
        const base = positions.length / 3;
        positions.push(X, 0, Z, X + 1, 0, Z, X + 1, 0, Z + 1, X, 0, Z + 1);
        uvs.push(0, 0, 0, 0, 0, 0, 0, 0);
        index.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(index);
    geometry.computeBoundingSphere();
    const ground = new THREE.Mesh(geometry, this.groundMaterial);
    this.scene.add(ground);
    const instanced = (g: THREE.BufferGeometry) => {
      const mesh = new THREE.InstancedMesh(g, this.modelMaterial, w * h * 2);
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(mesh);
      return mesh;
    };
    return { cx, cy, ground, pines: instanced(this.pineGeometry), peaks: instanced(this.peakGeometry), tufts: instanced(this.tuftGeometry) };
  }

  /** Puts a chunk's tile art and its trees, peaks and grass where the tiles say. */
  private rebuild(chunk: Chunk): void {
    const { width } = this.source;
    const ids = this.source.ids;
    const uv = chunk.ground.geometry.attributes.uv as THREE.BufferAttribute;
    const w = Math.min(CHUNK, width - chunk.cx * CHUNK);
    const h = Math.min(CHUNK, this.source.height - chunk.cy * CHUNK);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const counts = { pines: 0, peaks: 0, tufts: 0 };
    const place = (mesh: THREE.InstancedMesh, key: keyof typeof counts, x: number, z: number, scale: THREE.Vector3, turn: number) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn);
      m.compose(new THREE.Vector3(x, 0, z), q, scale);
      mesh.setMatrixAt(counts[key]++, m);
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const X = chunk.cx * CHUNK + x;
        const Z = chunk.cy * CHUNK + y;
        const i = (Z * width + X) * 2;
        const groundId = this.drawn[i]!;
        const grass = this.drawn[i + 1]!;
        const standing = this.isTree(groundId) || groundId === ids.mountain;
        const [u0, v0, u1, v1] = this.uvOf(standing ? ids.ground : grass && groundId === ids.ground ? GRASS_GROUND : groundId);
        const k = (y * w + x) * 4;
        // Corners in the order the quad was built: top left, top right, bottom right, bottom left.
        uv.setXY(k, u0, v1);
        uv.setXY(k + 1, u1, v1);
        uv.setXY(k + 2, u1, v0);
        uv.setXY(k + 3, u0, v0);
        const r1 = hash(X, Z, 1);
        const r2 = hash(X, Z, 2);
        const jitter = (r: number) => (r - 0.5) * 0.25;
        if (this.isTree(groundId)) {
          const s = 0.85 + r1 * 0.35;
          place(chunk.pines, "pines", X + 0.5 + jitter(r2), Z + 0.5 + jitter(r1), new THREE.Vector3(s, s * (0.9 + r2 * 0.3), s), r2 * Math.PI * 2);
        } else if (groundId === ids.mountain) {
          const s = 0.9 + r1 * 0.3;
          place(chunk.peaks, "peaks", X + 0.5, Z + 0.5, new THREE.Vector3(s, s * (0.85 + r2 * 0.45), s), r2 * Math.PI * 2);
        }
        if (grass) {
          place(chunk.tufts, "tufts", X + 0.3 + r2 * 0.1, Z + 0.35, new THREE.Vector3(0.8, 1.1 + r1 * 0.5, 0.8), r1 * Math.PI * 2);
          place(chunk.tufts, "tufts", X + 0.65, Z + 0.7 - r1 * 0.1, new THREE.Vector3(0.75, 1.0 + r2 * 0.5, 0.75), r2 * Math.PI * 2);
        }
      }
    }
    uv.needsUpdate = true;
    for (const key of ["pines", "peaks", "tufts"] as const) {
      const mesh = chunk[key];
      mesh.count = counts[key];
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }

  // ------------------------------------------------------------ the models (one tile ≈ one unit)

  private static coloured(geometry: THREE.BufferGeometry, colour: number): THREE.BufferGeometry {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const c = new THREE.Color(colour);
    const colours = new Float32Array(g.attributes.position!.count * 3);
    for (let i = 0; i < colours.length; i += 3) colours.set([c.r, c.g, c.b], i);
    g.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    g.deleteAttribute("uv");
    return g;
  }

  /** A Japanese pine: a crooked trunk under three flat, layered canopies (like the tile art). */
  private static pine(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const trunk = new THREE.CylinderGeometry(0.06, 0.11, 1.0, 5);
    trunk.rotateZ(0.12);
    trunk.translate(0.03, 0.5, 0);
    parts.push(MapStage.coloured(trunk, KANAGAWA.sumiInk5));
    const dark = KANAGAWA.winterGreen;
    const light = new THREE.Color(KANAGAWA.winterGreen).lerp(new THREE.Color(KANAGAWA.autumnGreen), 0.35).getHex();
    const layers: Array<[number, number, number, number]> = [
      [0.56, 0.72, -0.05, dark],
      [0.44, 1.02, 0.08, light],
      [0.3, 1.3, 0.02, light],
    ];
    for (const [r, y, dx, colour] of layers) {
      const canopy = new THREE.SphereGeometry(r, 9, 5);
      canopy.scale(1, 0.36, 1);
      canopy.translate(dx, y, 0);
      parts.push(MapStage.coloured(canopy, colour));
    }
    return mergeGeometries(parts)!;
  }

  /** A mountain peak: a steep, five-sided cone of blue-grey rock with a snow cap. */
  private static peak(): THREE.BufferGeometry {
    const height = 1.9;
    const rock = new THREE.ConeGeometry(0.78, height, 5);
    rock.translate(0, height / 2, 0);
    const capH = 0.62;
    const cap = new THREE.ConeGeometry((0.78 * capH) / height + 0.02, capH, 5);
    cap.translate(0, height - capH / 2 + 0.01, 0);
    return mergeGeometries([MapStage.coloured(rock, KANAGAWA.sumiInk6), MapStage.coloured(cap, KANAGAWA.fujiWhite)])!;
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
