import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type Phaser from "phaser";
import type { Badge } from "@shared";
import { KANAGAWA } from "../ui/theme";

/**
 * The trophies, modelled in gold on a lacquered wooden base — a dragon statue, a cup, a globe,
 * crossed swords, a golden egg, a star, a gem — and rendered from all round into textures
 * (`trophy-<kind>-<frame>`), so the trophy room can show them and spin one when it's tapped.
 */
export type TrophyKind = NonNullable<Badge["trophy"]>;
export const TROPHY_FRAMES = 16;
export const trophyFrameKey = (kind: TrophyKind, frame: number) => `trophy-${kind}-${frame}`;

const PX = 256;

function coloured(g: THREE.BufferGeometry, colour: number): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(colour);
  const cols = new Float32Array(geo.attributes.position!.count * 3);
  for (let i = 0; i < cols.length; i += 3) cols.set([c.r, c.g, c.b], i);
  geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  geo.deleteAttribute("uv");
  return geo;
}

const GOLD: number = KANAGAWA.carpYellow;

function base(): THREE.BufferGeometry[] {
  const plinth = new THREE.CylinderGeometry(0.34, 0.38, 0.14, 24);
  plinth.translate(0, 0.07, 0);
  const rim = new THREE.CylinderGeometry(0.3, 0.3, 0.03, 24);
  rim.translate(0, 0.155, 0);
  return [coloured(plinth, KANAGAWA.autumnRed), coloured(rim, GOLD)];
}

function model(kind: TrophyKind): THREE.BufferGeometry {
  const parts = base();
  const add = (g: THREE.BufferGeometry, c: number = GOLD) => parts.push(coloured(g, c));
  if (kind === "cup") {
    const stem = new THREE.CylinderGeometry(0.05, 0.1, 0.2, 12);
    stem.translate(0, 0.27, 0);
    add(stem);
    const bowl = new THREE.CylinderGeometry(0.22, 0.1, 0.32, 20, 1, true);
    bowl.translate(0, 0.53, 0);
    add(bowl);
    for (const s of [-1, 1]) {
      const h = new THREE.TorusGeometry(0.09, 0.022, 6, 12, Math.PI);
      h.rotateZ(-s * Math.PI / 2);
      h.translate(s * 0.22, 0.55, 0);
      add(h);
    }
  } else if (kind === "dragon") {
    const body = new THREE.SphereGeometry(0.2, 14, 10);
    body.translate(0, 0.38, 0);
    add(body);
    const head = new THREE.SphereGeometry(0.12, 12, 8);
    head.translate(0, 0.62, 0.04);
    add(head);
    for (const s of [-1, 1]) {
      const wing = new THREE.ConeGeometry(0.14, 0.34, 3);
      wing.rotateZ(s * 1.1);
      wing.translate(s * 0.26, 0.48, -0.04);
      add(wing);
      const horn = new THREE.ConeGeometry(0.025, 0.1, 5);
      horn.rotateZ(-s * 0.35);
      horn.translate(s * 0.06, 0.76, 0.02);
      add(horn);
    }
  } else if (kind === "globe") {
    const stand = new THREE.CylinderGeometry(0.03, 0.06, 0.14, 8);
    stand.translate(0, 0.23, 0);
    add(stand);
    const ring = new THREE.TorusGeometry(0.24, 0.018, 6, 24);
    ring.rotateZ(0.4);
    ring.translate(0, 0.54, 0);
    add(ring);
    const globe = new THREE.SphereGeometry(0.2, 18, 12);
    globe.translate(0, 0.54, 0);
    add(globe, KANAGAWA.crystalBlue);
    const land = new THREE.SphereGeometry(0.085, 10, 6);
    land.scale(1, 0.6, 0.5);
    land.translate(0.07, 0.6, 0.16);
    add(land, KANAGAWA.springGreen);
  } else if (kind === "swords") {
    for (const s of [-1, 1]) {
      const blade = new THREE.BoxGeometry(0.035, 0.52, 0.012);
      blade.translate(0, 0.26, 0);
      blade.rotateZ(s * 0.5);
      blade.translate(0, 0.26, 0);
      add(blade, KANAGAWA.fujiWhite);
      const guard = new THREE.BoxGeometry(0.12, 0.025, 0.04);
      guard.rotateZ(s * 0.5);
      guard.translate(-s * 0.1, 0.36, 0);
      add(guard);
    }
  } else if (kind === "egg") {
    const egg = new THREE.SphereGeometry(0.18, 18, 12);
    egg.scale(1, 1.3, 1);
    egg.translate(0, 0.43, 0);
    add(egg);
  } else if (kind === "star") {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.1 : 0.24;
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const star = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 });
    star.center();
    star.translate(0, 0.46, 0);
    add(star);
  } else {
    const gem = new THREE.OctahedronGeometry(0.2, 0);
    gem.scale(1, 1.3, 1);
    gem.translate(0, 0.44, 0);
    add(gem, KANAGAWA.sakuraPink);
  }
  return mergeGeometries(parts)!;
}

/** Renders every trophy from all round into textures (once; afterwards they're there). */
export function bakeTrophies(scene: Phaser.Scene, kinds: TrophyKind[]): void {
  if (kinds.every((k) => scene.textures.exists(trophyFrameKey(k, 0)))) return;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(PX, PX, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0, 0);
  const stage = new THREE.Scene();
  stage.add(new THREE.HemisphereLight(KANAGAWA.fujiWhite, KANAGAWA.sumiInk4, 1.5));
  const sun = new THREE.DirectionalLight(KANAGAWA.fujiWhite, 2.2);
  sun.position.set(-2, 3, 3);
  stage.add(sun);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 10);
  camera.position.set(0, 0.75, 2.2);
  camera.lookAt(0, 0.38, 0);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.35, flatShading: true });
  for (const kind of kinds) {
    if (scene.textures.exists(trophyFrameKey(kind, 0))) continue;
    const mesh = new THREE.Mesh(model(kind), material);
    stage.add(mesh);
    for (let f = 0; f < TROPHY_FRAMES; f++) {
      mesh.rotation.y = -0.5 + (f / TROPHY_FRAMES) * Math.PI * 2;
      renderer.render(stage, camera);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = PX;
      canvas.getContext("2d")!.drawImage(renderer.domElement, 0, 0);
      scene.textures.addCanvas(trophyFrameKey(kind, f), canvas);
    }
    stage.remove(mesh);
    mesh.geometry.dispose();
  }
  material.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
}
