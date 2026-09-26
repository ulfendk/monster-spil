import Phaser from "phaser";
import { KANAGAWA } from "../ui/theme";
import { AVATARS } from "../ui/avatars";

/**
 * The player figures — six animal faces drawn in the game's woodblock style (ink
 * outlines, Kanagawa colours, kawaii faces), baked into textures at boot like the
 * placeholder monsters. Drawn on a transparent 128px square so they sit on the
 * player's coloured circle on the map.
 */
export const AVATAR_SIZE = 128;
const INK = KANAGAWA.sumiInk0;
const LINE = 4;
const K = KANAGAWA;

type G = Phaser.GameObjects.Graphics;
type Point = { x: number; y: number };

/** Headwear a figure can wear, unlocked by player level (levels.json "looks"). */
export const LOOKS = ["hachimaki", "kasa", "kabuto", "krone"] as const;

/** The texture of a figure, wearing `look` if it's one we can draw. */
export function avatarKey(id: string | undefined, look?: string): string {
  const base = AVATARS.some((a) => a.id === id) ? `avatar-${id}` : "avatar-unknown";
  return look && (LOOKS as readonly string[]).includes(look) ? `${base}-${look}` : base;
}

/** A player's figure, `size` pixels across, wearing their headwear (if any). */
export function addAvatar(scene: Phaser.Scene, x: number, y: number, id: string | undefined, size: number, look?: string): Phaser.GameObjects.Image {
  return scene.add.image(x, y, avatarKey(id, look)).setScale(size / AVATAR_SIZE);
}

export function generateAvatarTextures(scene: Phaser.Scene): void {
  const draw: Record<string, (g: G) => void> = {
    figur1: fox,
    figur2: frog,
    figur3: panda,
    figur4: cat,
    figur5: rabbit,
    figur6: bear,
    unknown: (g) => head(g, K.oldWhite),
  };
  for (const [id, fn] of Object.entries(draw)) {
    for (const look of [undefined, ...LOOKS]) {
      const key = look ? `avatar-${id}-${look}` : `avatar-${id}`;
      if (scene.textures.exists(key)) continue;
      const g = scene.add.graphics();
      fn(g);
      if (id === "unknown") face(g, 64, 70, false);
      if (look) drawLook(g, look);
      g.generateTexture(key, AVATAR_SIZE, AVATAR_SIZE);
      g.destroy();
    }
  }
}

// ------------------------------------------------------------ headwear (unlocked by level)

function drawLook(g: G, look: (typeof LOOKS)[number]): void {
  if (look === "hachimaki") {
    // A red headband across the brow, knotted at the side with two tails.
    g.fillStyle(K.autumnRed, 1).fillRect(20, 42, 88, 12);
    g.lineStyle(3, INK, 1).strokeRect(20, 42, 88, 12);
    g.fillStyle(K.washi, 1).fillCircle(64, 48, 4);
    outlinedShape(g, [{ x: 104, y: 44 }, { x: 124, y: 34 }, { x: 120, y: 46 }], K.autumnRed);
    outlinedShape(g, [{ x: 104, y: 50 }, { x: 124, y: 60 }, { x: 116, y: 50 }], K.autumnRed);
  } else if (look === "kasa") {
    // A wide conical straw hat with woven rings.
    outlinedShape(g, [{ x: 64, y: 4 }, { x: 122, y: 40 }, { x: 6, y: 40 }], K.boatYellow2);
    g.lineStyle(2, K.boatYellow1, 1);
    for (const k of [0.35, 0.6, 0.85]) g.lineBetween(64 - 58 * k, 4 + 36 * k, 64 + 58 * k, 4 + 36 * k);
    g.fillStyle(INK, 1).fillCircle(64, 6, 3);
  } else if (look === "kabuto") {
    // A samurai helmet: a dark dome, side flaps and a golden crescent crest.
    outlinedShape(g, [{ x: 16, y: 44 }, { x: 22, y: 22 }, { x: 44, y: 10 }, { x: 84, y: 10 }, { x: 106, y: 22 }, { x: 112, y: 44 }], K.sumiInk5);
    outlinedShape(g, [{ x: 10, y: 42 }, { x: 30, y: 40 }, { x: 24, y: 58 }, { x: 8, y: 54 }], K.autumnRed);
    outlinedShape(g, [{ x: 118, y: 42 }, { x: 98, y: 40 }, { x: 104, y: 58 }, { x: 120, y: 54 }], K.autumnRed);
    g.lineStyle(7, K.carpYellow, 1);
    g.beginPath();
    g.arc(64, 26, 30, Math.PI * 1.15, Math.PI * 1.85, false);
    g.strokePath();
    g.fillStyle(K.carpYellow, 1).fillCircle(64, 20, 7);
    g.lineStyle(2, INK, 1).strokeCircle(64, 20, 7);
  } else {
    // A golden crown with three points and red jewels.
    outlinedShape(g, [{ x: 30, y: 40 }, { x: 30, y: 16 }, { x: 46, y: 28 }, { x: 64, y: 6 }, { x: 82, y: 28 }, { x: 98, y: 16 }, { x: 98, y: 40 }], K.carpYellow);
    for (const [x, y] of [[30, 16], [64, 6], [98, 16]] as const) {
      g.fillStyle(K.waveRed, 1).fillCircle(x, y, 4.5);
      g.lineStyle(2, INK, 1).strokeCircle(x, y, 4.5);
    }
    g.fillStyle(K.crystalBlue, 1).fillCircle(64, 32, 4.5);
  }
}

// ------------------------------------------------------------ shared parts

function outlinedEllipse(g: G, x: number, y: number, w: number, h: number, colour: number, line = LINE): void {
  g.fillStyle(colour, 1).fillEllipse(x, y, w, h);
  g.lineStyle(line, INK, 1).strokeEllipse(x, y, w, h);
}

function outlinedShape(g: G, pts: Point[], colour: number): void {
  g.fillStyle(colour, 1).fillPoints(pts, true);
  g.lineStyle(LINE, INK, 1).strokePoints(pts, true);
}

/** The round head every animal starts from. */
function head(g: G, colour: number, w = 92, h = 80, y = 72): void {
  outlinedEllipse(g, 64, y, w, h, colour);
}

/** Kawaii face: ink eyes with a highlight, pink cheeks, a small smile. */
function face(g: G, cx: number, eyeY: number, cheeks = true, eyeGap = 17): void {
  for (const side of [-1, 1]) {
    const x = cx + side * eyeGap;
    g.fillStyle(INK, 1).fillEllipse(x, eyeY, 12, 15);
    g.fillStyle(K.washi, 1).fillCircle(x + 2.5, eyeY - 3.5, 3);
    if (cheeks) g.fillStyle(K.sakuraPink, 0.9).fillEllipse(x + side * 9, eyeY + 13, 13, 7);
  }
  g.lineStyle(3, INK, 1);
  g.beginPath();
  g.arc(cx, eyeY + 10, 5.5, Math.PI * 0.15, Math.PI * 0.85, false);
  g.strokePath();
}

// ------------------------------------------------------------ the animals

/** Kitsune: orange with white cheeks, tall ears with dark tips, a red mark on the brow. */
function fox(g: G): void {
  for (const side of [-1, 1]) {
    const ear = [
      { x: 64 + side * 16, y: 44 },
      { x: 64 + side * 36, y: 10 },
      { x: 64 + side * 44, y: 50 },
    ];
    outlinedShape(g, ear, K.surimiOrange);
    g.fillStyle(INK, 1).fillTriangle(64 + side * 31, 18, 64 + side * 36, 10, 64 + side * 40, 22);
  }
  head(g, K.surimiOrange, 96, 78);
  // white muzzle and cheeks
  g.fillStyle(K.washi, 1).fillEllipse(64, 90, 60, 36);
  g.lineStyle(2, INK, 0.35).strokeEllipse(64, 90, 60, 36);
  g.fillStyle(K.autumnRed, 1).fillTriangle(58, 50, 70, 50, 64, 60);
  face(g, 64, 74);
  g.fillStyle(INK, 1).fillEllipse(64, 82, 7, 5);
}

/** Frog: wide green head, eyes on top bumps, a big smile. */
function frog(g: G): void {
  for (const side of [-1, 1]) outlinedEllipse(g, 64 + side * 24, 44, 34, 30, K.springGreen);
  head(g, K.springGreen, 104, 72, 76);
  for (const side of [-1, 1]) outlinedEllipse(g, 64 + side * 24, 44, 34, 30, K.springGreen, 0.001); // cover the head's outline under the bumps
  for (const side of [-1, 1]) {
    g.fillStyle(K.springGreen, 1).fillEllipse(64 + side * 24, 48, 28, 20);
    g.lineStyle(LINE, INK, 1);
    g.beginPath();
    g.arc(64 + side * 24, 44, 16, Math.PI * 1.05, Math.PI * 1.95, false);
    g.strokePath();
    g.fillStyle(INK, 1).fillEllipse(64 + side * 24, 44, 13, 15);
    g.fillStyle(K.washi, 1).fillCircle(64 + side * 24 + 3, 40, 3);
    g.fillStyle(K.sakuraPink, 0.9).fillEllipse(64 + side * 34, 82, 14, 7);
  }
  g.lineStyle(3, INK, 1);
  g.beginPath();
  g.arc(64, 78, 16, Math.PI * 0.15, Math.PI * 0.85, false);
  g.strokePath();
}

/** Panda: white head, black round ears and eye patches. */
function panda(g: G): void {
  for (const side of [-1, 1]) outlinedEllipse(g, 64 + side * 34, 38, 28, 28, INK);
  head(g, K.washi, 96, 82);
  for (const side of [-1, 1]) {
    const pts: Point[] = [];
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * Math.PI * 2;
      const x = Math.cos(t) * 12;
      const y = Math.sin(t) * 16;
      const a = side * -0.5;
      pts.push({ x: 64 + side * 18 + x * Math.cos(a) - y * Math.sin(a), y: 72 + x * Math.sin(a) + y * Math.cos(a) });
    }
    g.fillStyle(INK, 1).fillPoints(pts, true);
    g.fillStyle(K.washi, 1).fillCircle(64 + side * 18 + 2, 68, 3.5);
    g.fillStyle(K.sakuraPink, 0.9).fillEllipse(64 + side * 30, 90, 12, 6);
  }
  g.fillStyle(INK, 1).fillEllipse(64, 86, 10, 7);
  g.lineStyle(3, INK, 1);
  g.beginPath();
  g.arc(64, 92, 5, Math.PI * 0.15, Math.PI * 0.85, false);
  g.strokePath();
}

/** Calico cat (like a maneki-neko): white with orange and ink patches, pointed ears, whiskers. */
function cat(g: G): void {
  for (const side of [-1, 1]) {
    const ear = [
      { x: 64 + side * 14, y: 42 },
      { x: 64 + side * 38, y: 16 },
      { x: 64 + side * 44, y: 54 },
    ];
    outlinedShape(g, ear, side < 0 ? K.surimiOrange : K.washi);
    g.fillStyle(K.sakuraPink, 1).fillTriangle(64 + side * 24, 42, 64 + side * 36, 26, 64 + side * 38, 48);
  }
  head(g, K.washi, 96, 80);
  // calico patches, kept inside the head
  g.fillStyle(K.surimiOrange, 1).fillEllipse(42, 56, 34, 26);
  g.fillStyle(INK, 1).fillEllipse(88, 54, 24, 16);
  g.lineStyle(LINE, INK, 1).strokeEllipse(64, 72, 96, 80);
  face(g, 64, 74);
  g.lineStyle(2, INK, 0.8);
  for (const side of [-1, 1]) {
    g.lineBetween(64 + side * 26, 86, 64 + side * 48, 82);
    g.lineBetween(64 + side * 26, 90, 64 + side * 48, 92);
  }
}

/** Moon rabbit (tsuki no usagi): white, long ears with pink insides. */
function rabbit(g: G): void {
  for (const side of [-1, 1]) {
    outlinedEllipse(g, 64 + side * 16, 30, 22, 54, K.washi);
    g.fillStyle(K.sakuraPink, 1).fillEllipse(64 + side * 16, 32, 10, 38);
  }
  head(g, K.washi, 92, 76, 78);
  face(g, 64, 80);
  g.fillStyle(K.sakuraPink, 1).fillTriangle(60, 86, 68, 86, 64, 91);
}

/** Bear: brown, round ears, a lighter muzzle. */
function bear(g: G): void {
  for (const side of [-1, 1]) {
    outlinedEllipse(g, 64 + side * 34, 38, 30, 30, K.boatYellow1);
    g.fillStyle(K.boatYellow2, 1).fillEllipse(64 + side * 34, 40, 14, 14);
  }
  head(g, K.boatYellow1, 98, 82);
  g.fillStyle(K.boatYellow2, 1).fillEllipse(64, 90, 40, 28);
  g.lineStyle(2, INK, 0.35).strokeEllipse(64, 90, 40, 28);
  face(g, 64, 72, true, 20);
  g.fillStyle(INK, 1).fillEllipse(64, 84, 12, 8);
}
