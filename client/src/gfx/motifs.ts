import Phaser from "phaser";
import { C, CSS, FONT } from "../ui/theme";

/**
 * Japanese decorative motifs, drawn in code (no image files):
 * - seigaiha (青海波): the "blue ocean waves" pattern of overlapping concentric
 *   semicircles, used as a faint backdrop;
 * - a rising sun disc behind titles and the dragon;
 * - a hanko, the red seal stamp.
 */

const SEIGAIHA_KEY = "motif-seigaiha";
const SCALE_R = 28; // radius of one wave scale

/**
 * Bakes one repeating tile of the seigaiha pattern (once per game). Scales sit in rows
 * R/2 apart, every other row shifted by R; each is a filled half-disc with four
 * concentric rings, and lower rows are drawn over upper ones — which is what makes
 * the overlapping-wave look. Drawing whole rows past the tile's edges, in order, keeps
 * the tile seamless.
 */
function seigaihaTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(SEIGAIHA_KEY)) return SEIGAIHA_KEY;
  const R = SCALE_R;
  const g = scene.add.graphics();
  for (let row = -2; row <= 4; row++) {
    const cy = (row * R) / 2;
    for (let k = -2; k <= 2; k++) {
      const cx = k * 2 * R + (Math.abs(row) % 2) * R;
      g.fillStyle(C.overlay, 1);
      g.beginPath();
      g.arc(cx, cy, R, Math.PI, 0, false);
      g.closePath();
      g.fillPath();
      g.lineStyle(2, C.border, 1);
      for (let ring = 4; ring >= 1; ring--) {
        g.beginPath();
        g.arc(cx, cy, (R * ring) / 4 - 1, Math.PI, 0, false);
        g.strokePath();
      }
    }
  }
  g.generateTexture(SEIGAIHA_KEY, 2 * R, R);
  g.destroy();
  return SEIGAIHA_KEY;
}

/**
 * A faint seigaiha backdrop over a rectangle, fixed on screen, fading in from its top
 * edge (no hard line where the waves start). Returns one container, easy to destroy.
 */
export function addSeigaiha(scene: Phaser.Scene, x: number, y: number, w: number, h: number, alpha = 0.08): Phaser.GameObjects.Container {
  const waves = scene.add.tileSprite(0, 0, w, h, seigaihaTexture(scene)).setOrigin(0, 0).setAlpha(alpha);
  const fadeH = h * 0.45;
  const fade = scene.add.graphics();
  // Ink at the top, transparent further down: the waves appear gradually.
  fade.fillGradientStyle(C.overlay, C.overlay, C.overlay, C.overlay, 0.92, 0.92, 0, 0);
  fade.fillRect(0, -1, w, fadeH);
  return scene.add.container(x, y, [waves, fade]).setScrollFactor(0);
}

/** A rising-sun disc. */
export function addSun(scene: Phaser.Scene, x: number, y: number, radius: number, alpha = 0.22, colour: number = C.sun): Phaser.GameObjects.Arc {
  return scene.add.circle(x, y, radius, colour, alpha).setScrollFactor(0);
}

/**
 * A hanko (red seal stamp) with one character, e.g. 狩 ("hunt"). Purely decorative —
 * the game's text stays Danish.
 */
export function addHanko(scene: Phaser.Scene, x: number, y: number, size: number, glyph = "狩"): Phaser.GameObjects.Container {
  const box = scene.add.rectangle(0, 0, size, size, C.danger).setStrokeStyle(Math.max(2, size * 0.06), C.paper, 0.9);
  const inner = scene.add.rectangle(0, 0, size * 0.8, size * 0.8).setStrokeStyle(Math.max(1, size * 0.03), C.paper, 0.7);
  const text = scene.add.text(0, 0, glyph, { fontFamily: FONT, fontSize: `${Math.round(size * 0.58)}px`, color: CSS.paper }).setOrigin(0.5);
  return scene.add.container(x, y, [box, inner, text]).setAngle(-4).setScrollFactor(0);
}

/**
 * The standard background for a full-screen screen (menus, battle): ink, a faint wave
 * pattern along the bottom, and optionally a sun. Returns what it created, so a
 * relayout can destroy it.
 */
export function addScreenBackdrop(
  scene: Phaser.Scene,
  width: number,
  height: number,
  options: { alpha?: number; sun?: { x: number; y: number; r: number } } = {}
): Phaser.GameObjects.GameObject[] {
  const bg = scene.add.rectangle(0, 0, width, height, C.overlay, options.alpha ?? 1).setOrigin(0, 0).setScrollFactor(0);
  const band = Math.round(height * 0.34);
  const waves = addSeigaiha(scene, 0, height - band, width, band, 0.07);
  const made: Phaser.GameObjects.GameObject[] = [bg, waves];
  if (options.sun) made.splice(1, 0, addSun(scene, options.sun.x, options.sun.y, options.sun.r));
  return made;
}

export { CSS };
