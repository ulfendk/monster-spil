// Generates placeholder cries for the monsters and the raid dragon:
//   node scripts/generate-creature-sounds.mjs
// Writes shared/content/creatures/<id>.wav and shared/content/raid/<id>.wav (mono, 16-bit, 22.05 kHz). These are
// stand-ins: to give a monster its own voice, record a sound and save it over the
// file (or under the name in the monster's "sound" field), then rebuild.
// Dependency-free on purpose (hand-written WAV encoder).
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SAMPLE_RATE, encodeWav } from "./lib/wav.mjs";

const CONTENT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../shared/content");
const SR = SAMPLE_RATE;
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

/** A roar: a growling, pitch-bending sawtooth with breathy noise. `pitch` scales it (small dragon = higher). */
function roar(seconds, pitch, seed) {
  const r = rng(seed);
  const lp = lowpass(1400 * pitch);
  const breath = lowpass(2500);
  let phase = 0;
  return make(seconds, (t) => {
    const x = t / seconds;
    const f = pitch * (70 + 90 * Math.sin(Math.PI * Math.min(1, x * 1.3)));
    phase += (f * (1 + 0.08 * Math.sin(TAU * 11 * t))) / SR;
    const env = smooth(Math.min(1, x / 0.15)) * (1 - smooth(Math.max(0, (x - 0.55) / 0.45)));
    const body = lp(saw(phase) + 0.5 * saw(phase * 1.51)) * (0.7 + 0.3 * Math.sin(TAU * 27 * t));
    return env * (body * 1.6 + breath(r() * 2 - 1) * 0.5);
  });
}

const sounds = {
  // Fire dragon hatchling: a small, squeaky roar.
  "creatures/drageunge": () => roar(0.9, 2.4, 7),
  // The raid dragon: a long, deep roar.
  "raid/kaempedragen": () => roar(1.8, 1, 8),
  // Monsters that natural disasters leave behind.
  // Meteor: a falling whistle that ends in a zap and a sparkle.
  "creatures/stjernesten"() {
    const r = rng(11);
    let phase = 0;
    return make(0.9, (t) => {
      const f = 2400 * Math.exp(-t * 3.2) + 160;
      phase += f / SR;
      const whistle = Math.sin(TAU * phase) * Math.min(1, t / 0.03) * (t < 0.6 ? 1 : Math.exp(-(t - 0.6) * 12));
      const zap = t > 0.55 && t < 0.7 ? (r() * 2 - 1) * (1 - (t - 0.55) / 0.15) : 0;
      const sparkle = t > 0.65 && r() < 0.01 ? Math.sin(TAU * 3200 * t) : 0;
      return whistle * 0.8 + zap + sparkle * 0.6;
    });
  },
  // Earthquake crab: a low rumble with clicking claws.
  "creatures/revnekrabbe"() {
    const r = rng(12);
    const lp = lowpass(160);
    return make(0.9, (t) => {
      const rumble = lp(r() * 2 - 1) * 5 * Math.sin(Math.PI * Math.min(1, t / 0.9));
      let clicks = 0;
      for (const start of [0.15, 0.3, 0.62, 0.74]) {
        const x = t - start;
        if (x > 0 && x < 0.03) clicks += Math.sin(TAU * 1800 * x) * (1 - x / 0.03);
      }
      return rumble + clicks * 0.9;
    });
  },
  // Flood troll: bubbling glugs.
  "creatures/flodtrold"() {
    const r = rng(13);
    const bubbles = Array.from({ length: 9 }, () => ({ start: r() * 0.8, f: 180 + r() * 420 }));
    return make(1, (t) => {
      let v = 0;
      for (const b of bubbles) {
        const x = t - b.start;
        if (x > 0 && x < 0.12) v += Math.sin(TAU * b.f * (1 + x * 6) * x) * Math.sin((Math.PI * x) / 0.12);
      }
      return v;
    });
  },
  // Leaf whirl: a gust of wind that rises and falls, with rustling.
  "creatures/loevhvirvel"() {
    const r = rng(14);
    let y = 0;
    return make(1.1, (t) => {
      const x = t / 1.1;
      const fc = 400 + 2600 * Math.sin(Math.PI * x) ** 3;
      y += (1 - Math.exp((-TAU * fc) / SR)) * (r() * 2 - 1 - y);
      const rustle = r() < 0.02 ? (r() * 2 - 1) * 0.6 : 0;
      return (y * 2.2 + rustle) * Math.sin(Math.PI * x);
    });
  },
  // Ash bird: two chirps with a crackle of embers.
  "creatures/askefugl"() {
    const r = rng(15);
    return make(0.8, (t) => {
      let v = 0;
      for (const start of [0.05, 0.32]) {
        const x = (t - start) / 0.18;
        if (x > 0 && x < 1) v += Math.sin(TAU * (1400 + 1600 * x) * (t - start)) * Math.sin(Math.PI * x);
      }
      const crackle = r() < 0.006 ? (r() * 2 - 1) * 1.1 : 0;
      return v + crackle;
    });
  },
  // Rumling, the UFO's alien: a wobbly space warble.
  "creatures/rumling"() {
    let phase = 0;
    return make(1.3, (t) => {
      const f = 520 + 260 * Math.sin(TAU * 5.5 * t) + 180 * Math.sin(TAU * 0.8 * t);
      phase += f / SR;
      const env = Math.min(1, t / 0.08) * Math.min(1, (1.3 - t) / 0.2);
      return env * (Math.sin(TAU * phase) + 0.3 * Math.sin(TAU * phase * 2.01));
    });
  },
  // Fire: a crackling growl.
  "creatures/flammepels"() {
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
  "creatures/dryppel"() {
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
  "creatures/lovgro"() {
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
  "creatures/gnistrot"() {
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
  "creatures/stenbid"() {
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
  "creatures/boelgehale"() {
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
  // Fire bat: two wing flaps, a screech that swoops down, and crackling embers.
  "creatures/ildflagrer"() {
    const r = rng(16);
    const whoosh = lowpass(700);
    let phase = 0;
    return make(1.05, (t) => {
      let flaps = 0;
      for (const start of [0, 0.16]) {
        const x = (t - start) / 0.13;
        if (x > 0 && x < 1) flaps += Math.sin(Math.PI * x) ** 2;
      }
      const wind = whoosh(r() * 2 - 1) * flaps * 3;
      const x = (t - 0.3) / 0.6;
      let screech = 0;
      if (x > 0 && x < 1) {
        phase += (1900 - 1100 * x + 120 * Math.sin(TAU * 38 * t)) / SR;
        screech = Math.tanh(2.5 * Math.sin(TAU * phase)) * Math.sin(Math.PI * Math.min(1, x * 4)) * (1 - smooth(x));
      }
      const crackle = t > 0.25 && r() < 0.005 ? (r() * 2 - 1) * 1.1 : 0;
      return wind + screech * 0.5 + crackle;
    });
  },
};


for (const [name, build] of Object.entries(sounds)) {
  const samples = build();
  writeFileSync(path.join(CONTENT, `${name}.wav`), encodeWav(samples));
  console.log(`${name}.wav  ${(samples.length / SR).toFixed(2)} s`);
}
