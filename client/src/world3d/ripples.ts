import * as THREE from "three";
import { KANAGAWA } from "../ui/theme";

/** How long a ripple lives (s) and how wide it grows (tiles). */
const LIFE = 1.3;
const GROW = 0.9;

/**
 * Rings spreading on the water round a swimmer: each starts small and bright where it was
 * made and widens and fades on the surface. Shared geometry, one material per ring (they fade
 * on their own). Map3D makes them and ticks them every frame.
 */
export class Ripples {
  private readonly geometry = new THREE.RingGeometry(0.82, 1, 28).rotateX(-Math.PI / 2);
  private readonly rings: Array<{ mesh: THREE.Mesh; age: number; size: number }> = [];

  constructor(private readonly scene: THREE.Scene) {}

  /** A ring at (x, z) on the surface at height y; `size` 1 = a swimmer's stroke. */
  add(x: number, y: number, z: number, size = 1): void {
    const mesh = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ color: KANAGAWA.fujiWhite, transparent: true, opacity: 0.7, depthWrite: false }));
    mesh.position.set(x, y + 0.01, z);
    mesh.scale.setScalar(0.15 * size);
    this.scene.add(mesh);
    this.rings.push({ mesh, age: 0, size });
  }

  update(dt: number): void {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]!;
      r.age += dt;
      const k = r.age / LIFE;
      const material = r.mesh.material as THREE.MeshBasicMaterial;
      if (k >= 1) {
        this.scene.remove(r.mesh);
        material.dispose();
        this.rings.splice(i, 1);
        continue;
      }
      r.mesh.scale.setScalar((0.15 + (1 - (1 - k) ** 2) * GROW) * r.size);
      material.opacity = 0.7 * (1 - k);
    }
  }

  destroy(): void {
    for (const r of this.rings) {
      this.scene.remove(r.mesh);
      (r.mesh.material as THREE.Material).dispose();
    }
    this.rings.length = 0;
    this.geometry.dispose();
  }
}
