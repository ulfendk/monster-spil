import Phaser from "phaser";
import type { CreatureSpecies } from "@shared";
import { faceFrameKey, type FaceFrame } from "./placeholder-sprites";

/** What a monster brought to life can do on request. */
export interface MonsterLife {
  /** Cries out: mouth open (if it has face frames), a happy hop — the sound is the caller's. */
  cry(): void;
}

/**
 * Makes a monster picture feel alive, like in the caves: it breathes (a soft squash and
 * stretch on its feet), sways as it looks about, blinks now and then, and every so often
 * gives a little hop or wiggle. Tapping it makes it cry out (`onTap`). Blinking and the
 * open mouth need the face frames placeholder-sprites.ts bakes for the monsters it draws;
 * a real picture (a kid's drawing) has none, so it breathes and moves but doesn't blink.
 * Everything runs on the scene's own clock and tweens, so it stops with the scene.
 */
export function bringToLife(scene: Phaser.Scene, image: Phaser.GameObjects.Image, species: CreatureSpecies, onTap?: () => void): MonsterLife {
  const front = species.spriteFront;
  const frame = (f: FaceFrame) => (scene.textures.exists(faceFrameKey(front, f)) ? faceFrameKey(front, f) : undefined);
  const blinkKey = frame("blink");
  const talkKey = frame("talk");
  const normalKey = image.texture.key;

  // Breathe from the feet, not the middle: move the origin to the bottom without moving the picture.
  const sx = image.scaleX;
  const sy = image.scaleY;
  image.setOrigin(0.5, 1).setY(image.y + image.displayHeight / 2);
  const baseY = image.y;
  scene.tweens.add({ targets: image, scaleY: sy * 1.045, scaleX: sx * 0.975, duration: 1150, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  scene.tweens.add({ targets: image, angle: { from: -3.5, to: 3.5 }, duration: 2600, yoyo: true, repeat: -1, ease: "Sine.easeInOut", delay: 400 });

  let talking = false;
  const showFace = (key: string | undefined, ms: number) => {
    if (!key) return;
    image.setTexture(key);
    scene.time.delayedCall(ms, () => {
      if (image.active) image.setTexture(normalKey);
    });
  };

  // Blink every few seconds (not while its mouth is open).
  const blink = () => {
    if (!image.active) return;
    if (!talking) showFace(blinkKey, 140);
    scene.time.delayedCall(2000 + Math.random() * 3500, blink);
  };
  scene.time.delayedCall(1200 + Math.random() * 1500, blink);

  const hop = (height: number, ms: number) => {
    scene.tweens.add({ targets: image, y: baseY - height, duration: ms, yoyo: true, ease: "Quad.easeOut", onComplete: () => image.setY(baseY) });
  };

  // Now and then, on its own: a little hop, or a quick wiggle.
  const idle = () => {
    if (!image.active) return;
    if (Math.random() < 0.5) hop(image.displayHeight * 0.06, 180);
    else scene.tweens.add({ targets: image, angle: "+=8", duration: 90, yoyo: true, repeat: 2 });
    scene.time.delayedCall(6000 + Math.random() * 5000, idle);
  };
  scene.time.delayedCall(5000 + Math.random() * 3000, idle);

  const life: MonsterLife = {
    cry() {
      if (!image.active) return;
      talking = true;
      showFace(talkKey, 650);
      scene.time.delayedCall(650, () => (talking = false));
      hop(image.displayHeight * 0.1, 160);
    },
  };

  if (onTap) {
    image.setInteractive({ useHandCursor: false });
    image.on("pointerup", onTap);
  }
  return life;
}
