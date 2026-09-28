import * as THREE from "three";
import type Phaser from "phaser";
import { KANAGAWA } from "../ui/theme";
import { faceFrameKey, placeholderPictures } from "../gfx/placeholder-sprites";
import { buildMonsterModel } from "./monster-model";
import { picturesChanged } from "../gfx/variants";

/**
 * The monsters on the 2D screens (the monster book, a monster's page, the starter pick,
 * trades, rewards, the 2D battles) are their 3D models too: after start-up each monster the
 * game draws is rendered from its model — from the front, from behind, and with its eyes shut
 * and its mouth open — and painted into the very picture it replaces (the placeholder's own
 * canvas, same key and size), so every screen shows it without knowing, and a picture already
 * on screen turns 3D where it stands. It happens in the background, a few milliseconds per
 * frame, so nothing waits for it. A kid's drawing is left as it is.
 *
 * Rendered in the picture's 128-px box (an orthographic camera looking straight at it), a
 * little turned for a three-quarter view, at twice the size and scaled down for smooth edges.
 */

const PX = 256;
/** How far round the monster is turned (radians): a three-quarter view shows it's round. */
const TURN = -0.42;

/** How long (ms) each frame may spend on it. */
const BUDGET_MS = 6;

export async function bakeMonsterPictures(scene: Phaser.Scene, progress?: (done: number, total: number) => void): Promise<number> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(PX, PX, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const stage = new THREE.Scene();
  stage.add(new THREE.HemisphereLight(KANAGAWA.fujiWhite, KANAGAWA.sumiInk4, 1.7));
  const sun = new THREE.DirectionalLight(KANAGAWA.fujiWhite, 1.6);
  sun.position.set(-2, 3, 4);
  stage.add(sun);
  const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.01, 10);
  camera.position.set(0, 0, 3);
  camera.lookAt(0, 0, 0);

  const jobs: Array<{ key: string; spec: ReturnType<typeof placeholderPictures>[number][1]; back: boolean; face: "normal" | "blink" | "talk" }> = [];
  const pictures = placeholderPictures();
  const backs = new Set(pictures.map(([, spec]) => spec.species.spriteBack));
  for (const [key, spec] of pictures) {
    const back = backs.has(key) && key !== spec.species.spriteFront;
    jobs.push({ key, spec, back, face: "normal" });
    if (!back && !spec.look) {
      for (const face of ["blink", "talk"] as const) {
        const frameKey = faceFrameKey(key, face);
        if (scene.textures.exists(frameKey)) jobs.push({ key: frameKey, spec, back: false, face });
      }
    }
  }

  let done = 0;
  let frameStart = performance.now();
  for (const job of jobs) {
    const model = buildMonsterModel(job.spec);
    model.setFace(job.face);
    // A little smaller than the box, so turned wings and crests aren't cut off.
    model.root.scale.setScalar(0.9);
    model.root.position.y = -0.03;
    const turn = model.view ?? TURN;
    model.root.rotation.set(0.12, job.back ? Math.PI - turn : turn, 0);
    stage.add(model.root);
    renderer.render(stage, camera);
    stage.remove(model.root);
    model.dispose();
    // Into the picture's own canvas (a Phaser canvas texture), then up to the GPU again.
    const texture = scene.textures.get(job.key) as Phaser.Textures.CanvasTexture;
    if (texture && typeof texture.refresh === "function") {
      const canvas = texture.getSourceImage() as HTMLCanvasElement;
      const g = canvas.getContext("2d")!;
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.imageSmoothingQuality = "high";
      g.drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height);
      texture.refresh();
    }
    done++;
    // A little each frame, so the game never waits for it.
    if (performance.now() - frameStart > BUDGET_MS) {
      progress?.(done, jobs.length);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      frameStart = performance.now();
    }
  }
  renderer.dispose();
  renderer.forceContextLoss();
  picturesChanged(); // rare variants are recoloured from the new pictures from now on
  return done;
}
