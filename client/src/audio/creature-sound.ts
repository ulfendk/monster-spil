import type Phaser from "phaser";
import type { CreatureSpecies, TypeId } from "@shared";
import { playBlip } from "./beep";

/** Texture-cache-style key for a species' loaded cry. */
export const cryKey = (speciesId: string): string => `cry-${speciesId}`;

const FALLBACK_PITCH: Record<TypeId, number> = { ild: 160, vand: 520, graes: 700, lyn: 900, sten: 90 };

/**
 * Plays a monster's cry: its own sound file if one was loaded, otherwise a short
 * two-note blip pitched by its type, so a new monster is never silent.
 */
export function playCreatureSound(scene: Phaser.Scene, species: CreatureSpecies): void {
  const key = cryKey(species.id);
  try {
    if (scene.cache.audio.exists(key)) {
      scene.sound.play(key, { volume: 0.9 });
      return;
    }
  } catch {
    // Fall through to the blip: sound is never worth crashing a screen over.
  }
  const pitch = FALLBACK_PITCH[species.type];
  playBlip(pitch, 140);
  setTimeout(() => playBlip(pitch * 1.4, 200), 150);
}
