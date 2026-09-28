import * as THREE from "three";
import type { CreatureSpecies } from "@shared";
import { buildMonsterModel } from "../cave/monster-model";
import { KANAGAWA } from "../ui/theme";

/**
 * Dev only: every monster's model side by side on one sheet (window.__monsterSheet in dev
 * builds), to see how they all look at once — at a stage, from an angle, with a face.
 */
export function monsterSheet(species: CreatureSpecies[], opts: { cols?: number; cell?: number; stage?: number; turn?: number; face?: "normal" | "blink" | "talk"; time?: number } = {}): HTMLCanvasElement {
  const cols = opts.cols ?? 8;
  const cell = opts.cell ?? 170;
  const rows = Math.ceil(species.length / cols);
  const out = document.createElement("canvas");
  out.width = cols * cell;
  out.height = rows * (cell + 18);
  const g = out.getContext("2d")!;
  g.fillStyle = "#2a2a37";
  g.fillRect(0, 0, out.width, out.height);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(cell * 2, cell * 2, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const stage = new THREE.Scene();
  stage.add(new THREE.HemisphereLight(KANAGAWA.fujiWhite, KANAGAWA.sumiInk4, 1.7));
  const sun = new THREE.DirectionalLight(KANAGAWA.fujiWhite, 1.6);
  sun.position.set(-2, 3, 4);
  stage.add(sun);
  const camera = new THREE.OrthographicCamera(-0.6, 0.6, 0.6, -0.6, 0.01, 10);
  camera.position.set(0, 0, 3);
  camera.lookAt(0, 0, 0);
  species.forEach((s, i) => {
    const model = buildMonsterModel({ species: s, stage: opts.stage ?? 1 });
    model.setFace(opts.face ?? "normal");
    model.tick?.(opts.time ?? 0.7);
    model.root.rotation.set(0.12, opts.turn ?? model.view ?? -0.42, 0);
    stage.add(model.root);
    renderer.render(stage, camera);
    stage.remove(model.root);
    model.dispose();
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * (cell + 18);
    g.drawImage(renderer.domElement, x, y, cell, cell);
    g.fillStyle = "#dcd7ba";
    g.font = "13px sans-serif";
    g.textAlign = "center";
    g.fillText(`${s.navn}`, x + cell / 2, y + cell + 12);
  });
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
