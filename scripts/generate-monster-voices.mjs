// Gives every monster its own voice (scripts/lib/voice.mjs), from its size, speed, mood and type:
//   node scripts/generate-monster-voices.mjs            (every monster without a hand-made cry)
//   node scripts/generate-monster-voices.mjs mosmus      (just these)
// Writes the file named in each monster's "sound" (shared/content/creatures/<id>.wav). Skips
// the cries made by hand in scripts/generate-creature-sounds.mjs (the dragon's baby, the
// disasters' monsters, the first monsters…) and any monster without a "sound". To give a
// monster a recorded voice instead, save the recording over its file (and don't run this
// for it again).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeVoice } from "./lib/voice.mjs";
import { encodeWav } from "./lib/wav.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CREATURES = path.join(ROOT, "shared/content/creatures");
const handMade = new Set([...readFileSync(path.join(ROOT, "scripts/generate-creature-sounds.mjs"), "utf8").matchAll(/"creatures\/([a-z0-9]+)"/g)].map((m) => m[1]));
const only = new Set(process.argv.slice(2));

let written = 0;
for (const file of readdirSync(CREATURES).filter((f) => f.endsWith(".json")).sort()) {
  const species = JSON.parse(readFileSync(path.join(CREATURES, file), "utf8"));
  if (only.size ? !only.has(species.id) : handMade.has(species.id)) continue;
  if (!species.sound) continue;
  const samples = makeVoice(species.id, species.type, species.baseStats);
  writeFileSync(path.join(ROOT, "shared/content", species.sound), encodeWav(samples));
  written++;
}
console.log(`${written} voices written (${handMade.size} hand-made cries left alone)`);
