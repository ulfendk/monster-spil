import * as THREE from "three";
import { KANAGAWA } from "../../ui/theme";
import { type Builder, S, shade } from "../monster-model";

/**
 * The geometry kit the body plans and parts are made from. Everything is measured in the
 * picture's pixels (the model's 128-px box, x right, y UP from the box's middle, z towards the
 * viewer), turned into model units with `V` — so numbers read like the pictures they replace.
 */

export const V = (x: number, y: number, z = 0) => new THREE.Vector3(x * S, y * S, z * S);
export const px = (n: number) => n * S;
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

/** Where the ground is (px from the box's middle): feet stand here. */
export const GROUND = -54;

/** A colour from the content: a palette name, optionally lighter or darker ("katanaGray:-10"). */
export function colourOf(name: string | undefined, fallback: number): number {
  if (!name) return fallback;
  const [key, amount] = name.split(":");
  const base = (KANAGAWA as Record<string, number>)[key!];
  if (base === undefined) return fallback;
  return amount ? shade(base, Number(amount) || 0) : base;
}

export function mix(a: number, b: number, k: number): number {
  return new THREE.Color(a).lerp(new THREE.Color(b), k).getHex();
}

// ------------------------------------------------------------ ellipsoids: bodies, heads

/** An ellipsoid (px): its middle and radii. Bodies and heads are these; parts sit on their surfaces. */
export class Ell {
  constructor(
    public x: number,
    public y: number,
    public z: number,
    public rx: number,
    public ry: number,
    public rz: number,
  ) {}

  get centre(): THREE.Vector3 {
    return V(this.x, this.y, this.z);
  }

  /**
   * The point on the surface (px) in a direction from the middle: `yaw` round from the front
   * (towards +x), `pitch` up. And the outward normal there (unit, model space).
   */
  at(yaw: number, pitch: number, out = 0): { p: THREE.Vector3; n: THREE.Vector3; px: THREE.Vector3 } {
    const d = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const t = 1 / Math.sqrt((d.x / this.rx) ** 2 + (d.y / this.ry) ** 2 + (d.z / this.rz) ** 2);
    const n = new THREE.Vector3(d.x / this.rx ** 2, d.y / this.ry ** 2, d.z / this.rz ** 2).normalize();
    const p = new THREE.Vector3(this.x + d.x * t, this.y + d.y * t, this.z + d.z * t).addScaledVector(n, out);
    return { p: V(p.x, p.y, p.z), n, px: p };
  }

  /** How far forward (z, px) the front of the surface is at (x, y) px — for faces. */
  front(x: number, y: number): number {
    const k = 1 - ((x - this.x) / this.rx) ** 2 - ((y - this.y) / this.ry) ** 2;
    return this.z + this.rz * Math.sqrt(Math.max(0, k));
  }

  scaled(k: number): Ell {
    return new Ell(this.x, this.y, this.z, this.rx * k, this.ry * k, this.rz * k);
  }
}

/** An ellipsoid part (toon-shaded, outlined). */
export function blob(b: Builder, e: Ell, colour: number, outline = true, geometry: THREE.BufferGeometry = sphereGeo()): THREE.Mesh {
  return b.part(geometry, colour, e.centre, V(e.rx * 2, e.ry * 2, e.rz * 2), outline);
}

export const sphereGeo = () => new THREE.SphereGeometry(0.5, 30, 20);
/** A cheaper sphere for small things (spots, toes, particles). */
export const smallSphere = () => new THREE.SphereGeometry(0.5, 14, 9);

/** Points an object's +y axis along `dir`, then turns it `spin` about that axis. */
export function alongY(o: THREE.Object3D, dir: THREE.Vector3, spin = 0): void {
  o.quaternion.setFromUnitVectors(Y, dir.clone().normalize());
  if (spin) o.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(Y, spin));
}

/** Points an object's +z axis along `dir` (a flat thing lying on a surface), turned `spin` about it. */
export function alongZ(o: THREE.Object3D, dir: THREE.Vector3, spin = 0): void {
  o.quaternion.setFromUnitVectors(Z, dir.clone().normalize());
  if (spin) o.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(Z, spin));
}

/**
 * A mark lying on a surface (a spot, a stripe, a scale): a flattened sphere `w` × `h` px,
 * `spin` turning it about the normal. Shaded like the body, no outline.
 */
export function decal(b: Builder, e: Ell, yaw: number, pitch: number, w: number, h: number, colour: number, spin = 0, thick = 2.2, outline = false, glow = false): THREE.Mesh {
  const { p, n } = e.at(yaw, pitch, -thick * 0.2);
  const m = glow ? b.flat(smallSphere(), colour, p, V(w, h, thick)) : b.part(smallSphere(), colour, p, V(w, h, thick), outline);
  // Lie on the surface: its flat side along the normal, "up" (its h) towards the body's up.
  const up = Y.clone().sub(n.clone().multiplyScalar(Y.dot(n)));
  const basis = new THREE.Matrix4();
  const zAxis = n.clone();
  let yAxis = up.lengthSq() < 1e-4 ? Z.clone().sub(n.clone().multiplyScalar(Z.dot(n))).normalize() : up.normalize();
  const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
  yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
  basis.makeBasis(xAxis, yAxis, zAxis);
  m.quaternion.setFromRotationMatrix(basis);
  if (spin) m.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(Z, spin));
  return m;
}

// ------------------------------------------------------------ tubes, cones, lathes

/**
 * A tube along a curve of points (px) whose radius goes from `r0` to `r1` (px) — a tail, a
 * horn (r1 = 0), a leg, an antenna, a tentacle. `bulge` swells it in the middle.
 */
export function taper(points: THREE.Vector3[], r0: number, r1: number, opts: { segments?: number; radial?: number; bulge?: number; cap?: boolean } = {}): THREE.BufferGeometry {
  const segments = opts.segments ?? 20;
  const radial = opts.radial ?? 10;
  const curve = new THREE.CatmullRomCurve3(points.map((p) => p.clone().multiplyScalar(S)));
  const frames = curve.computeFrenetFrames(segments, false);
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const c = curve.getPointAt(t);
    const r = (r0 + (r1 - r0) * t + (opts.bulge ?? 0) * Math.sin(Math.PI * t)) * S;
    const N = frames.normals[i]!;
    const B = frames.binormals[i]!;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      positions.push(c.x + r * (Math.cos(a) * N.x + Math.sin(a) * B.x), c.y + r * (Math.cos(a) * N.y + Math.sin(a) * B.y), c.z + r * (Math.cos(a) * N.z + Math.sin(a) * B.z));
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  // Round ends: a point at each end closing the tube.
  const ends = [
    { i: 0, at: curve.getPointAt(0), back: curve.getTangentAt(0).multiplyScalar(-r0 * S * 0.6) },
    { i: segments, at: curve.getPointAt(1), back: curve.getTangentAt(1).multiplyScalar(r1 * S * 0.6) },
  ];
  for (const end of ends) {
    const tip = positions.length / 3;
    positions.push(end.at.x + end.back.x, end.at.y + end.back.y, end.at.z + end.back.z);
    const ring = end.i * (radial + 1);
    for (let j = 0; j < radial; j++) {
      if (end.i === 0) indices.push(tip, ring + j, ring + j + 1);
      else indices.push(tip, ring + j + 1, ring + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/**
 * A tapered tube as a part, placed at the origin (its points, px, are already where they go),
 * outlined by an ink tube a little thicker all along.
 */
export function tube(b: Builder, points: THREE.Vector3[], r0: number, r1: number, colour: number, outline = true, opts: Parameters<typeof taper>[3] = {}): THREE.Mesh {
  const mesh = b.part(taper(points, r0, r1, opts), colour, new THREE.Vector3(), 1, false);
  if (outline) b.inkShell(taper(points, r0 + b.outlinePx * 0.8, Math.max(r1, 0.3) + b.outlinePx * 0.8, { ...opts, radial: 8 }), mesh);
  return mesh;
}

/** A point in px (for tubes' curves). */
export const Q = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

/** A shape turned on a lathe: [radius, height] px pairs from the bottom up. */
export function lathe(profile: Array<[number, number]>, segments = 24): THREE.BufferGeometry {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r) * S, y * S)), segments);
}

/** A cone (px) from `base` pointing along `dir`, `length` long, `radius` wide at the base. */
export function spike(b: Builder, base: THREE.Vector3, dir: THREE.Vector3, length: number, radius: number, colour: number, outline = true, sides = 8): THREE.Mesh {
  const g = new THREE.ConeGeometry(radius * S, length * S, sides);
  g.translate(0, (length * S) / 2, 0);
  const m = b.part(g, colour, base, 1, outline);
  alongY(m, dir);
  return m;
}

/** A flat outline (px, y UP) pushed out `depth` px, centred on its own (0, 0). */
export function plate(points: Array<[number, number]>, depth: number, bevel = 0.8): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x * S, y * S)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: depth * S, bevelEnabled: true, bevelThickness: bevel * S, bevelSize: bevel * S, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, (-depth / 2) * S);
  return g;
}

/** A smooth closed outline through points (px, y UP), sampled into many: for leaves, fins, feathers. */
export function smooth(points: Array<[number, number]>, n = 40): Array<[number, number]> {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, "centripetal");
  return curve.getSpacedPoints(n).slice(0, n).map((p) => [p.x, p.y]);
}

/** A leaf outline (px, y UP): base at (0, 0), tip at (0, length). */
export function leafShape(length: number, width: number): Array<[number, number]> {
  return smooth([[0, 0], [width * 0.5, length * 0.3], [width * 0.35, length * 0.75], [0, length], [-width * 0.35, length * 0.75], [-width * 0.5, length * 0.3]], 30);
}

/** A group at `at`, holding `parts` made at its local coordinates. */
export function group(b: Builder, at: THREE.Vector3, parts: THREE.Object3D[] = [], parent: THREE.Object3D = b.root): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(at);
  parent.add(g);
  for (const p of parts) g.add(p);
  return g;
}

/** Puts parts (made in the root at their places) into a new group scaled `k` about `pivot`. */
export function grow(b: Builder, parts: THREE.Object3D[], pivot: THREE.Vector3, k: number): THREE.Group {
  const g = b.pivot(parts, pivot);
  g.scale.setScalar(k);
  return g;
}

export { X, Y, Z };

/** A round flame (px): a teardrop turned on a lathe, its base at y = 0, pointing up. */
export function teardrop(height: number, width: number): THREE.BufferGeometry {
  const profile: Array<[number, number]> = [[0, 0], [0.34, 0.08], [0.5, 0.26], [0.44, 0.48], [0.28, 0.7], [0.12, 0.88], [0, 1]];
  return lathe(profile.map(([r, y]) => [r * width, y * height]), 14);
}

/**
 * A flame (px) standing at `at`, leaning `lean` (radians, sideways): orange, a yellow heart
 * and a red streak. Returns its group (flicker it by scaling).
 */
export function flame(b: Builder, at: THREE.Vector3, height: number, width: number, lean: number, colours: [number, number, number] = [KANAGAWA.surimiOrange, KANAGAWA.carpYellow, KANAGAWA.autumnRed]): THREE.Group {
  const f = new THREE.Group();
  f.position.copy(at);
  f.rotation.z = lean;
  b.root.add(f);
  f.add(b.part(teardrop(height, width), colours[0], new THREE.Vector3()));
  f.add(b.part(teardrop(height * 0.55, width * 0.55), colours[1], V(0, 0, width * 0.22), 1, false));
  f.add(b.part(teardrop(height * 0.7, width * 0.28), colours[2], V(width * 0.14, height * 0.06, width * 0.28), 1, false));
  return f;
}

/** Flickering: each flame stretching and settling in its own time. */
export function flicker(flames: THREE.Object3D[]): (t: number) => void {
  return (t) =>
    flames.forEach((f, i) => {
      const k = 1 + Math.sin(t * 11 + i * 1.7) * 0.08 + Math.sin(t * 17 + i) * 0.05;
      f.scale.set(1 / Math.sqrt(k), k, 1 / Math.sqrt(k));
    });
}

/** A band round an ellipsoid between two heights (as fractions of its half-height, -1..1), lying on it: stripes on a bee, layers of rock. */
export function band(b: Builder, e: Ell, from: number, to: number, colour: number, out = 0.6, glow = false): THREE.Mesh {
  const t0 = Math.acos(Math.max(-1, Math.min(1, to)));
  const t1 = Math.acos(Math.max(-1, Math.min(1, from)));
  const g = new THREE.SphereGeometry(0.5, 32, 6, 0, Math.PI * 2, t0, t1 - t0);
  const k = (r: number) => (r + out) * 2;
  return glow ? b.flat(g, colour, e.centre, V(k(e.rx), k(e.ry), k(e.rz))) : b.part(g, colour, e.centre, V(k(e.rx), k(e.ry), k(e.rz)), false);
}

/** A small stable number from a string (for scattering spots the same way every time). */
export function seeded(id: string): () => number {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => {
    h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    return (h % 10000) / 10000;
  };
}

/** A round soft-edged glow, drawn once (white; tinted by the sprite). */
let glowTexture: THREE.CanvasTexture | undefined;
function glowMap(): THREE.CanvasTexture {
  if (glowTexture) return glowTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(c);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

/**
 * A soft glow round something (px across): a sprite that always faces the camera, fading out
 * to its edge. Left out when the model is fitted to its box. Returns a function that makes it
 * pulse (call it with the time).
 */
export function halo(b: Builder, at: THREE.Vector3, rx: number, ry: number, _rz: number, colour: number, strength = 1): (t: number) => void {
  const material = b.keep(new THREE.SpriteMaterial({ map: glowMap(), color: colour, transparent: true, opacity: Math.min(1, 0.55 * strength), depthWrite: false }));
  const sprite = new THREE.Sprite(material);
  sprite.position.copy(at);
  const w = rx * 2.7 * S;
  const h = ry * 2.7 * S;
  sprite.scale.set(w, h, 1);
  sprite.userData.noFit = true;
  b.root.add(sprite);
  return (t) => sprite.scale.set(w * (1 + Math.sin(t * 2.6) * 0.08), h * (1 + Math.sin(t * 2.6) * 0.08), 1);
}
