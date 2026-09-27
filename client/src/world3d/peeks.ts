import * as THREE from "three";
import { KANAGAWA } from "../ui/theme";
import { buildMonsterModel, type MonsterModel, type MonsterModelSpec } from "../cave/monster-model";
import type { MapStage } from "./map-stage";

/**
 * Monsters hiding in the tall grass on the 3D map, giving themselves away: the monster itself,
 * sunk into the grass so only its ears, crest, leaves or horns stick out, rustling the grass —
 * and every few seconds it pops up to look about (eyes and all) and ducks again. A monster
 * without a model (a kid's drawing) shows as two eyes blinking in the grass.
 *
 * Only the look: OverworldScene decides where and who, and meets that very monster when the
 * player walks in there.
 */

interface Peek {
  id: number;
  x: number;
  z: number;
  root: THREE.Group;
  model?: MonsterModel;
  eyes?: THREE.Mesh[];
  size: number;
  /** The model's real top and height (it doesn't fill its box: a small monster sits low in it). */
  top: number;
  height: number;
  /** Seconds since it appeared; and how long it's been leaving (a jump and a duck), if it is. */
  age: number;
  leaving?: number;
  seed: number;
}

export class PeekLayer {
  private readonly peeks = new Map<number, Peek>();
  private nextId = 1;
  private last?: number;
  private readonly eyeMaterial = new THREE.MeshBasicMaterial({ color: KANAGAWA.sumiInk0 });
  private readonly glintMaterial = new THREE.MeshBasicMaterial({ color: KANAGAWA.washi });
  private readonly eye = new THREE.SphereGeometry(0.5, 10, 8);

  constructor(private readonly stage: MapStage) {}

  get count(): number {
    return this.peeks.size;
  }

  /** A monster peeking out on tile (x, y); its model if it has one. Returns its id. */
  add(x: number, y: number, spec: MonsterModelSpec | undefined): number {
    const id = this.nextId++;
    const root = new THREE.Group();
    const peek: Peek = { id, x: x + 0.5, z: y + 0.5, root, size: 0.95, top: 0, height: 0, age: 0, seed: Math.random() * 10 };
    if (spec) {
      peek.model = buildMonsterModel(spec);
      peek.model.root.scale.setScalar(peek.size);
      root.add(peek.model.root);
      const box = new THREE.Box3().setFromObject(peek.model.root);
      peek.top = box.max.y;
      peek.height = box.max.y - box.min.y;
    } else {
      // Two eyes in the grass, with a glint each.
      peek.eyes = [-1, 1].map((side) => {
        const e = new THREE.Mesh(this.eye, this.eyeMaterial);
        e.scale.set(0.07, 0.09, 0.05);
        e.position.set(side * 0.08, 0, 0);
        const glint = new THREE.Mesh(this.eye, this.glintMaterial);
        glint.scale.set(0.3, 0.3, 0.3);
        glint.position.set(0.15, 0.2, 0.4);
        e.add(glint);
        root.add(e);
        return e;
      });
    }
    this.stage.scene.add(root);
    this.peeks.set(id, peek);
    return id;
  }

  /** Where each one hides (tiles). */
  spots(): Array<{ id: number; x: number; y: number }> {
    return [...this.peeks.values()].filter((p) => p.leaving === undefined).map((p) => ({ id: p.id, x: Math.floor(p.x), y: Math.floor(p.z) }));
  }

  /** It goes: with `startled`, a little jump first, then it ducks away. */
  remove(id: number, startled = false): void {
    const p = this.peeks.get(id);
    if (!p || p.leaving !== undefined) return;
    p.leaving = startled ? 0 : 0.35;
  }

  clear(): void {
    for (const p of this.peeks.values()) this.drop(p);
    this.peeks.clear();
  }

  /** Every frame: they bob, look about, pop up now and then, rustle; leaving ones duck away. */
  update(): void {
    // Its own clock (real time), so they move the same whatever the game's frame rate.
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, now - (this.last ?? now));
    this.last = now;
    const cam = this.stage.camera.position;
    for (const p of [...this.peeks.values()]) {
      p.age += dt;
      const ground = this.stage.heightAt(p.x, p.z);
      // Hidden: only the top of the head out. Every few seconds it pops up to look about.
      const cycle = (p.age + p.seed) % 4.2;
      const pop = cycle > 3 ? Math.sin(((cycle - 3) / 1.2) * Math.PI) : 0;
      let out = 0.36 + 0.36 * pop + Math.sin(p.age * 5 + p.seed) * 0.02; // share of it above the ground (the susuki hide some)
      const appear = Math.min(1, p.age / 0.6);
      out *= appear;
      if (p.leaving !== undefined) {
        p.leaving += dt;
        const jump = p.leaving < 0.35 ? Math.sin((p.leaving / 0.35) * Math.PI) * 0.5 : 0;
        out = Math.max(0, out + jump - Math.max(0, p.leaving - 0.35) * 2.5);
        if (p.leaving > 0.8) {
          this.drop(p);
          this.peeks.delete(p.id);
          continue;
        }
      }
      // Rustling: a quick little shake sideways.
      const rustle = Math.sin(p.age * 22 + p.seed) * 0.03 * (1 - pop);
      if (p.model) {
        // `out` of its height above the ground (a little above the susuki's plumes at the least).
        p.root.position.set(p.x + rustle, ground + 0.2 + p.height * out - p.top, p.z);
        // It looks towards the camera, turning its head a little from side to side.
        p.model.root.rotation.y = Math.atan2(cam.x - p.x, cam.z - p.z) + Math.sin(p.age * 1.3 + p.seed) * 0.5;
        // Blinks now and then; wide-eyed when it pops up.
        p.model.setFace(pop > 0.2 ? "normal" : (p.age * 1.7 + p.seed) % 3 < 0.12 ? "blink" : "normal");
      } else if (p.eyes) {
        p.root.position.set(p.x + rustle, ground + 0.12 + 0.12 * pop, p.z);
        p.root.lookAt(cam.x, p.root.position.y, cam.z);
        const blink = (p.age * 1.3 + p.seed) % 2.6 < 0.14 ? 0.12 : 1;
        for (const e of p.eyes) e.scale.y = 0.09 * blink * appear * (p.leaving === undefined ? 1 : Math.max(0, 1 - p.leaving * 2));
      }
    }
  }

  private drop(p: Peek): void {
    this.stage.scene.remove(p.root);
    p.model?.dispose();
  }

  destroy(): void {
    this.clear();
    this.eye.dispose();
    this.eyeMaterial.dispose();
    this.glintMaterial.dispose();
  }
}
