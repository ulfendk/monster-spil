import type Phaser from "phaser";

/** The size scenes are laid out for: the placeholder monsters are drawn at 128 px. */
export const SPRITE_SIZE = 128;

/**
 * Multiply a monster picture's scale by this, so a picture of any size (the drawing import
 * makes sharp 384 px ones) shows as big as a 128 px placeholder would.
 */
export function spriteFit(scene: Phaser.Scene, key: string): number {
  if (!scene.textures.exists(key)) return 1;
  const source = scene.textures.get(key).getSourceImage() as { width: number; height: number };
  const side = Math.max(source.width, source.height);
  return side > 0 ? SPRITE_SIZE / side : 1;
}
