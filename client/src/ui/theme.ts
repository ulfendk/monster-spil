/**
 * The game's look: the Kanagawa palette (as in the Omarchy "kanagawa" theme, after
 * rebelot/kanagawa.nvim, itself named after Hokusai's Great Wave off Kanagawa) plus
 * the font. Every colour in the client comes from here — change the look in one place.
 *
 * `C` holds numbers for Phaser shapes (0xRRGGBB); `CSS` holds the same colours as
 * strings for text. Name things by what they are for (`C.button`), not by hue.
 */

/** The raw Kanagawa palette. */
export const KANAGAWA = {
  sumiInk0: 0x16161d,
  sumiInk1: 0x181820,
  sumiInk3: 0x1f1f28, // the background
  sumiInk4: 0x2a2a37,
  sumiInk5: 0x363646,
  sumiInk6: 0x54546d,
  waveBlue1: 0x223249,
  waveBlue2: 0x2d4f67,
  fujiWhite: 0xdcd7ba, // the foreground
  oldWhite: 0xc8c093,
  fujiGray: 0x727169,
  autumnRed: 0xc34043,
  samuraiRed: 0xe82424,
  waveRed: 0xe46876,
  peachRed: 0xff5d62,
  surimiOrange: 0xffa066,
  autumnGreen: 0x76946a,
  springGreen: 0x98bb6c,
  waveAqua2: 0x7aa89f,
  crystalBlue: 0x7e9cd8,
  springBlue: 0x7fb4ca,
  oniViolet: 0x957fb8,
  carpYellow: 0xe6c384,
  boatYellow1: 0x938056,
  boatYellow2: 0xc0a36e,
  katanaGray: 0x717c7c,
  sakuraPink: 0xd27e99,
  winterGreen: 0x2b3328,
  /** Warm rice-paper white (not in the editor palette; for the seal's ink and paper touches). */
  washi: 0xf0e6d2,
} as const;

const K = KANAGAWA;

/** What each colour is for. */
export const C: Readonly<Record<
  | "background" | "overlay" | "panel" | "panelHi" | "panelMine" | "border" | "text" | "button" | "buttonQuiet"
  | "ok" | "okDone" | "danger" | "catch" | "accent" | "sun" | "hpGood" | "hpMid" | "hpLow" | "shadow" | "paper",
  number
>> = {
  background: K.sumiInk3,
  /** Full-screen overlays (menus, the monster book) — drawn over the map at ~0.9 alpha. */
  overlay: K.sumiInk0,
  panel: K.sumiInk4,
  panelHi: K.sumiInk5,
  /** Highlighted row (e.g. my own line on the scoreboard). */
  panelMine: K.waveBlue1,
  border: K.fujiWhite,
  text: K.fujiWhite,
  /** Default button, HUD buttons. */
  button: K.waveBlue2,
  /** Neutral / close / cancel-ish buttons. */
  buttonQuiet: K.sumiInk5,
  /** ✓, OK, confirm. */
  ok: K.autumnGreen,
  okDone: 0x566f4d,
  /** ✗, cancel, and the ⚔️ fight buttons. */
  danger: K.autumnRed,
  /** The Fang! (catch) button and the ball. */
  catch: K.waveRed,
  /** Highlights: selection rings, points, notices. */
  accent: K.carpYellow,
  /** The rising sun behind titles and the dragon. */
  sun: K.autumnRed,
  hpGood: K.springGreen,
  hpMid: K.surimiOrange,
  hpLow: K.samuraiRed,
  shadow: 0x000000,
  paper: K.washi,
};

/** The same, as CSS strings for Phaser text. */
export const CSS: Readonly<Record<"text" | "soft" | "muted" | "faint" | "accent" | "ok" | "danger" | "chip" | "ink" | "paper", string>> = {
  text: "#dcd7ba",
  soft: "#c8c093",
  muted: "#727169",
  faint: "#54546d",
  accent: "#e6c384",
  ok: "#98bb6c",
  danger: "#e46876",
  /** Text backgrounds (toasts, the bag chip). */
  chip: "#16161dd9",
  ink: "#1f1f28",
  paper: "#f0e6d2",
};

/** Colours players can pick at setup — Kanagawa hues that read well on the map. */
export const PLAYER_COLOURS = ["#e46876", "#ffa066", "#e6c384", "#98bb6c", "#7fb4ca", "#957fb8"] as const;

/**
 * A rounded Japanese-style font: Hiragino Maru Gothic ships with iPadOS/iOS (so nothing
 * is downloaded — the game stays offline and third-party free) and has æ/ø/å; other
 * systems fall back to similar rounded fonts, then any sans-serif.
 */
export const FONT = '"Hiragino Maru Gothic ProN", "Hiragino Sans", "M PLUS Rounded 1c", "Zen Maru Gothic", "Nunito", "Noto Sans", sans-serif';

/** The CSS form of a numeric colour, e.g. for a text colour that matches a shape. */
export function css(colour: number): string {
  return `#${colour.toString(16).padStart(6, "0")}`;
}
