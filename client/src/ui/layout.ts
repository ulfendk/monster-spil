import Phaser from "phaser";

/**
 * Screen geometry for one moment, so every scene can lay itself out for an iPad or an
 * iPhone, in portrait or landscape. Sizes in the scenes were designed for a ~1024×768
 * iPad; `s` scales them down on small screens, but touch targets never go below
 * MIN_TOUCH and text never below MIN_FONT.
 */
export interface Layout {
  width: number;
  height: number;
  portrait: boolean;
  /** A phone-sized screen (short side under 600px): use the compact arrangements. */
  compact: boolean;
  /** The area not covered by the notch, status bar or home indicator. */
  safe: { top: number; right: number; bottom: number; left: number };
  /** Size factor: 1 on an iPad, smaller on a phone. */
  s: number;
  /** A design size scaled by `s`. */
  px(n: number): number;
  /** A font size string scaled by `s`, never below MIN_FONT. */
  font(n: number): string;
  /** A touch target size scaled by `s`, never below MIN_TOUCH. */
  touch(n: number): number;
}

export const MIN_TOUCH = 64;
const MIN_FONT = 16;

let probe: HTMLDivElement | undefined;

/** Reads the iPhone safe-area insets (env(safe-area-inset-*)); all 0 on an iPad or desktop. */
function safeInsets(): Layout["safe"] {
  if (typeof document === "undefined") return { top: 0, right: 0, bottom: 0, left: 0 };
  if (!probe) {
    probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
    document.body.appendChild(probe);
  }
  const style = getComputedStyle(probe);
  const read = (v: string) => parseFloat(v) || 0;
  return { top: read(style.paddingTop), right: read(style.paddingRight), bottom: read(style.paddingBottom), left: read(style.paddingLeft) };
}

export function getLayout(scene: Phaser.Scene): Layout {
  const { width, height } = scene.scale;
  const short = Math.min(width, height);
  const s = Phaser.Math.Clamp(short / 740, 0.55, 1.25);
  return {
    width,
    height,
    portrait: height > width,
    compact: short < 600,
    safe: safeInsets(),
    s,
    px: (n) => Math.round(n * s),
    font: (n) => `${Math.max(MIN_FONT, Math.round(n * s))}px`,
    touch: (n) => Math.max(MIN_TOUCH, Math.round(n * s)),
  };
}

/**
 * Calls `relayout` after the screen size changes (rotating the device, resizing a
 * window), a moment after the last change so a rotation isn't laid out twice.
 * Unhooks itself when the scene shuts down.
 */
export function onRelayout(scene: Phaser.Scene, relayout: () => void): void {
  let timer: Phaser.Time.TimerEvent | undefined;
  const handler = () => {
    timer?.remove();
    timer = scene.time.delayedCall(120, () => {
      if (scene.scene.isActive() || scene.scene.isPaused()) relayout();
    });
  };
  scene.scale.on("resize", handler);
  scene.events.once("shutdown", () => {
    timer?.remove();
    scene.scale.off("resize", handler);
  });
}

/** For screens that simply draw everything in create(): start them again after a resize. */
export function restartOnResize(scene: Phaser.Scene, data?: object): void {
  onRelayout(scene, () => scene.scene.restart({ ...data, relayout: true }));
}

/**
 * Centres `count` equally sized items in rows that fit `maxWidth` (as many per row as
 * fit, rows centred), around the point (cx, cy). Returns each item's centre.
 */
export function wrapGrid(count: number, itemW: number, itemH: number, maxWidth: number, cx: number, cy: number): Array<{ x: number; y: number }> {
  const perRow = Math.max(1, Math.min(count, Math.floor(maxWidth / itemW)));
  const rows = Math.ceil(count / perRow);
  const top = cy - (rows * itemH) / 2 + itemH / 2;
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, count - row * perRow);
    const col = i - row * perRow;
    return { x: cx - (inRow * itemW) / 2 + itemW / 2 + col * itemW, y: top + row * itemH };
  });
}
