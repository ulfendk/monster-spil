import Phaser from "phaser";
import { KANAGAWA } from "../ui/theme";

/**
 * Every icon in the game, drawn in code in the same woodblock style as the monsters:
 * bold ink outlines and Kanagawa colours (no emoji, no image files). Each is baked
 * once into a 128px texture `icon-<name>`; show them with `addIcon` or inline in text
 * with `[[name]]` (see ui/rich-text.ts). Where a Japanese object fits, it is used:
 * a temari ball for catching, a shoji door, a furoshiki bundle for the bag.
 */
const S = 128;
const K = KANAGAWA;
const INK = K.sumiInk0;
const LINE = 7;

type G = Phaser.GameObjects.Graphics;
type P = { x: number; y: number };

// ------------------------------------------------------------ drawing helpers

const outline = (g: G, w = LINE) => g.lineStyle(w, INK, 1);
function shape(g: G, pts: P[], fill: number, w = LINE): void {
  g.fillStyle(fill, 1).fillPoints(pts, true);
  outline(g, w).strokePoints(pts, true);
}
function circle(g: G, x: number, y: number, r: number, fill: number, w = LINE): void {
  g.fillStyle(fill, 1).fillCircle(x, y, r);
  if (w > 0) outline(g, w).strokeCircle(x, y, r);
}
function ellipse(g: G, x: number, y: number, rw: number, rh: number, fill: number, w = LINE): void {
  g.fillStyle(fill, 1).fillEllipse(x, y, rw, rh);
  if (w > 0) outline(g, w).strokeEllipse(x, y, rw, rh);
}
function rrect(g: G, x: number, y: number, w: number, h: number, r: number, fill: number, lw = LINE): void {
  g.fillStyle(fill, 1).fillRoundedRect(x, y, w, h, r);
  if (lw > 0) outline(g, lw).strokeRoundedRect(x, y, w, h, r);
}
function line(g: G, x1: number, y1: number, x2: number, y2: number, colour: number, w: number): void {
  g.lineStyle(w, colour, 1).lineBetween(x1, y1, x2, y2);
  g.fillStyle(colour, 1).fillCircle(x1, y1, w / 2).fillCircle(x2, y2, w / 2); // round caps
}
/** A thick line with an ink edge: ink first, then the colour on top. */
function stroke(g: G, x1: number, y1: number, x2: number, y2: number, colour: number, w: number): void {
  line(g, x1, y1, x2, y2, INK, w + LINE);
  line(g, x1, y1, x2, y2, colour, w);
}
function arcLine(g: G, x: number, y: number, r: number, a0: number, a1: number, colour: number, w: number): void {
  g.lineStyle(w, colour, 1);
  g.beginPath();
  g.arc(x, y, r, a0, a1, false);
  g.strokePath();
}
function star(cx: number, cy: number, outer: number, inner: number, points = 5, rot = -Math.PI / 2): P[] {
  const pts: P[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i * Math.PI) / points;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}
function flame(cx: number, baseY: number, h: number, w: number): P[] {
  return [
    { x: cx, y: baseY - h },
    { x: cx + w * 0.32, y: baseY - h * 0.55 },
    { x: cx + w * 0.5, y: baseY - h * 0.2 },
    { x: cx + w * 0.36, y: baseY },
    { x: cx - w * 0.36, y: baseY },
    { x: cx - w * 0.5, y: baseY - h * 0.2 },
    { x: cx - w * 0.32, y: baseY - h * 0.55 },
  ];
}
/** Kawaii face features on a head at (cx, cy). */
function faceEyes(g: G, cx: number, cy: number, gap = 18): void {
  g.fillStyle(INK, 1).fillEllipse(cx - gap, cy, 12, 16).fillEllipse(cx + gap, cy, 12, 16);
  g.fillStyle(K.washi, 1).fillCircle(cx - gap + 2, cy - 4, 3).fillCircle(cx + gap + 2, cy - 4, 3);
}

// ------------------------------------------------------------ the icons

const ART: Record<string, (g: G) => void> = {
  // --- the five types
  fire: (g) => {
    shape(g, flame(64, 116, 100, 84), K.peachRed);
    g.fillStyle(K.surimiOrange, 1).fillPoints(flame(64, 110, 66, 54), true);
    g.fillStyle(K.carpYellow, 1).fillPoints(flame(64, 106, 36, 30), true);
  },
  water: (g) => {
    // a drop: the tip at the top, a round belly below (screen angles: 90° is straight down)
    const pts: P[] = [{ x: 64, y: 8 }];
    for (let i = 0; i <= 24; i++) {
      const a = ((-25 + (i / 24) * 230) * Math.PI) / 180;
      pts.push({ x: 64 + Math.cos(a) * 42, y: 80 + Math.sin(a) * 42 });
    }
    shape(g, pts, K.crystalBlue);
    ellipse(g, 48, 84, 12, 24, K.washi, 0);
  },
  leaf: (g) => {
    const pts: P[] = [];
    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * Math.PI * 2;
      const x = Math.cos(t) * 50;
      const y = Math.sin(t) * 26 * (1 - 0.35 * Math.cos(t));
      const a = -Math.PI / 4;
      pts.push({ x: 64 + x * Math.cos(a) - y * Math.sin(a), y: 64 + x * Math.sin(a) + y * Math.cos(a) });
    }
    shape(g, pts, K.springGreen);
    line(g, 30, 98, 96, 32, K.autumnGreen, 5);
    line(g, 18, 110, 34, 94, K.boatYellow1, 7);
  },
  bolt: (g) => shape(g, [{ x: 78, y: 6 }, { x: 30, y: 72 }, { x: 60, y: 72 }, { x: 46, y: 122 }, { x: 98, y: 50 }, { x: 68, y: 50 }], K.carpYellow),
  stone: (g) => {
    shape(g, [{ x: 20, y: 96 }, { x: 16, y: 64 }, { x: 38, y: 32 }, { x: 78, y: 22 }, { x: 108, y: 48 }, { x: 112, y: 90 }, { x: 88, y: 108 }, { x: 40, y: 110 }], K.boatYellow1);
    g.fillStyle(K.boatYellow2, 1).fillPoints([{ x: 40, y: 40 }, { x: 76, y: 32 }, { x: 94, y: 50 }, { x: 60, y: 56 }], true);
    line(g, 64, 60, 72, 84, INK, 5);
    line(g, 72, 84, 62, 100, INK, 5);
  },

  // --- battle actions and results
  run: (g) => {
    // a runner: head, leaning body, one arm and leg forward, one back
    circle(g, 78, 22, 14, K.fujiWhite);
    stroke(g, 72, 40, 56, 76, K.fujiWhite, 12); // body
    stroke(g, 68, 48, 92, 58, K.fujiWhite, 9); // front arm
    stroke(g, 66, 48, 44, 60, K.fujiWhite, 9); // back arm
    stroke(g, 56, 76, 80, 100, K.fujiWhite, 10);
    stroke(g, 80, 100, 72, 118, K.fujiWhite, 10);
    stroke(g, 56, 76, 36, 96, K.fujiWhite, 10);
    stroke(g, 36, 96, 16, 94, K.fujiWhite, 10);
    for (const y of [36, 60, 84]) line(g, 8, y, 28, y, K.springBlue, 5); // speed lines
  },
  ball: (g) => {
    // a temari: the embroidered thread ball
    circle(g, 64, 64, 54, K.waveRed);
    g.lineStyle(6, K.washi, 1);
    g.strokePoints([{ x: 64, y: 12 }, { x: 116, y: 64 }, { x: 64, y: 116 }, { x: 12, y: 64 }], true);
    g.lineStyle(4, K.carpYellow, 1);
    g.strokePoints([{ x: 64, y: 30 }, { x: 98, y: 64 }, { x: 64, y: 98 }, { x: 30, y: 64 }], true);
    g.lineBetween(64, 12, 64, 116).lineBetween(12, 64, 116, 64);
    outline(g).strokeCircle(64, 64, 54);
  },
  hit: (g) => {
    shape(g, star(64, 64, 60, 30, 8), K.surimiOrange);
    g.fillStyle(K.carpYellow, 1).fillPoints(star(64, 64, 34, 18, 8), true);
  },
  miss: (g) => {
    for (const [y, r, x] of [[44, 26, 56], [72, 32, 64], [98, 20, 50]] as const) {
      arcLine(g, x, y, r, Math.PI * 1.1, Math.PI * 1.95, INK, 13);
      arcLine(g, x, y, r, Math.PI * 1.1, Math.PI * 1.95, K.springBlue, 6);
      line(g, x - r * 0.95 - 30, y + r * 0.3, x - r * 0.95, y + r * 0.3, K.springBlue, 5);
    }
  },
  faint: (g) => {
    circle(g, 64, 68, 50, K.oldWhite);
    for (const side of [-1, 1]) {
      const x = 64 + side * 20;
      line(g, x - 9, 52, x + 9, 68, INK, 6);
      line(g, x + 9, 52, x - 9, 68, INK, 6);
    }
    arcLine(g, 64, 98, 10, Math.PI * 1.15, Math.PI * 1.85, INK, 5);
    g.fillStyle(K.springBlue, 1).fillCircle(98, 22, 7).fillCircle(112, 10, 4); // dizzy
  },
  cheer: (g) => {
    for (const [x, y, r, c] of [[64, 64, 30, K.carpYellow], [24, 30, 14, K.sakuraPink], [104, 28, 12, K.springBlue], [100, 100, 14, K.springGreen], [26, 100, 10, K.surimiOrange]] as const) {
      shape(g, star(x, y, r, r * 0.45, 4, 0), c, 5);
    }
    for (const [x, y, c] of [[48, 18, K.waveRed], [84, 110, K.oniViolet], [16, 64, K.crystalBlue], [112, 64, K.peachRed]] as const) g.fillStyle(c, 1).fillCircle(x, y, 5);
  },
  angry: (g) => {
    circle(g, 60, 70, 48, K.peachRed);
    line(g, 32, 50, 50, 58, INK, 6);
    line(g, 88, 50, 70, 58, INK, 6);
    g.fillStyle(INK, 1).fillCircle(44, 66, 6).fillCircle(76, 66, 6);
    arcLine(g, 60, 104, 12, Math.PI * 1.2, Math.PI * 1.8, INK, 6);
    for (const [x, y] of [[106, 26], [118, 44]] as const) circle(g, x, y, 9, K.fujiWhite, 4); // steam
  },
  star: (g) => shape(g, star(64, 68, 58, 26), K.carpYellow),
  shield: (g) => {
    shape(g, [{ x: 64, y: 8 }, { x: 112, y: 26 }, { x: 106, y: 76 }, { x: 64, y: 120 }, { x: 22, y: 76 }, { x: 16, y: 26 }], K.crystalBlue);
    g.fillStyle(K.washi, 0.9).fillPoints([{ x: 64, y: 22 }, { x: 96, y: 34 }, { x: 92, y: 70 }, { x: 64, y: 102 }], true);
  },
  trophy: (g) => {
    for (const side of [-1, 1]) arcLine(g, 64 + side * 40, 44, 16, side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, side < 0 ? Math.PI * 1.5 : Math.PI * 0.5, INK, 12);
    shape(g, [{ x: 30, y: 14 }, { x: 98, y: 14 }, { x: 92, y: 60 }, { x: 72, y: 78 }, { x: 56, y: 78 }, { x: 36, y: 60 }], K.carpYellow);
    rrect(g, 54, 76, 20, 22, 2, K.boatYellow2);
    rrect(g, 34, 96, 60, 20, 5, K.boatYellow1);
    shape(g, star(64, 40, 14, 6), K.washi, 3);
  },
  door: (g) => {
    // a shoji: paper panes in a wooden grid, one panel slid open
    rrect(g, 18, 10, 92, 110, 4, K.boatYellow1);
    g.fillStyle(K.washi, 1).fillRect(26, 18, 40, 94);
    g.fillStyle(K.sumiInk4, 1).fillRect(70, 18, 32, 94);
    g.lineStyle(4, K.boatYellow1, 1);
    for (const y of [42, 66, 90]) g.lineBetween(26, y, 66, y);
    g.lineBetween(46, 18, 46, 112);
    outline(g, 5).strokeRect(26, 18, 40, 94);
  },
  hand: (g) => {
    rrect(g, 30, 58, 64, 58, 22, K.oldWhite);
    for (const [x, h] of [[38, 44], [56, 54], [74, 52], [92, 40]] as const) rrect(g, x - 8, 60 - h, 16, h + 12, 8, K.oldWhite);
    g.fillStyle(K.oldWhite, 1).fillRect(34, 56, 60, 14);
    rrect(g, 94, 70, 26, 14, 7, K.oldWhite);
  },
  hourglass: (g) => {
    rrect(g, 24, 8, 80, 14, 5, K.boatYellow1);
    rrect(g, 24, 106, 80, 14, 5, K.boatYellow1);
    shape(g, [{ x: 34, y: 22 }, { x: 94, y: 22 }, { x: 70, y: 64 }, { x: 94, y: 106 }, { x: 34, y: 106 }, { x: 58, y: 64 }], K.washi, 5);
    g.fillStyle(K.carpYellow, 1).fillPoints([{ x: 46, y: 34 }, { x: 82, y: 34 }, { x: 66, y: 58 }, { x: 62, y: 58 }], true);
    g.fillStyle(K.carpYellow, 1).fillTriangle(40, 102, 88, 102, 64, 80);
  },
  heart: (g) => {
    const pts: P[] = [];
    for (let i = 0; i < 40; i++) {
      const t = (i / 40) * Math.PI * 2;
      pts.push({ x: 64 + 3.3 * 16 * Math.sin(t) ** 3, y: 60 - 3.1 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) });
    }
    shape(g, pts, K.waveRed);
    ellipse(g, 42, 40, 14, 18, K.sakuraPink, 0);
  },
  sword: (g) => {
    // two crossed katana
    for (const side of [-1, 1]) {
      const x1 = 64 - side * 50;
      const x2 = 64 + side * 40;
      stroke(g, x1, 118, x2, 12, K.fujiWhite, 9); // blade
      stroke(g, x1, 118, 64 - side * 30, 92, INK, 12); // handle
      line(g, 64 - side * 38, 104, 64 - side * 22, 104, K.carpYellow, 8); // tsuba (guard)
    }
  },
  sound: (g) => {
    shape(g, [{ x: 12, y: 46 }, { x: 36, y: 46 }, { x: 64, y: 18 }, { x: 64, y: 110 }, { x: 36, y: 82 }, { x: 12, y: 82 }], K.oldWhite);
    for (const r of [22, 40]) {
      arcLine(g, 66, 64, r, -Math.PI * 0.3, Math.PI * 0.3, INK, 12);
      arcLine(g, 66, 64, r, -Math.PI * 0.3, Math.PI * 0.3, K.springBlue, 6);
    }
  },
  steps: (g) => {
    for (const [x, y] of [[44, 82], [84, 42]] as const) {
      ellipse(g, x, y, 26, 40, K.oldWhite, 5);
      for (const [dx, dy, r] of [[-12, -26, 5], [-4, -30, 5.5], [5, -29, 5], [12, -24, 4.5]] as const) circle(g, x + dx, y + dy, r, K.oldWhite, 3);
    }
  },
  sleep: (g) => {
    const z = (x: number, y: number, s: number) => {
      const pts = [
        { x, y },
        { x: x + s, y },
        { x, y: y + s },
        { x: x + s, y: y + s },
      ];
      for (let i = 0; i < 3; i++) stroke(g, pts[i]!.x, pts[i]!.y, pts[i + 1]!.x, pts[i + 1]!.y, K.springBlue, s * 0.18);
    };
    z(14, 70, 40);
    z(66, 42, 28);
    z(98, 14, 20);
  },
  dragon: (g) => {
    for (const side of [-1, 1]) shape(g, [{ x: 64 + side * 20, y: 50 }, { x: 64 + side * 58, y: 20 }, { x: 64 + side * 50, y: 72 }], K.autumnRed);
    for (const side of [-1, 1]) shape(g, [{ x: 64 + side * 8, y: 40 }, { x: 64 + side * 20, y: 8 }, { x: 64 + side * 30, y: 42 }], K.oldWhite, 5);
    ellipse(g, 64, 72, 78, 70, K.peachRed);
    for (const side of [-1, 1]) {
      ellipse(g, 64 + side * 16, 64, 16, 18, K.carpYellow, 0);
      g.fillStyle(INK, 1).fillEllipse(64 + side * 16, 64, 5, 14);
    }
    g.fillStyle(K.washi, 1).fillTriangle(54, 88, 62, 88, 58, 98).fillTriangle(66, 88, 74, 88, 70, 98);
  },
  serpent: (g) => {
    // A coil in the sand, and a hooded head rising from it.
    ellipse(g, 64, 108, 108, 26, K.boatYellow2);
    ellipse(g, 64, 88, 80, 26, K.boatYellow1);
    shape(g, [{ x: 54, y: 84 }, { x: 56, y: 50 }, { x: 72, y: 50 }, { x: 74, y: 84 }], K.boatYellow1, 5);
    ellipse(g, 64, 40, 58, 44, K.autumnRed);
    ellipse(g, 64, 42, 34, 32, K.boatYellow1, 5);
    for (const side of [-1, 1]) {
      ellipse(g, 64 + side * 8, 40, 10, 12, K.carpYellow, 0);
      g.fillStyle(INK, 1).fillEllipse(64 + side * 8, 40, 3, 10);
    }
    stroke(g, 64, 58, 64, 66, K.autumnRed, 4);
  },
  eagle: (g) => {
    // Spread wings, a white head and a hooked beak.
    for (const side of [-1, 1]) {
      shape(g, [{ x: 64 + side * 14, y: 56 }, { x: 64 + side * 60, y: 30 }, { x: 64 + side * 58, y: 50 }, { x: 64 + side * 50, y: 62 }, { x: 64 + side * 42, y: 76 }, { x: 64 + side * 16, y: 84 }], K.sumiInk6);
    }
    ellipse(g, 64, 80, 40, 58, K.boatYellow2);
    ellipse(g, 64, 42, 38, 34, K.fujiWhite);
    shape(g, [{ x: 58, y: 48 }, { x: 72, y: 48 }, { x: 68, y: 66 }, { x: 62, y: 58 }], K.carpYellow, 5);
    for (const side of [-1, 1]) {
      g.fillStyle(INK, 1).fillCircle(64 + side * 9, 38, 4);
      stroke(g, 64 + side * 3, 30, 64 + side * 16, 27, INK, 5);
    }
  },
  team: (g) => {
    for (const [x, c] of [[44, K.oniViolet], [84, K.crystalBlue]] as const) {
      g.fillStyle(c, 1).fillRoundedRect(x - 30, 70, 60, 50, { tl: 28, tr: 28, bl: 4, br: 4 });
      outline(g).strokeRoundedRect(x - 30, 70, 60, 50, { tl: 28, tr: 28, bl: 4, br: 4 });
      circle(g, x, 44, 22, c);
    }
  },
  trade: (g) => {
    // two arrows swapping places
    for (const [y, dir, c] of [[40, 1, K.springGreen], [88, -1, K.carpYellow]] as const) {
      const x0 = dir > 0 ? 14 : 114;
      const x1 = dir > 0 ? 96 : 32;
      stroke(g, x0, y, x1, y, c, 12);
      shape(g, [{ x: x1 + dir * 22, y }, { x: x1 - dir * 4, y: y - 20 }, { x: x1 - dir * 4, y: y + 20 }], c, 5);
    }
  },
  map: (g) => {
    const panels = [[10, 20, 36], [46, 12, 36], [82, 20, 36]] as const;
    panels.forEach(([x, y, w], i) => shape(g, [{ x, y }, { x: x + w, y: i === 1 ? y + 8 : y - 8 }, { x: x + w, y: (i === 1 ? y + 8 : y - 8) + 96 }, { x, y: y + 96 }], i === 1 ? K.oldWhite : K.washi, 5));
    g.fillStyle(K.springGreen, 1).fillCircle(34, 62, 12);
    g.fillStyle(K.crystalBlue, 1).fillEllipse(96, 80, 22, 14);
    g.lineStyle(4, K.autumnRed, 1);
    g.beginPath();
    g.moveTo(24, 96);
    g.lineTo(52, 74);
    g.lineTo(70, 90);
    g.lineTo(100, 48);
    g.strokePath();
    g.fillStyle(K.autumnRed, 1).fillCircle(100, 48, 6);
  },
  book: (g) => {
    shape(g, [{ x: 8, y: 26 }, { x: 60, y: 22 }, { x: 64, y: 30 }, { x: 68, y: 22 }, { x: 120, y: 26 }, { x: 120, y: 108 }, { x: 68, y: 104 }, { x: 64, y: 112 }, { x: 60, y: 104 }, { x: 8, y: 108 }], K.autumnRed);
    shape(g, [{ x: 16, y: 30 }, { x: 60, y: 28 }, { x: 64, y: 34 }, { x: 64, y: 102 }, { x: 60, y: 98 }, { x: 16, y: 100 }], K.washi, 4);
    shape(g, [{ x: 112, y: 30 }, { x: 68, y: 28 }, { x: 64, y: 34 }, { x: 64, y: 102 }, { x: 68, y: 98 }, { x: 112, y: 100 }], K.washi, 4);
    g.lineStyle(3, K.fujiGray, 1);
    for (const y of [46, 60, 74, 88]) g.lineBetween(24, y, 54, y).lineBetween(74, y, 104, y);
  },
  gear: (g) => {
    shape(g, star(64, 64, 58, 44, 8, 0), K.katanaGray);
    circle(g, 64, 64, 18, K.sumiInk4);
  },
  key: (g) => {
    circle(g, 38, 46, 28, K.carpYellow);
    circle(g, 38, 46, 10, K.sumiInk4, 5);
    stroke(g, 58, 66, 110, 118, K.carpYellow, 12);
    stroke(g, 86, 94, 100, 80, K.carpYellow, 10);
    stroke(g, 98, 106, 112, 92, K.carpYellow, 10);
  },
  offline: (g) => {
    for (const r of [52, 36, 20]) {
      arcLine(g, 64, 100, r, Math.PI * 1.2, Math.PI * 1.8, INK, 13);
      arcLine(g, 64, 100, r, Math.PI * 1.2, Math.PI * 1.8, K.fujiGray, 6);
    }
    circle(g, 64, 100, 7, K.fujiGray, 4);
    stroke(g, 20, 20, 108, 112, K.autumnRed, 10);
  },
  online: (g) => {
    circle(g, 64, 64, 46, K.springGreen);
    ellipse(g, 50, 48, 22, 14, K.washi, 0);
  },
  save: (g) => {
    // saved on the server: a cloud with a tick
    const puffs = [[40, 72, 26], [64, 56, 32], [90, 70, 24]] as const;
    for (const [x, y, r] of puffs) g.fillStyle(INK, 1).fillCircle(x, y, r + LINE / 2);
    g.fillStyle(INK, 1).fillRoundedRect(14 - LINE / 2, 70 - LINE / 2, 100 + LINE, 30 + LINE, 15);
    for (const [x, y, r] of puffs) g.fillStyle(K.springBlue, 1).fillCircle(x, y, r);
    g.fillStyle(K.springBlue, 1).fillRoundedRect(14, 70, 100, 30, 15);
    line(g, 46, 76, 60, 90, K.washi, 8);
    line(g, 60, 90, 86, 62, K.washi, 8);
  },
  sparkle: (g) => {
    for (const [x, y, r] of [[56, 66, 42], [100, 26, 18], [104, 98, 14]] as const) shape(g, star(x, y, r, r * 0.3, 4, 0), K.carpYellow, 5);
  },
  refresh: (g) => {
    for (const [a0, a1, c] of [[Math.PI * 1.05, Math.PI * 1.75, K.crystalBlue], [Math.PI * 0.05, Math.PI * 0.75, K.springBlue]] as const) {
      arcLine(g, 64, 64, 42, a0, a1, INK, 18);
      arcLine(g, 64, 64, 42, a0, a1, c, 10);
      const tip = { x: 64 + Math.cos(a1) * 42, y: 64 + Math.sin(a1) * 42 };
      const dir = a1 + Math.PI / 2;
      shape(g, [
        { x: tip.x + Math.cos(dir) * 18, y: tip.y + Math.sin(dir) * 18 },
        { x: tip.x + Math.cos(a1) * 14, y: tip.y + Math.sin(a1) * 14 },
        { x: tip.x - Math.cos(a1) * 14, y: tip.y - Math.sin(a1) * 14 },
      ], c, 5);
    }
  },
  paw: (g) => {
    ellipse(g, 64, 82, 52, 42, K.boatYellow2);
    for (const [x, y] of [[30, 48], [52, 30], [76, 30], [98, 48]] as const) ellipse(g, x, y, 20, 24, K.boatYellow2, 5);
  },
  bag: (g) => {
    // a furoshiki: goods wrapped in a knotted cloth
    ellipse(g, 64, 80, 104, 70, K.waveBlue2);
    g.lineStyle(3, K.fujiWhite, 0.8);
    for (const [x, y] of [[40, 82], [64, 90], [88, 82], [52, 100], [78, 100]] as const) {
      g.beginPath();
      g.arc(x, y, 8, Math.PI, 0, false);
      g.strokePath();
    }
    // the knot on top: two short cloth ends and the tie
    for (const side of [-1, 1]) ellipse(g, 64 + side * 16, 38, 22, 30, K.waveBlue2, 5);
    circle(g, 64, 50, 11, K.waveBlue2, 5);
  },
  medal1: (g) => medal(g, K.carpYellow, "1"),
  medal2: (g) => medal(g, K.oldWhite, "2"),
  medal3: (g) => medal(g, K.boatYellow1, "3"),
  arrow: (g) => shape(g, [{ x: 10, y: 50 }, { x: 70, y: 50 }, { x: 70, y: 22 }, { x: 118, y: 64 }, { x: 70, y: 106 }, { x: 70, y: 78 }, { x: 10, y: 78 }], K.carpYellow),
  pin: (g) => {
    const pts: P[] = [{ x: 64, y: 122 }];
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI * (1.2 - (i / 24) * 1.4);
      pts.push({ x: 64 + Math.cos(a) * 38, y: 48 - Math.sin(a) * 38 });
    }
    shape(g, pts, K.autumnRed);
    circle(g, 64, 48, 14, K.washi, 5);
  },

  // --- food
  apple: (g) => {
    circle(g, 64, 72, 46, K.waveRed);
    line(g, 64, 30, 70, 10, K.boatYellow1, 7);
    ellipse(g, 86, 20, 30, 14, K.springGreen, 5);
    ellipse(g, 46, 56, 14, 20, K.sakuraPink, 0);
  },
  strawberry: (g) => {
    const pts: P[] = [];
    for (let i = 0; i <= 20; i++) {
      const a = Math.PI * (i / 20);
      pts.push({ x: 64 + Math.cos(a) * 46, y: 44 + Math.sin(a) * 76 * (0.6 + 0.4 * Math.sin(a)) });
    }
    shape(g, pts, K.peachRed);
    g.fillStyle(K.carpYellow, 1);
    for (const [x, y] of [[48, 62], [72, 58], [60, 80], [84, 78], [44, 88], [66, 100]] as const) g.fillEllipse(x, y, 5, 8);
    shape(g, star(64, 38, 30, 12, 5, Math.PI / 2), K.autumnGreen, 5);
  },
  banana: (g) => {
    const pts: P[] = [];
    for (let i = 0; i <= 20; i++) {
      const a = Math.PI * (0.15 + (i / 20) * 0.7);
      pts.push({ x: 64 - Math.cos(a) * 56, y: 12 + Math.sin(a) * 90 });
    }
    for (let i = 20; i >= 0; i--) {
      const a = Math.PI * (0.15 + (i / 20) * 0.7);
      pts.push({ x: 64 - Math.cos(a) * 38, y: 12 + Math.sin(a) * 64 });
    }
    shape(g, pts, K.carpYellow);
    line(g, 18, 32, 12, 22, K.boatYellow1, 7);
  },
  carrot: (g) => {
    shape(g, [{ x: 30, y: 34 }, { x: 70, y: 38 }, { x: 22, y: 118 }], K.surimiOrange);
    g.lineStyle(4, INK, 0.7).lineBetween(40, 60, 54, 62).lineBetween(32, 82, 42, 84);
    for (const [x, y] of [[52, 12], [72, 16], [86, 32]] as const) ellipse(g, x, y, 16, 30, K.springGreen, 5);
  },
  grapes: (g) => {
    for (const [x, y] of [[40, 42], [64, 40], [88, 42], [52, 64], [76, 64], [64, 88], [40, 66], [88, 66], [64, 110]] as const) circle(g, x, y, 15, K.oniViolet, 5);
    line(g, 64, 26, 70, 6, K.boatYellow1, 7);
    ellipse(g, 90, 14, 28, 14, K.springGreen, 5);
  },
  plus: (g) => {
    circle(g, 64, 64, 54, K.springGreen);
    stroke(g, 64, 34, 64, 94, K.washi, 14);
    stroke(g, 34, 64, 94, 64, K.washi, 14);
  },
  trash: (g) => {
    // a lidded bin
    shape(g, [{ x: 30, y: 40 }, { x: 98, y: 40 }, { x: 90, y: 118 }, { x: 38, y: 118 }], K.fujiGray);
    for (const x of [52, 64, 76]) line(g, x, 54, x, 104, K.sumiInk4, 5);
    rrect(g, 20, 24, 88, 16, 6, K.katanaGray);
    rrect(g, 50, 10, 28, 14, 5, K.katanaGray, 5);
  },
  person: (g) => {
    // one player on their own
    g.fillStyle(K.springBlue, 1).fillRoundedRect(34, 70, 60, 50, { tl: 28, tr: 28, bl: 4, br: 4 });
    outline(g).strokeRoundedRect(34, 70, 60, 50, { tl: 28, tr: 28, bl: 4, br: 4 });
    circle(g, 64, 42, 24, K.springBlue);
  },
  meteor: (g) => {
    // a burning rock streaking down from the top right
    for (const [w, c] of [[30, K.autumnRed], [20, K.surimiOrange], [10, K.carpYellow]] as const) stroke(g, 112, 16, 60, 68, c, w);
    circle(g, 50, 78, 30, K.katanaGray);
    for (const [x, y, r] of [[40, 70, 7], [60, 88, 5], [56, 66, 4]] as const) circle(g, x, y, r, K.sumiInk4, 4);
  },
  quake: (g) => {
    // cracked ground with shake lines
    shape(g, [{ x: 8, y: 70 }, { x: 120, y: 70 }, { x: 120, y: 118 }, { x: 8, y: 118 }], K.boatYellow1);
    shape(g, [{ x: 50, y: 70 }, { x: 66, y: 86 }, { x: 56, y: 96 }, { x: 72, y: 118 }, { x: 60, y: 118 }, { x: 44, y: 98 }, { x: 54, y: 88 }, { x: 40, y: 70 }], INK, 3);
    for (const [x, y] of [[26, 20], [64, 12], [102, 20]] as const) {
      line(g, x - 12, y + 18, x, y + 30, K.fujiWhite, 7);
      line(g, x, y + 30, x + 12, y + 18, K.fujiWhite, 7);
    }
  },
  flood: (g) => {
    // a house up to its windows in water
    shape(g, [{ x: 30, y: 60 }, { x: 64, y: 26 }, { x: 98, y: 60 }], K.autumnRed);
    rrect(g, 38, 58, 52, 40, 3, K.oldWhite);
    rrect(g, 56, 66, 16, 16, 2, K.crystalBlue, 4);
    g.fillStyle(K.waveBlue2, 1).fillRect(4, 84, 120, 40);
    for (const x of [14, 46, 78, 110]) arcLine(g, x, 90, 14, Math.PI * 1.05, Math.PI * 1.95, K.springBlue, 7);
    outline(g, 5).lineBetween(4, 84, 124, 84);
  },
  storm: (g) => {
    // a hurricane spiral with wind streaks
    for (const [r, c] of [[46, K.springBlue], [32, K.crystalBlue], [18, K.fujiWhite]] as const) {
      arcLine(g, 64, 64, r, Math.PI * 0.1, Math.PI * 1.4, INK, 16);
      arcLine(g, 64, 64, r, Math.PI * 0.1, Math.PI * 1.4, c, 9);
    }
    circle(g, 64, 64, 8, K.fujiWhite, 4);
  },
  ufo: (g) => {
    // a flying saucer with a green light beam
    shape(g, [{ x: 52, y: 70 }, { x: 76, y: 70 }, { x: 100, y: 122 }, { x: 28, y: 122 }], K.springGreen, 0);
    g.fillStyle(K.winterGreen, 0.35).fillTriangle(52, 70, 76, 70, 64, 122);
    ellipse(g, 64, 42, 44, 36, K.springBlue);
    ellipse(g, 64, 62, 116, 32, K.oldWhite);
    for (const x of [28, 64, 100]) circle(g, x, 64, 6, x === 64 ? K.springGreen : K.autumnRed, 4);
  },
  games: (g) => {
    // a stack of worlds: three cards fanned out, each with its own little landscape
    const cards = [[-16, K.oniViolet, -0.18], [0, K.crystalBlue, 0], [16, K.springGreen, 0.18]] as const;
    for (const [dx, c, a] of cards) {
      const cx = 64 + dx;
      const pts = [[-26, -40], [26, -40], [26, 40], [-26, 40]].map(([x, y]) => ({
        x: cx + x * Math.cos(a) - y * Math.sin(a),
        y: 66 + x * Math.sin(a) + y * Math.cos(a),
      }));
      shape(g, pts, K.washi, 5);
      g.fillStyle(c, 1).fillCircle(cx + 2 * Math.sin(a) * -1, 72, 14);
    }
  },
};

function medal(g: G, colour: number, n: string): void {
  shape(g, [{ x: 36, y: 6 }, { x: 60, y: 6 }, { x: 72, y: 50 }, { x: 52, y: 58 }], K.autumnRed, 5);
  shape(g, [{ x: 92, y: 6 }, { x: 68, y: 6 }, { x: 56, y: 50 }, { x: 76, y: 58 }], K.crystalBlue, 5);
  circle(g, 64, 84, 36, colour);
  circle(g, 64, 84, 24, colour, 3);
  void n; // the rank is shown by colour and position; no text baked into textures
}

export type IconName = keyof typeof ART;
export const ICON_NAMES = Object.keys(ART) as IconName[];

export const iconKey = (name: string): string => `icon-${name}`;

/** Bakes every icon once. Call at boot (PreloadScene). */
export function generateIcons(scene: Phaser.Scene): void {
  for (const [name, draw] of Object.entries(ART)) {
    const key = iconKey(name);
    if (scene.textures.exists(key)) continue;
    const g = scene.add.graphics();
    draw(g);
    g.generateTexture(key, S, S);
    g.destroy();
  }
}

/** One icon, `size` pixels across. */
export function addIcon(scene: Phaser.Scene, x: number, y: number, name: string, size: number): Phaser.GameObjects.Image {
  return scene.add.image(x, y, iconKey(name)).setScale(size / S);
}
