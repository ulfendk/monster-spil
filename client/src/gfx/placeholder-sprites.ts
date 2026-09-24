import Phaser from "phaser";
import type { CreatureSpecies, TypeId } from "@shared";
import { C, KANAGAWA } from "../ui/theme";

/** One Kanagawa colour per type — for the creatures, their moves' buttons and badges. */
export const TYPE_COLOURS: Record<TypeId, number> = {
  ild: KANAGAWA.peachRed,
  vand: KANAGAWA.crystalBlue,
  graes: KANAGAWA.springGreen,
  lyn: KANAGAWA.carpYellow,
  sten: KANAGAWA.boatYellow1,
};

const SPRITE_SIZE = 128;

/**
 * No creature art exists yet, so this bakes a simple original placeholder
 * (a coloured blob + a type-coded accent shape) into a texture keyed to
 * species.spriteFront/spriteBack. Dropping a real drawing in at that same
 * texture key later requires no code change — only deleting this module.
 */
/** `dragonIds`: species drawn with wings and horns (the raid bosses and the babies they give), so they don't look like ordinary monsters. */
export function generatePlaceholderSprites(scene: Phaser.Scene, species: CreatureSpecies[], dragonIds: ReadonlySet<string> = new Set()): void {
  for (const s of species) {
    const dragon = dragonIds.has(s.id);
    if (!scene.textures.exists(s.spriteFront)) {
      drawCreature(scene, s, s.spriteFront, false, dragon);
    }
    if (!scene.textures.exists(s.spriteBack)) {
      drawCreature(scene, s, s.spriteBack, true, dragon);
    }
  }
}

function drawCreature(scene: Phaser.Scene, species: CreatureSpecies, key: string, isBack: boolean, dragon: boolean): void {
  const g = scene.add.graphics();
  const bodyColor = TYPE_COLOURS[species.type];
  const cx = SPRITE_SIZE / 2;
  const cy = SPRITE_SIZE / 2 + 8;

  if (dragon) {
    // Bat-like wings behind the body, in a darker shade, and two horns instead of the type accent.
    const wing = Phaser.Display.Color.IntegerToColor(bodyColor).darken(35).color;
    g.fillStyle(wing, 1);
    g.fillTriangle(cx - 20, cy - 10, cx - 62, cy - 42, cx - 50, cy + 18);
    g.fillTriangle(cx + 20, cy - 10, cx + 62, cy - 42, cx + 50, cy + 18);
    g.fillStyle(bodyColor, 1);
    g.fillEllipse(cx, cy, SPRITE_SIZE * 0.62, SPRITE_SIZE * 0.56);
    g.fillStyle(KANAGAWA.oldWhite, 1);
    g.fillTriangle(cx - 26, cy - 22, cx - 18, cy - 50, cx - 10, cy - 28);
    g.fillTriangle(cx + 26, cy - 22, cx + 18, cy - 50, cx + 10, cy - 28);
    if (!isBack) {
      g.fillStyle(KANAGAWA.carpYellow, 1);
      g.fillCircle(cx - 16, cy - 6, 8);
      g.fillCircle(cx + 16, cy - 6, 8);
      g.fillStyle(KANAGAWA.sumiInk0, 1);
      g.fillEllipse(cx - 16, cy - 6, 4, 12);
      g.fillEllipse(cx + 16, cy - 6, 4, 12);
      g.fillStyle(C.border, 1);
      g.fillTriangle(cx - 12, cy + 14, cx - 6, cy + 24, cx, cy + 14);
      g.fillTriangle(cx, cy + 14, cx + 6, cy + 24, cx + 12, cy + 14);
    }
    g.generateTexture(key, SPRITE_SIZE, SPRITE_SIZE);
    g.destroy();
    return;
  }

  g.fillStyle(bodyColor, 1);
  g.fillEllipse(cx, cy, SPRITE_SIZE * 0.7, SPRITE_SIZE * 0.6);

  if (!isBack) {
    g.fillStyle(KANAGAWA.sumiInk0, 1);
    g.fillCircle(cx - 18, cy - 8, 8);
    g.fillCircle(cx + 18, cy - 8, 8);
  }

  drawTypeAccent(g, species.type, cx, cy - 48);

  g.generateTexture(key, SPRITE_SIZE, SPRITE_SIZE);
  g.destroy();
}

function drawTypeAccent(g: Phaser.GameObjects.Graphics, type: TypeId, x: number, y: number): void {
  g.fillStyle(C.border, 0.9);
  switch (type) {
    case "ild":
      g.fillTriangle(x, y - 14, x - 14, y + 10, x + 14, y + 10);
      break;
    case "vand":
      g.fillCircle(x - 8, y, 10);
      g.fillCircle(x + 8, y, 10);
      break;
    case "graes":
      g.fillEllipse(x, y, 26, 13);
      break;
    case "lyn":
      g.fillPoints(
        [
          { x: x - 6, y: y - 14 },
          { x: x + 4, y: y - 2 },
          { x: x - 2, y: y - 2 },
          { x: x + 6, y: y + 14 },
          { x: x - 4, y: y + 2 },
          { x: x + 2, y: y + 2 },
        ],
        true
      );
      break;
    case "sten":
      drawRegularPolygon(g, x, y, 6, 14);
      break;
  }
}

function drawRegularPolygon(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  sides: number,
  radius: number
): void {
  const points: Phaser.Types.Math.Vector2Like[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
    points.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
  }
  g.fillPoints(points, true);
}
