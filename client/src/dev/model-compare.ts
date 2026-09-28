import * as THREE from "three";
import { buildMonsterModel } from "../cave/monster-model";
import { loadContent } from "../content/load-content";
import { KANAGAWA } from "../ui/theme";

/**
 * Dev only: monsters sculpted in Blender (tools/models) next to how the game draws them
 * without their sculpt — `(await import("/src/dev/model-compare.ts")).compare(["hophare"])`
 * puts the sheet on the page. (Without it = the same species under another id, so its shade,
 * picked from the id, can differ a little.)
 */
export function compare(ids: string[], opts: { stage?: number; cell?: number; cols?: number; before?: boolean; turn?: number } = {}): string[] {
  const { stage = 1, cell = 240, cols = 6, before = true } = opts;
  const all = loadContent().speciesById;
  const jobs = ids.flatMap((id) => [...(before ? [{ s: { ...all[id]!, id: `${id}~` }, label: `${id} (før)` }] : []), { s: all[id]!, label: id }]);
  const out = document.createElement("canvas");
  out.width = cols * cell;
  out.height = Math.ceil(jobs.length / cols) * (cell + 16);
  const g = out.getContext("2d")!;
  g.fillStyle = "#2a2a37";
  g.fillRect(0, 0, out.width, out.height);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(cell * 2, cell * 2, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(KANAGAWA.fujiWhite, KANAGAWA.sumiInk4, 1.7));
  const sun = new THREE.DirectionalLight(KANAGAWA.fujiWhite, 1.6);
  sun.position.set(-2, 3, 4);
  scene.add(sun);
  const camera = new THREE.OrthographicCamera(-0.6, 0.6, 0.6, -0.6, 0.01, 10);
  camera.position.set(0, 0, 3);
  camera.lookAt(0, 0, 0);
  const report: string[] = [];
  jobs.forEach((j, i) => {
    const m = buildMonsterModel({ species: j.s, stage });
    report.push(j.label);
    m.setFace("normal");
    m.tick?.(0.7);
    m.root.rotation.set(0.12, opts.turn ?? m.view ?? -0.42, 0);
    scene.add(m.root);
    renderer.render(scene, camera);
    scene.remove(m.root);
    m.dispose();
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * (cell + 16);
    g.drawImage(renderer.domElement, x, y, cell, cell);
    g.fillStyle = "#dcd7ba";
    g.font = "12px sans-serif";
    g.textAlign = "center";
    g.fillText(j.label, x + cell / 2, y + cell + 11);
  });
  renderer.dispose();
  renderer.forceContextLoss();
  document.body.innerHTML = "";
  out.style.cssText = "position:fixed;left:0;top:0;z-index:99;max-width:100vw";
  document.body.appendChild(out);
  return report;
}
