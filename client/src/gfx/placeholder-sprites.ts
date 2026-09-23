import Phaser from "phaser";
import type { CreatureSpecies, TypeId } from "@shared";

const TYPE_COLOURS: Record<TypeId, number> = {
  ild: 0xff6b35,
  vand: 0x4cc9f0,
  graes: 0x6bbf59,
  lyn: 0xffce54,
  sten: 0x9c8064,
};

const SPRITE_SIZE = 128;

/**
 * No creature art exists yet, so this bakes a simple original placeholder
 * (a coloured blob + a type-coded accent shape) into a texture keyed to
 * species.spriteFront/spriteBack. Dropping a real drawing in at that same
 * texture key later requires no code change — only deleting this module.
 */
export function generatePlaceholderSprites(scene: Phaser.Scene, species: CreatureSpecies[]): void {
  for (const s of species) {
    if (!scene.textures.exists(s.spriteFront)) {
      drawCreature(scene, s, s.spriteFront, false);
    }
    if (!scene.textures.exists(s.spriteBack)) {
      drawCreature(scene, s, s.spriteBack, true);
    }
  }
}

function drawCreature(scene: Phaser.Scene, species: CreatureSpecies, key: string, isBack: boolean): void {
  const g = scene.add.graphics();
  const bodyColor = TYPE_COLOURS[species.type];
  const cx = SPRITE_SIZE / 2;
  const cy = SPRITE_SIZE / 2 + 8;

  g.fillStyle(bodyColor, 1);
  g.fillEllipse(cx, cy, SPRITE_SIZE * 0.7, SPRITE_SIZE * 0.6);

  if (!isBack) {
    g.fillStyle(0x1b1f3b, 1);
    g.fillCircle(cx - 18, cy - 8, 8);
    g.fillCircle(cx + 18, cy - 8, 8);
  }

  drawTypeAccent(g, species.type, cx, cy - 48);

  g.generateTexture(key, SPRITE_SIZE, SPRITE_SIZE);
  g.destroy();
}

function drawTypeAccent(g: Phaser.GameObjects.Graphics, type: TypeId, x: number, y: number): void {
  g.fillStyle(0xffffff, 0.9);
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
