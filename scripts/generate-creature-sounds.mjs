// Generates a placeholder cry for each of the six starting monsters:
//   node scripts/generate-creature-sounds.mjs
// Writes shared/content/creatures/<id>.wav (mono, 16-bit, 22.05 kHz). These are
// stand-ins: to give a monster its own voice, record a sound and save it over the
// file (or under the name in the monster's "sound" field), then rebuild.
// Dependency-free on purpose (hand-written WAV encoder).
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../shared/content/creatures");
const SR = 22050;
const TAU = Math.PI * 2;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Builds `seconds` of audio by calling fn(t, i) for every sample. */
const make = (seconds, fn) => Float32Array.from({ length: Math.round(seconds * SR) }, (_, i) => fn(i / SR, i));
const saw = (phase) => 2 * (phase - Math.floor(phase + 0.5));
const lowpass = (fc) => {
  const a = 1 - Math.exp((-TAU * fc) / SR);
  let y = 0;
  return (x) => (y += a * (x - y));
};
const smooth = (x) => x * x * (3 - 2 * x);

const sounds = {
  // Fire: a crackling growl.
  flammepels() {
    const r = rng(1);
    const lp = lowpass(900);
    let phase = 0;
    return make(0.85, (t) => {
      phase += (95 + 25 * Math.sin(TAU * 7 * t)) / SR;
      const env = Math.min(1, t / 0.04) * Math.exp(-t * 2.6);
      const growl = lp(saw(phase)) * (0.6 + 0.4 * Math.sin(TAU * 32 * t));
      const crackle = r() < 0.004 ? (r() * 2 - 1) * 1.2 : 0;
      return env * growl * 1.4 + crackle * Math.exp(-t * 3);
    });
  },
  // Water: three rising bubbles.
  dryppel() {
    return make(0.85, (t) => {
      let out = 0;
      for (const start of [0.05, 0.3, 0.55]) {
        const x = (t - start) / 0.2;
        if (x < 0 || x > 1) continue;
        const f = 350 + 900 * x ** 1.5;
        out += Math.sin(TAU * f * (t - start)) * Math.sin(Math.PI * x) ** 0.6 * Math.exp(-x * 1.5);
      }
      return out * 0.8;
    });
  },
  // Grass: a rustle, then a two-note chirp.
  lovgro() {
    const r = rng(3);
    let prev = 0;
    return make(0.85, (t) => {
      const n = r() * 2 - 1;
      const rustle = (n - prev) * 0.5; // crude high-pass
      prev = n;
      const rEnv = t < 0.35 ? Math.sin((Math.PI * t) / 0.35) ** 2 : 0;
      let chirp = 0;
      for (const [start, f] of [[0.4, 1000], [0.58, 1350]]) {
        const x = (t - start) / 0.15;
        if (x < 0 || x > 1) continue;
        const vib = 1 + 0.03 * Math.sin(TAU * 25 * t);
        chirp += (Math.sin(TAU * f * vib * t) + 0.3 * Math.sin(TAU * 2 * f * t)) * Math.sin(Math.PI * x);
      }
      return rustle * rEnv * 0.9 + chirp * 0.45;
    });
  },
  // Lightning: a fast falling zap with crackle.
  gnistrot() {
    const r = rng(4);
    let phase = 0;
    return make(0.6, (t) => {
      const f = 2200 * Math.exp(-t * 8) + 180;
      phase += f / SR;
      const square = Math.sign(Math.sin(TAU * phase));
      const gate = Math.sign(Math.sin(TAU * 45 * t)) > 0 ? 1 : 0.35;
      const burst = t < 0.05 ? (r() * 2 - 1) * (1 - t / 0.05) : 0;
      return (square * gate * Math.exp(-t * 4) * 0.55 + burst) * Math.min(1, t / 0.005);
    });
  },
  // Stone: a thud and a low rumble.
  stenbid() {
    const r = rng(5);
    const lp = lowpass(220);
    let p1 = 0;
    let p2 = 0;
    return make(0.95, (t) => {
      p1 += 55 / SR;
      p2 += 82 / SR;
      const rumble = lp(saw(p1) + 0.6 * saw(p2)) * (0.7 + 0.3 * Math.sin(TAU * 6 * t));
      const thud = Math.sin(TAU * (40 + 60 * Math.exp(-t * 18)) * t) * Math.exp(-t * 9);
      return (rumble * 2.2 * Math.min(1, t / 0.08) * Math.exp(-t * 1.8) + thud * 1.2 + (r() * 2 - 1) * 0.05 * Math.exp(-t * 6));
    });
  },
  // Wave: a whoosh that swells and ebbs, with a gliding hum.
  boelgehale() {
    const r = rng(6);
    let y = 0;
    let phase = 0;
    return make(0.95, (t) => {
      const x = t / 0.95;
      const fc = 300 + 2700 * Math.sin(Math.PI * x) ** 2;
      y += (1 - Math.exp((-TAU * fc) / SR)) * (r() * 2 - 1 - y);
      phase += (300 + 220 * Math.sin(Math.PI * x)) / SR;
      const env = smooth(Math.min(1, x / 0.25)) * (1 - smooth(Math.max(0, (x - 0.6) / 0.4)));
      return env * (y * 2.4 + Math.sin(TAU * phase) * 0.25);
    });
  },
};

function encodeWav(samples) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const gain = peak > 0 ? 0.7 / peak : 1;
  // Short fade-out so nothing clicks at the end.
  const fade = Math.round(0.02 * SR);
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => {
    const tail = Math.min(1, (samples.length - i) / fade);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * gain * tail)) * 32767), i * 2);
  });
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SR, 24); header.writeUInt32LE(SR * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

for (const [id, build] of Object.entries(sounds)) {
  const samples = build();
  writeFileSync(path.join(OUT, `${id}.wav`), encodeWav(samples));
  console.log(`${id}.wav  ${(samples.length / SR).toFixed(2)} s`);
}
