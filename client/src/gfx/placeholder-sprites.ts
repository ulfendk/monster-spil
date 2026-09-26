import Phaser from "phaser";
import type { CreatureSpecies, TypeId } from "@shared";
import { KANAGAWA } from "../ui/theme";

/** One Kanagawa colour per type — for the creatures, their moves' buttons and badges. */
export const TYPE_COLOURS: Record<TypeId, number> = {
  ild: KANAGAWA.peachRed,
  vand: KANAGAWA.crystalBlue,
  graes: KANAGAWA.springGreen,
  lyn: KANAGAWA.carpYellow,
  sten: KANAGAWA.boatYellow1,
};

const SPRITE_SIZE = 128;
const INK = KANAGAWA.sumiInk0;
const LINE = 3;

type Point = { x: number; y: number };

const shade = (colour: number, amount: number): number =>
  amount >= 0 ? Phaser.Display.Color.IntegerToColor(colour).lighten(amount).color : Phaser.Display.Color.IntegerToColor(colour).darken(-amount).color;

/**
 * No creature art exists yet, so this bakes an original placeholder per species into a
 * texture keyed to species.spriteFront/spriteBack — a little yokai in the game's
 * Kanagawa woodblock style: bold ink outlines, a round body whose proportions come
 * from its stats (so no two species look alike), a kawaii face, and a head feature
 * for its type. Dropping a real drawing in at the same texture key needs no code
 * change — only deleting this module once every creature has art.
 *
 * `looks`: species drawn as something other than an ordinary monster — the raid bosses and
 * the babies they give as dragons (wings and horns), sand serpents and their hatchlings
 * as coiled serpents, giant eagles and their eaglets as eagles.
 */
export type BossLook = "dragon" | "serpent" | "eagle";

export function generatePlaceholderSprites(scene: Phaser.Scene, species: CreatureSpecies[], looks: Readonly<Record<string, BossLook>> = {}): void {
  for (const s of species) {
    const look = looks[s.id];
    for (const [key, isBack] of [[s.spriteFront, false], [s.spriteBack, true]] as const) {
      if (scene.textures.exists(key)) continue;
      if (look === "serpent") drawSerpent(scene, s, key, isBack);
      else if (look === "eagle") drawEagle(scene, s, key, isBack);
      else drawCreature(scene, s, key, isBack, look === "dragon");
    }
  }
}

/**
 * A sand serpent: three coils stacked like a spring, lighter belly bands, and a hooded head
 * rising from the top with slit eyes and a forked tongue. Seen from behind: coils and hood.
 */
function drawSerpent(scene: Phaser.Scene, species: CreatureSpecies, key: string, isBack: boolean): void {
  const g = scene.add.graphics();
  const colour = shade(TYPE_COLOURS[species.type], -6);
  const cx = SPRITE_SIZE / 2;
  const coils = [
    { y: 106, w: 104, h: 30 },
    { y: 86, w: 86, h: 26 },
    { y: 68, w: 66, h: 22 },
  ];
  for (const c of coils) {
    g.fillStyle(colour, 1).fillEllipse(cx, c.y, c.w, c.h);
    // Diamond marks along the coil, like the scales of a desert snake.
    for (let i = -2; i <= 2; i++) {
      const x = cx + i * c.w * 0.18;
      g.fillStyle(shade(colour, -26), 1).fillPoints([{ x, y: c.y - 7 }, { x: x + 5, y: c.y - 2 }, { x, y: c.y + 3 }, { x: x - 5, y: c.y - 2 }], true);
    }
    if (!isBack) g.fillStyle(shade(colour, 22), 1).fillEllipse(cx, c.y + c.h * 0.22, c.w * 0.7, c.h * 0.34);
    g.lineStyle(LINE, INK, 1).strokeEllipse(cx, c.y, c.w, c.h);
  }
  // The neck rising out of the top coil, and the hood around the head.
  const neck = [{ x: cx - 10, y: 66 }, { x: cx - 8, y: 44 }, { x: cx + 8, y: 44 }, { x: cx + 10, y: 66 }];
  fillOutlined(g, neck, colour);
  fillOutlined(g, ellipsePoints(cx, 32, 30, 22, 0, 24), shade(colour, -14));
  fillOutlined(g, ellipsePoints(cx, 32, 18, 16, 0, 20), colour);
  if (!isBack) {
    for (const side of [-1, 1]) {
      g.fillStyle(KANAGAWA.carpYellow, 1).fillEllipse(cx + side * 8, 30, 10, 11);
      g.fillStyle(INK, 1).fillEllipse(cx + side * 8, 30, 3, 9);
      g.fillStyle(KANAGAWA.sakuraPink, 0.85).fillEllipse(cx + side * 13, 39, 8, 4);
    }
    // A forked tongue flicking out.
    g.lineStyle(2.5, KANAGAWA.autumnRed, 1);
    g.beginPath();
    g.moveTo(cx, 44);
    g.lineTo(cx, 52);
    g.lineTo(cx - 4, 57);
    g.moveTo(cx, 52);
    g.lineTo(cx + 4, 57);
    g.strokePath();
  } else {
    // The hood's markings, seen from behind.
    g.lineStyle(2.5, INK, 0.8).strokeEllipse(cx - 9, 30, 9, 11).strokeEllipse(cx + 9, 30, 9, 11);
  }
  g.generateTexture(key, SPRITE_SIZE, SPRITE_SIZE);
  g.destroy();
}

/**
 * A giant eagle: wide feathered wings spread behind a strong body, a white head with a
 * hooked beak and fierce eyes, and talons. Seen from behind: wings, back and the white nape.
 */
function drawEagle(scene: Phaser.Scene, species: CreatureSpecies, key: string, isBack: boolean): void {
  const g = scene.add.graphics();
  const body = shade(TYPE_COLOURS[species.type], -34);
  const wing = shade(body, -18);
  const cx = SPRITE_SIZE / 2;
  const cy = 76;
  for (const side of [-1, 1]) {
    // Each wing ends in a fan of long flight feathers.
    const pts: Point[] = [{ x: cx + side * 14, y: cy - 16 }, { x: cx + side * 40, y: cy - 38 }, { x: cx + side * 62, y: cy - 34 }];
    for (let f = 0; f < 5; f++) {
      pts.push({ x: cx + side * (62 - f * 4), y: cy - 22 + f * 9 });
      pts.push({ x: cx + side * (52 - f * 5), y: cy - 18 + f * 9 });
    }
    pts.push({ x: cx + side * 16, y: cy + 16 });
    fillOutlined(g, pts, wing);
    g.lineStyle(1.5, INK, 0.5);
    for (let f = 0; f < 4; f++) g.lineBetween(cx + side * (30 + f * 6), cy - 24 + f * 4, cx + side * (48 - f * 2), cy + f * 9 - 12);
  }
  // Talons under the body.
  for (const side of [-1, 1]) {
    const x = cx + side * 12;
    g.lineStyle(3, KANAGAWA.carpYellow, 1).lineBetween(x, cy + 26, x, cy + 40);
    g.lineStyle(2.5, INK, 1);
    for (const d of [-5, 0, 5]) g.lineBetween(x, cy + 40, x + d, cy + 46);
  }
  g.fillStyle(body, 1).fillEllipse(cx, cy, 44, 58);
  if (!isBack) g.fillStyle(shade(body, 18), 1).fillEllipse(cx, cy + 10, 26, 30);
  g.lineStyle(LINE, INK, 1).strokeEllipse(cx, cy, 44, 58);
  // The white head.
  fillOutlined(g, ellipsePoints(cx, 38, 17, 15, 0, 22), KANAGAWA.fujiWhite);
  if (!isBack) {
    // A hooked yellow beak.
    fillOutlined(g, [{ x: cx - 6, y: 42 }, { x: cx + 6, y: 42 }, { x: cx + 3, y: 54 }, { x: cx - 1, y: 50 }], KANAGAWA.carpYellow);
    for (const side of [-1, 1]) {
      g.fillStyle(KANAGAWA.surimiOrange, 1).fillEllipse(cx + side * 7, 35, 9, 9);
      g.fillStyle(INK, 1).fillCircle(cx + side * 7, 35, 2.8);
      // A stern brow.
      g.lineStyle(3, INK, 1).lineBetween(cx + side * 2, 31, cx + side * 12, 28);
    }
  }
  g.generateTexture(key, SPRITE_SIZE, SPRITE_SIZE);
  g.destroy();
}

/** The body's size from the stats: defence makes it wider, HP taller (clamped to fit the texture). */
function bodyShape(species: CreatureSpecies): { w: number; h: number } {
  const { hp, forsvar } = species.baseStats;
  return {
    w: Phaser.Math.Clamp(46 + forsvar * 2.4, 62, 94),
    h: Phaser.Math.Clamp(30 + Math.min(hp, 60) * 0.75, 54, 76),
  };
}

/** A small, stable per-species shift (-12..+12) so two monsters of one type differ in shade. */
function speciesShade(id: string): number {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (hash % 25) - 12;
}

function drawCreature(scene: Phaser.Scene, species: CreatureSpecies, key: string, isBack: boolean, dragon: boolean): void {
  const g = scene.add.graphics();
  const colour = shade(TYPE_COLOURS[species.type], dragon ? 0 : speciesShade(species.id));
  const { w, h } = bodyShape(species);
  const cx = SPRITE_SIZE / 2;
  const cy = SPRITE_SIZE - 12 - h / 2; // feet near the bottom of the texture
  const top = cy - h / 2;

  if (dragon) drawWings(g, cx, cy, colour);
  // Behind the body: the tail (seen from behind) and the type feature's back parts.
  if (isBack) drawTail(g, cx + w * 0.42, cy + h * 0.22, colour);
  if (!dragon) drawTypeFeature(g, species.type, cx, top, w);

  // Feet, then the body with a lighter belly.
  for (const side of [-1, 1]) {
    g.fillStyle(shade(colour, -18), 1).fillEllipse(cx + side * w * 0.26, cy + h / 2 - 3, 20, 12);
    g.lineStyle(LINE, INK, 1).strokeEllipse(cx + side * w * 0.26, cy + h / 2 - 3, 20, 12);
  }
  g.fillStyle(colour, 1).fillEllipse(cx, cy, w, h);
  if (!isBack) g.fillStyle(shade(colour, 16), 1).fillEllipse(cx, cy + h * 0.2, w * 0.6, h * 0.46);
  g.lineStyle(LINE, INK, 1).strokeEllipse(cx, cy, w, h);

  if (dragon) drawDragonHorns(g, cx, top, w);
  if (!isBack) drawFace(g, cx, cy - h * 0.08, w, species.baseStats.angreb >= 13, dragon);

  g.generateTexture(key, SPRITE_SIZE, SPRITE_SIZE);
  g.destroy();
}

/** Kawaii face: ink eyes with a highlight, pink cheeks, a small smile — and a fang for strong attackers. */
function drawFace(g: Phaser.GameObjects.Graphics, cx: number, eyeY: number, w: number, fang: boolean, dragon: boolean): void {
  const dx = Math.max(12, w * 0.19);
  for (const side of [-1, 1]) {
    const x = cx + side * dx;
    if (dragon) {
      g.fillStyle(KANAGAWA.carpYellow, 1).fillEllipse(x, eyeY, 13, 15);
      g.fillStyle(INK, 1).fillEllipse(x, eyeY, 4, 12);
    } else {
      g.fillStyle(INK, 1).fillEllipse(x, eyeY, 11, 14);
      g.fillStyle(KANAGAWA.washi, 1).fillCircle(x + 2, eyeY - 3, 2.6);
    }
    g.fillStyle(KANAGAWA.sakuraPink, 0.85).fillEllipse(x + side * 8, eyeY + 11, 12, 6);
  }
  g.lineStyle(2.5, INK, 1);
  g.beginPath();
  g.arc(cx, eyeY + 8, 5, Math.PI * 0.15, Math.PI * 0.85, false);
  g.strokePath();
  if (fang || dragon) {
    g.fillStyle(KANAGAWA.washi, 1).fillTriangle(cx + 1, eyeY + 12, cx + 6, eyeY + 12, cx + 3.5, eyeY + 18);
    g.lineStyle(1.5, INK, 1).strokeTriangle(cx + 1, eyeY + 12, cx + 6, eyeY + 12, cx + 3.5, eyeY + 18);
  }
}

function drawTail(g: Phaser.GameObjects.Graphics, x: number, y: number, colour: number): void {
  const pts = [
    { x, y: y - 6 },
    { x: x + 18, y: y - 16 },
    { x: x + 22, y: y - 2 },
    { x: x + 6, y: y + 8 },
  ];
  g.fillStyle(shade(colour, -10), 1).fillPoints(pts, true);
  g.lineStyle(LINE, INK, 1).strokePoints(pts, true);
}

/** Points of an ellipse rotated by `angle`, for shapes Graphics can't rotate (leaves). */
function ellipsePoints(cx: number, cy: number, rx: number, ry: number, angle: number, n = 18): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = Math.cos(t) * rx;
    const y = Math.sin(t) * ry;
    out.push({ x: cx + x * Math.cos(angle) - y * Math.sin(angle), y: cy + x * Math.sin(angle) + y * Math.cos(angle) });
  }
  return out;
}

function fillOutlined(g: Phaser.GameObjects.Graphics, pts: Point[], colour: number): void {
  g.fillStyle(colour, 1).fillPoints(pts, true);
  g.lineStyle(LINE, INK, 1).strokePoints(pts, true);
}

/** A teardrop flame with its tip at the top. */
function flame(cx: number, baseY: number, height: number, width: number): Point[] {
  return [
    { x: cx, y: baseY - height },
    { x: cx + width * 0.3, y: baseY - height * 0.55 },
    { x: cx + width * 0.5, y: baseY - height * 0.2 },
    { x: cx + width * 0.3, y: baseY },
    { x: cx - width * 0.3, y: baseY },
    { x: cx - width * 0.5, y: baseY - height * 0.2 },
    { x: cx - width * 0.3, y: baseY - height * 0.55 },
  ];
}

/** Each type's head feature, drawn before the body so the body overlaps its base. */
function drawTypeFeature(g: Phaser.GameObjects.Graphics, type: TypeId, cx: number, top: number, w: number): void {
  switch (type) {
    case "ild": {
      // A crest of three flames (fox-fire), orange with yellow hearts.
      for (const [dx, h, fw] of [[-13, 24, 16], [13, 24, 16], [0, 34, 20]] as const) {
        fillOutlined(g, flame(cx + dx, top + 10, h, fw), KANAGAWA.surimiOrange);
        g.fillStyle(KANAGAWA.carpYellow, 1).fillPoints(flame(cx + dx, top + 8, h * 0.55, fw * 0.5), true);
      }
      break;
    }
    case "vand": {
      // A crest of wave scales (seigaiha), like a little Great Wave on its head.
      for (const [dx, r] of [[-11, 12], [11, 12], [0, 15]] as const) {
        const x = cx + dx;
        const y = top + 8;
        g.fillStyle(KANAGAWA.waveBlue2, 1);
        g.beginPath();
        g.arc(x, y, r, Math.PI, 0, false);
        g.closePath();
        g.fillPath();
        g.lineStyle(2, KANAGAWA.fujiWhite, 1);
        for (const k of [0.72, 0.42]) {
          g.beginPath();
          g.arc(x, y, r * k, Math.PI, 0, false);
          g.strokePath();
        }
        g.lineStyle(LINE, INK, 1);
        g.beginPath();
        g.arc(x, y, r, Math.PI, 0, false);
        g.strokePath();
      }
      break;
    }
    case "graes": {
      // Two leaves sprouting from the head, with a centre vein, and a small bud.
      for (const side of [-1, 1]) {
        const pts = ellipsePoints(cx + side * 12, top - 6, 16, 7, side * -0.6);
        fillOutlined(g, pts, KANAGAWA.autumnGreen);
        g.lineStyle(1.5, KANAGAWA.winterGreen, 1).lineBetween(cx + side * 2, top + 2, cx + side * 22, top - 13);
      }
      g.fillStyle(KANAGAWA.sakuraPink, 1).fillCircle(cx, top - 2, 5);
      g.lineStyle(2, INK, 1).strokeCircle(cx, top - 2, 5);
      break;
    }
    case "lyn": {
      // Zigzag horns, like Raijin's.
      for (const side of [-1, 1]) {
        const x = cx + side * w * 0.22;
        const pts = [
          { x: x - 5, y: top + 8 },
          { x: x + side * 2, y: top - 8 },
          { x: x - side * 5, y: top - 8 },
          { x: x + side * 4, y: top - 26 },
          { x: x + side * 2, y: top - 12 },
          { x: x + side * 9, y: top - 12 },
          { x: x + 5, y: top + 8 },
        ];
        fillOutlined(g, pts, KANAGAWA.carpYellow);
      }
      break;
    }
    case "sten": {
      // A rocky cap of plates, with cracks.
      const cap = [
        { x: cx - w * 0.36, y: top + 12 },
        { x: cx - w * 0.3, y: top - 6 },
        { x: cx - w * 0.08, y: top - 14 },
        { x: cx + w * 0.16, y: top - 12 },
        { x: cx + w * 0.34, y: top - 2 },
        { x: cx + w * 0.38, y: top + 12 },
      ];
      fillOutlined(g, cap, KANAGAWA.katanaGray);
      g.lineStyle(2, INK, 0.8);
      g.lineBetween(cx - w * 0.08, top - 14, cx - w * 0.04, top + 4);
      g.lineBetween(cx + w * 0.16, top - 12, cx + w * 0.2, top + 2);
      g.fillStyle(KANAGAWA.autumnGreen, 0.9).fillCircle(cx - w * 0.2, top - 4, 3).fillCircle(cx + w * 0.26, top + 2, 2.5); // moss
      break;
    }
  }
}

function drawWings(g: Phaser.GameObjects.Graphics, cx: number, cy: number, colour: number): void {
  const wing = shade(colour, -30);
  for (const side of [-1, 1]) {
    const pts = [
      { x: cx + side * 18, y: cy - 8 },
      { x: cx + side * 60, y: cy - 40 },
      { x: cx + side * 54, y: cy - 16 },
      { x: cx + side * 60, y: cy + 4 },
      { x: cx + side * 44, y: cy + 14 },
    ];
    fillOutlined(g, pts, wing);
  }
}

function drawDragonHorns(g: Phaser.GameObjects.Graphics, cx: number, top: number, w: number): void {
  for (const side of [-1, 1]) {
    const x = cx + side * w * 0.22;
    const pts = [
      { x: x - 7, y: top + 10 },
      { x: x + side * 4, y: top - 22 },
      { x: x + 7, y: top + 10 },
    ];
    fillOutlined(g, pts, KANAGAWA.oldWhite);
  }
}
