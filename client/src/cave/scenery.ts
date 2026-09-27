import * as THREE from "three";
import type { SceneDecor, SceneLook, SceneParticles } from "@shared";
import { KANAGAWA } from "../ui/theme";

/**
 * The scenery around a wild battle and catching (meadow-stage.ts): sky, sun, ground and
 * hills in a scene's colours, then what stands about — pines, susuki, a lake, reeds,
 * rocks, far peaks, dunes, bamboo, cherry trees, snowy pines, lava, mushrooms, ferns — and
 * what drifts through the air (snow, petals, embers, leaves). The scenes themselves are
 * content (shared/content/scenes.json); a new scene can mix these freely.
 *
 * Everything keeps clear of where the monsters stand and of the view of them from the
 * camera (`clear`), so nothing ever hides a monster.
 */

export interface SceneryHost {
  scene: THREE.Scene;
  rand: () => number;
  /** Things that move with time (the breeze, water, particles). */
  animated: Array<(time: number) => void>;
}

/** Where monsters stand in the meadow: when catching (0, -7), in battles a little to either side, mine close in front. */
const HOME = { x: 0, z: -7 };

/** Whether a spot must stay free: the monsters' spots and the view of them from the front. */
function clear(x: number, z: number): boolean {
  if (Math.abs(x - HOME.x) < 2.2 && Math.abs(z - HOME.z) < 1.6) return true;
  return Math.abs(x) < 2.4 && z > -8.2;
}

/** A palette colour by name (a scene names them), with a fallback for a name the palette doesn't have. */
export function paletteColour(name: string | undefined, fallback: number): number {
  const value = name ? (KANAGAWA as Record<string, number>)[name] : undefined;
  return value ?? fallback;
}

const mat = (colour: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: colour, flatShading: true, roughness: 1, ...extra });

export function buildScenery(host: SceneryHost, look: SceneLook): void {
  const { scene } = host;
  const sky = paletteColour(look.sky, KANAGAWA.springBlue);
  scene.background = new THREE.Color(sky);
  scene.fog = new THREE.Fog(paletteColour(look.fog, sky), look.fogNear ?? 18, look.fogFar ?? 60);
  const light = look.light ?? 1;
  const tint = paletteColour(look.lightTint, KANAGAWA.fujiWhite);
  scene.add(new THREE.HemisphereLight(tint, paletteColour(look.ground, KANAGAWA.autumnGreen), 1.6 * light));
  const sunlight = new THREE.DirectionalLight(new THREE.Color(KANAGAWA.fujiWhite).lerp(new THREE.Color(tint), 0.5), 1.4 * light);
  sunlight.position.set(-6, 12, 4);
  scene.add(sunlight);

  // The big round sun, far away and never fogged.
  if (look.sun) {
    const sun = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshBasicMaterial({ color: paletteColour(look.sun, KANAGAWA.autumnRed), fog: false }));
    sun.position.set(-26, 22, -70);
    scene.add(sun);
  }

  ground(host, paletteColour(look.ground, KANAGAWA.autumnGreen));
  hills(host, paletteColour(look.hills, KANAGAWA.winterGreen), look.decor.includes("dunes"));
  for (const d of look.decor) DECOR[d](host);
  if (look.particles && look.particles !== "none") particles(host, look.particles);
}

/** The ground: a gently rolling field, flat where the monsters stand. */
function ground({ scene, rand }: SceneryHost, colour: number): void {
  const floor = new THREE.PlaneGeometry(90, 90, 40, 40);
  const pos = floor.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const far = Math.min(1, Math.hypot(x, y + 7) / 20);
    pos.setZ(i, (Math.sin(x * 0.2) + Math.cos(y * 0.17)) * 0.6 * far + (rand() - 0.5) * 0.1);
  }
  floor.computeVertexNormals();
  const mesh = new THREE.Mesh(floor, mat(colour));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.z = -20;
  scene.add(mesh);
}

/** Soft hills along the horizon (long, low dunes in the desert). */
function hills({ scene, rand }: SceneryHost, colour: number, dunes: boolean): void {
  const hill = mat(colour);
  for (let i = 0; i < 7; i++) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(8 + rand() * 6, 12, 8), hill);
    h.scale.y = dunes ? 0.18 + rand() * 0.1 : 0.35 + rand() * 0.2;
    h.position.set(-40 + i * 13 + rand() * 4, -1, -45 - rand() * 10);
    scene.add(h);
  }
}

// ------------------------------------------------------------ what stands about

/** A Japanese pine: a crooked trunk under flat, layered canopies (snow on them in winter). */
function pine({ scene, rand }: SceneryHost, x: number, z: number, size: number, snowy = false): void {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * size, 0.2 * size, 2.4 * size, 6), mat(KANAGAWA.sumiInk5));
  trunk.position.set(x, 1.2 * size, z);
  trunk.rotation.z = (rand() - 0.5) * 0.25;
  scene.add(trunk);
  const needles = mat(KANAGAWA.winterGreen);
  const snow = mat(KANAGAWA.washi);
  for (let k = 0; k < 3; k++) {
    const r = (1.5 - k * 0.35) * size;
    const lx = x + (rand() - 0.5) * 0.5 * size;
    const ly = (1.6 + k * 0.7) * size;
    const layer = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 6), needles);
    layer.scale.y = 0.32;
    layer.position.set(lx, ly, z);
    scene.add(layer);
    if (snowy) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 0.92, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2.4), snow);
      cap.scale.y = 0.3;
      cap.position.set(lx, ly + r * 0.06, z);
      scene.add(cap);
    }
  }
}

function pines(host: SceneryHost, snowy = false): void {
  const { rand } = host;
  for (let i = 0; i < 9; i++) pine(host, -18 + i * 4.5 + (rand() - 0.5) * 2, -20 - rand() * 8, 1.3 + rand() * 0.8, snowy);
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) pine(host, side * (8 + rand() * 4), -4 - i * 5 - rand() * 2, 1 + rand() * 0.5, snowy);
}

/** Tufts of tall grass, their tips swaying in a breeze: susuki (pale plumes) or reeds (cattails). */
function tufts({ scene, rand, animated }: SceneryHost, count: number, stemColour: number, tipColour: number, cattail: boolean, where?: (x: number, z: number) => boolean): void {
  const stem = mat(stemColour);
  const plume = mat(tipColour);
  for (let i = 0; i < count; i++) {
    const x = (rand() - 0.5) * 22;
    const z = -3 - rand() * 14;
    if (clear(x, z) || (where && !where(x, z))) continue;
    for (let b = 0; b < 3; b++) {
      const h = (cattail ? 0.9 : 0.6) + rand() * 0.6;
      const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.03, h, 4), stem);
      const lean = (rand() - 0.5) * 0.5;
      blade.position.set(x + b * 0.12, h / 2, z);
      blade.rotation.z = lean;
      scene.add(blade);
      const tip = cattail ? new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.26, 6), plume) : new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 5), plume);
      tip.position.set(x + b * 0.12 - Math.sin(lean) * h * 0.5, h + 0.05, z);
      tip.rotation.z = lean;
      scene.add(tip);
      const phase = rand() * 6;
      animated.push((t) => (tip.rotation.z = lean + Math.sin(t * 1.4 + phase) * 0.12));
    }
  }
}

/** A lake behind the monsters, with foam curls bobbing on it (Great-Wave style). */
function water(host: SceneryHost): void {
  const { scene, rand, animated } = host;
  const lake = new THREE.Mesh(new THREE.PlaneGeometry(90, 34), new THREE.MeshStandardMaterial({ color: KANAGAWA.waveBlue2, roughness: 0.35, metalness: 0.1 }));
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(0, 0.06, -27.5);
  scene.add(lake);
  const foam = mat(KANAGAWA.fujiWhite);
  for (let i = 0; i < 24; i++) {
    const curl = new THREE.Mesh(new THREE.TorusGeometry(0.35 + rand() * 0.3, 0.06, 5, 10, Math.PI * 1.3), foam);
    const x = (rand() - 0.5) * 40;
    const z = -12 - rand() * 22;
    curl.position.set(x, 0.1, z);
    curl.rotation.set(-Math.PI / 2 + 0.4, 0, rand() * Math.PI);
    scene.add(curl);
    const phase = rand() * 6;
    animated.push((t) => (curl.position.y = 0.1 + Math.sin(t * 1.2 + phase) * 0.06));
  }
}

function rocks({ scene, rand }: SceneryHost): void {
  const stone = mat(KANAGAWA.katanaGray);
  const dark = mat(KANAGAWA.sumiInk6);
  for (let i = 0; i < 16; i++) {
    const x = (rand() - 0.5) * 26;
    const z = -3 - rand() * 18;
    if (clear(x, z)) continue;
    const r = 0.25 + rand() * 0.6;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r), rand() < 0.5 ? stone : dark);
    rock.scale.y = 0.6 + rand() * 0.4;
    rock.position.set(x, r * 0.35, z);
    rock.rotation.set(rand(), rand(), rand());
    scene.add(rock);
  }
}

/** Great snow-capped mountains on the horizon. */
function peaks({ scene, rand }: SceneryHost): void {
  const rock = mat(KANAGAWA.sumiInk6);
  const snow = mat(KANAGAWA.fujiWhite);
  for (let i = 0; i < 6; i++) {
    const h = 14 + rand() * 12;
    const r = 7 + rand() * 5;
    const x = -40 + i * 16 + (rand() - 0.5) * 6;
    const z = -48 - rand() * 10;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), rock);
    cone.position.set(x, h / 2 - 1, z);
    scene.add(cone);
    const capH = h * 0.3;
    const cap = new THREE.Mesh(new THREE.ConeGeometry((r * capH) / h + 0.1, capH, 6), snow);
    cap.position.set(x, h - 1 - capH / 2 + 0.05, z);
    scene.add(cap);
  }
}

/** Sand dunes: long, smooth mounds nearer by (the far ones are the hills), and dry tufts. */
function dunes(host: SceneryHost): void {
  const { scene, rand } = host;
  const sand = mat(KANAGAWA.boatYellow2);
  for (let i = 0; i < 8; i++) {
    const x = (rand() - 0.5) * 50;
    const z = -14 - rand() * 18;
    if (Math.abs(x) < 6 && z > -16) continue;
    const dune = new THREE.Mesh(new THREE.SphereGeometry(4 + rand() * 4, 14, 8), sand);
    dune.scale.set(1.6, 0.25 + rand() * 0.15, 1);
    dune.position.set(x, -0.3, z);
    scene.add(dune);
  }
  tufts(host, 14, KANAGAWA.boatYellow1, KANAGAWA.oldWhite, false);
}

/** Bamboo groves: tall, jointed green stems at the back and the sides. */
function bamboo({ scene, rand, animated }: SceneryHost): void {
  const green = mat(KANAGAWA.autumnGreen);
  const joint = mat(KANAGAWA.winterGreen);
  const leaf = mat(KANAGAWA.springGreen, { side: THREE.DoubleSide });
  const grove = (cx: number, cz: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const x = cx + (rand() - 0.5) * 4;
      const z = cz + (rand() - 0.5) * 3;
      if (clear(x, z)) continue;
      const h = 5 + rand() * 4;
      const stalk = new THREE.Group();
      const cane = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, h, 6), green);
      cane.position.y = h / 2;
      stalk.add(cane);
      for (let y = 0.8; y < h; y += 0.9) {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 6), joint);
        ring.position.y = y;
        stalk.add(ring);
      }
      for (let k = 0; k < 4; k++) {
        const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.14), leaf);
        blade.position.set(Math.cos(k * 1.6) * 0.4, h - 0.6 - k * 0.5, Math.sin(k * 1.6) * 0.4);
        blade.rotation.set(0.3, k * 1.6, -0.4);
        stalk.add(blade);
      }
      stalk.position.set(x, 0, z);
      scene.add(stalk);
      const phase = rand() * 6;
      animated.push((t) => (stalk.rotation.z = Math.sin(t * 0.8 + phase) * 0.025));
    }
  };
  for (let i = 0; i < 5; i++) grove(-16 + i * 8, -22 - rand() * 5, 7);
  for (const side of [-1, 1]) grove(side * 9, -9, 6);
}

/** Cherry trees in full bloom: a dark, bent trunk under round clouds of pink blossom. */
function sakura({ scene, rand }: SceneryHost): void {
  const bark = mat(KANAGAWA.sumiInk5);
  // A soft glow of their own, so the blossom stays pink in the shade.
  const blossom = mat(KANAGAWA.sakuraPink, { emissive: KANAGAWA.sakuraPink, emissiveIntensity: 0.35 });
  const paleColour = new THREE.Color(KANAGAWA.sakuraPink).lerp(new THREE.Color(KANAGAWA.washi), 0.35).getHex();
  const pale = mat(paleColour, { emissive: paleColour, emissiveIntensity: 0.3 });
  const tree = (x: number, z: number, size: number) => {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * size, 0.24 * size, 2.2 * size, 6), bark);
    trunk.position.set(x, 1.1 * size, z);
    trunk.rotation.z = (rand() - 0.5) * 0.35;
    scene.add(trunk);
    for (let k = 0; k < 5; k++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry((0.8 + rand() * 0.5) * size, 9, 6), k % 2 ? blossom : pale);
      puff.position.set(x + (rand() - 0.5) * 2 * size, (2.2 + rand() * 0.9) * size, z + (rand() - 0.5) * 1.2 * size);
      scene.add(puff);
    }
  };
  for (let i = 0; i < 7; i++) tree(-15 + i * 5 + (rand() - 0.5) * 2, -18 - rand() * 8, 1.2 + rand() * 0.6);
  for (const side of [-1, 1]) for (let i = 0; i < 2; i++) tree(side * (7 + rand() * 4), -6 - i * 6, 1 + rand() * 0.4);
}

/** A volcano's ground: dark rock with glowing cracks, and a smoking cone far behind. */
function lava({ scene, rand, animated }: SceneryHost): void {
  const glow = new THREE.MeshBasicMaterial({ color: KANAGAWA.surimiOrange, fog: false });
  for (let i = 0; i < 14; i++) {
    const x = (rand() - 0.5) * 24;
    const z = -4 - rand() * 18;
    if (clear(x, z)) continue;
    const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.2 + rand() * 0.3, 1.2 + rand() * 2), glow);
    crack.rotation.set(-Math.PI / 2, 0, rand() * Math.PI);
    crack.position.set(x, 0.05, z);
    scene.add(crack);
  }
  animated.push((t) => glow.color.setHex(Math.sin(t * 2.2) > 0 ? KANAGAWA.surimiOrange : KANAGAWA.autumnRed));
  const cone = new THREE.Mesh(new THREE.ConeGeometry(14, 18, 7, 1, true), mat(KANAGAWA.sumiInk3));
  cone.position.set(10, 8, -55);
  scene.add(cone);
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(3, 16), new THREE.MeshBasicMaterial({ color: KANAGAWA.autumnRed, fog: false }));
  mouth.rotation.x = -Math.PI / 2;
  mouth.position.set(10, 16.5, -55);
  scene.add(mouth);
}

function mushrooms({ scene, rand }: SceneryHost): void {
  const stalk = mat(KANAGAWA.washi);
  const cap = mat(KANAGAWA.autumnRed);
  for (let i = 0; i < 18; i++) {
    const x = (rand() - 0.5) * 20;
    const z = -3 - rand() * 14;
    if (clear(x, z)) continue;
    const s = 0.5 + rand() * 0.7;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.07 * s, 0.3 * s, 6), stalk);
    stem.position.set(x, 0.15 * s, z);
    scene.add(stem);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.18 * s, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), cap);
    top.position.set(x, 0.28 * s, z);
    scene.add(top);
  }
}

function ferns({ scene, rand }: SceneryHost): void {
  const frond = mat(KANAGAWA.autumnGreen, { side: THREE.DoubleSide });
  for (let i = 0; i < 26; i++) {
    const x = (rand() - 0.5) * 22;
    const z = -3 - rand() * 14;
    if (clear(x, z)) continue;
    for (let k = 0; k < 5; k++) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.8), frond);
      leaf.position.set(x, 0.3, z);
      leaf.rotation.set(-0.9, (k / 5) * Math.PI * 2 + rand(), 0);
      leaf.translateY(0.3);
      scene.add(leaf);
    }
  }
}

const DECOR: Record<SceneDecor, (host: SceneryHost) => void> = {
  pines: (h) => pines(h),
  snowPines: (h) => pines(h, true),
  susuki: (h) => tufts(h, 40, KANAGAWA.boatYellow1, KANAGAWA.boatYellow2, false),
  reeds: (h) => tufts(h, 30, KANAGAWA.autumnGreen, KANAGAWA.sumiInk5, true, (_x, z) => z > -12),
  water,
  rocks,
  peaks,
  dunes,
  bamboo,
  sakura,
  lava,
  mushrooms,
  ferns,
};

// ------------------------------------------------------------ in the air

/** Snow falling, petals drifting, embers rising or leaves tumbling — softly, all over the view. */
function particles({ scene, rand, animated }: SceneryHost, kind: Exclude<SceneParticles, "none">): void {
  const n = kind === "embers" ? 90 : 160;
  const colour = { snow: KANAGAWA.washi, petals: KANAGAWA.sakuraPink, embers: KANAGAWA.surimiOrange, leaves: KANAGAWA.surimiOrange }[kind];
  const positions = new Float32Array(n * 3);
  const seeds = Array.from({ length: n }, () => ({ x: (rand() - 0.5) * 26, y: rand() * 10, z: -1 - rand() * 24, phase: rand() * 6, speed: 0.5 + rand() * 0.6 }));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const dot = document.createElement("canvas");
  dot.width = dot.height = 32;
  const g = dot.getContext("2d")!;
  g.fillStyle = "#fff";
  g.beginPath();
  g.arc(16, 16, 14, 0, Math.PI * 2);
  g.fill();
  const texture = new THREE.CanvasTexture(dot);
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: colour, size: kind === "snow" ? 0.12 : 0.16, map: texture, transparent: true, alphaTest: 0.3, depthWrite: false, fog: kind !== "embers" })
  );
  scene.add(points);
  const fall = { snow: -0.7, petals: -0.45, embers: 0.8, leaves: -0.6 }[kind];
  animated.push((t) => {
    seeds.forEach((s, i) => {
      // Around and around: each drifts through a 10 m tall box, starting over at the far end.
      const y = (((s.y + fall * s.speed * t) % 10) + 10) % 10;
      positions[i * 3] = s.x + Math.sin(t * 0.7 + s.phase) * (kind === "embers" ? 0.2 : 0.6);
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = s.z;
    });
    geometry.attributes.position!.needsUpdate = true;
  });
}
