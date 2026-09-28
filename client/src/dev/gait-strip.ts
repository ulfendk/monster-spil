import * as THREE from "three";
import type { CreatureSpecies } from "@shared";
import { rideGait } from "@shared";
import { buildMonsterModel } from "../cave/monster-model";
import { RideAnimator } from "../world3d/mount-gaits";
import { KANAGAWA } from "../ui/theme";

/**
 * Dev only: a monster moving its own way, as a strip of frames (window.__gaitStrip in dev
 * builds) — to check legs, wings and bodies move right without watching it live.
 */
export function gaitStrip(species: CreatureSpecies, opts: { frames?: number; every?: number; speed?: number; cell?: number; turn?: number; tilt?: number; moving?: boolean } = {}): HTMLCanvasElement {
  const frames = opts.frames ?? 8;
  const every = opts.every ?? 3;
  const cell = opts.cell ?? 180;
  const out = document.createElement("canvas");
  out.width = frames * cell;
  out.height = cell;
  const g = out.getContext("2d")!;
  g.fillStyle = "#2a2a37";
  g.fillRect(0, 0, out.width, out.height);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(cell * 2, cell * 2, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(KANAGAWA.fujiWhite, KANAGAWA.sumiInk4, 1.7));
  const camera = new THREE.OrthographicCamera(-0.64, 0.64, 0.72, -0.56, 0.01, 10);
  camera.position.set(0, 0, 3);
  camera.lookAt(0, 0, 0);
  const holder = new THREE.Group();
  scene.add(holder);
  const model = buildMonsterModel({ species, pose: undefined });
  holder.add(model.root);
  holder.rotation.set(opts.tilt ?? 0.15, opts.turn ?? -Math.PI / 2 + 0.3, 0);
  const anim = new RideAnimator(model, rideGait(species) ?? model.gait ?? "waddle", scene, () => -0.5, 0.5);
  const dt = 1 / 30;
  let t = 0;
  for (let f = 0; f < frames * every; f++) {
    t += dt;
    anim.update(dt, opts.moving === false ? 0 : (opts.speed ?? 1.1) * dt, 0, t);
    model.tick?.(t);
    if (f % every === every - 1) {
      renderer.render(scene, camera);
      g.drawImage(renderer.domElement, (Math.floor(f / every)) * cell, 0, cell, cell);
    }
  }
  anim.dispose();
  model.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
