/**
 * Picture and sound files for monsters, picked up at build time like the
 * creature JSON is: drop a file into shared/content/creatures/ and name it in the
 * monster's JSON ("spriteFront", "spriteBack", "sound") — no TypeScript to touch.
 * Keys are the same relative paths the JSON uses, e.g. "creatures/flammepels.wav".
 */
const modules = import.meta.glob<string>("../../../shared/content/creatures/*.{png,wav,mp3,m4a}", {
  eager: true,
  query: "?url",
  import: "default",
});

const MARKER = "shared/content/";

export const contentAssets: Record<string, string> = Object.fromEntries(
  Object.entries(modules).map(([file, url]) => [file.slice(file.indexOf(MARKER) + MARKER.length), url])
);
