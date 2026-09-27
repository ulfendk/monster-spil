// A monster's voice: a short call (0.8–1.4 s) of a few "syllables", synthesised from what the
// monster is — dependency-free, deterministic (the same monster always sounds the same).
//
//   - size (HP and defence) sets the pitch: big monsters rumble, small ones squeak;
//   - speed sets how quickly it talks;
//   - attack against defence sets its mood: fierce ones growl (rough, driven), gentle ones coo;
//   - the type gives it its texture: fire crackles and roars, water bloops and bubbles, grass
//     breathes and trills, lightning buzzes and zaps, stone rumbles and grinds;
//   - the id picks its own tune, vowels ("oo", "ah", "ee"…) and little quirks.
//
// Each syllable is a pitched source (saw, pulse, sine by type) through two formant filters (a
// vowel), with a pitch contour (rising, falling, a hill, a trill), vibrato and an envelope;
// the type's layers go on top, and a touch of room echo at the end.
import { SAMPLE_RATE as SR } from "./wav.mjs";

const TAU = Math.PI * 2;

function seeded(text) {
  let a = 2166136261;
  for (const ch of text) a = Math.imul(a ^ ch.codePointAt(0), 16777619) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (x) => x * x * (3 - 2 * x);

/** A band-pass filter (RBJ biquad) whose centre can move. */
function bandpass(q) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x, f) => {
    const w = (TAU * clamp(f, 40, SR * 0.45)) / SR;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    const b0 = alpha / a0, b2 = -alpha / a0, a1 = (-2 * Math.cos(w)) / a0, a2 = (1 - alpha) / a0;
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}
const lowpass = (fc) => {
  const a = 1 - Math.exp((-TAU * fc) / SR);
  let y = 0;
  return (x) => (y += a * (x - y));
};

/** Vowel formants (Hz, for a middle-sized voice). */
const VOWELS = { u: [350, 800], o: [500, 900], a: [800, 1250], e: [450, 1900], i: [300, 2300] };
const VOWEL_KEYS = Object.keys(VOWELS);

/** How each type sounds underneath its layers. */
const TYPE = {
  ild: { pitch: 1.0, source: "saw", vowels: ["a", "o"], rough: 0.35 },
  vand: { pitch: 1.1, source: "sine", vowels: ["u", "o"], rough: 0.05 },
  graes: { pitch: 1.35, source: "pulse", vowels: ["i", "e", "u"], rough: 0.05 },
  lyn: { pitch: 1.55, source: "square", vowels: ["e", "i", "a"], rough: 0.2 },
  sten: { pitch: 0.62, source: "saw", vowels: ["o", "u", "a"], rough: 0.45 },
};

/**
 * Samples (−1…1) of a monster's call. `stats` are its baseStats ({hp, angreb, forsvar, fart});
 * missing ones count as middling.
 */
export function makeVoice(id, type, stats = {}) {
  const r = seeded(`${id}:${type}`);
  const t = TYPE[type] ?? TYPE.ild;
  const hp = stats.hp ?? 40, atk = stats.angreb ?? 12, def = stats.forsvar ?? 10, spd = stats.fart ?? 11;
  const size = clamp((hp + def * 1.5 - 45) / 40, 0, 1); // 0 = tiny, 1 = huge
  const quick = clamp((spd - 6) / 10, 0, 1);
  const fierce = clamp((atk - def + 5) / 12, 0, 1);

  const f0 = lerp(560, 150, size) * t.pitch * (0.9 + r() * 0.2);
  const formantScale = lerp(1.35, 0.75, size); // small throats, high formants
  const syllables = 2 + Math.floor(r() * 3) + (quick > 0.6 && r() < 0.5 ? 1 : 0);
  const syllableLen = lerp(0.26, 0.13, quick) * (0.9 + r() * 0.2);
  const gap = syllableLen * (0.15 + r() * 0.35);

  // The tune: each syllable's shape and step, the last one longer (the end of the phrase).
  const shapes = ["up", "down", "hill", "trill", "flat"];
  const plan = [];
  let at = 0.02;
  let step = 1;
  for (let i = 0; i < syllables; i++) {
    const last = i === syllables - 1;
    const len = syllableLen * (last ? 1.7 + r() * 0.6 : 0.8 + r() * 0.5);
    step *= [1, 1.12, 0.89, 1.25, 0.84, 1.5][Math.floor(r() * 6)];
    step = clamp(step, 0.7, 1.7);
    const vowel = r() < 0.7 ? t.vowels[Math.floor(r() * t.vowels.length)] : VOWEL_KEYS[Math.floor(r() * VOWEL_KEYS.length)];
    plan.push({ start: at, len, pitch: f0 * step, shape: last ? (r() < 0.5 ? "down" : "hill") : shapes[Math.floor(r() * shapes.length)], vowel });
    at += len + gap;
  }
  const seconds = at + 0.25; // room for the echo
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);

  const f1 = bandpass(4.5), f2 = bandpass(6);
  const breathLp = lowpass(3000);
  const rumbleLp = lowpass(180);
  let phase = 0, sub = 0;
  const vibRate = 5 + r() * 2.5;
  const vibDepth = lerp(0.012, 0.04, fierce);

  for (let i = 0; i < n; i++) {
    const time = i / SR;
    const s = plan.find((p) => time >= p.start && time < p.start + p.len);
    if (!s) continue;
    const k = (time - s.start) / s.len; // 0…1 through the syllable
    let contour = 1;
    if (s.shape === "up") contour = lerp(0.85, 1.25, smooth(k));
    else if (s.shape === "down") contour = lerp(1.2, 0.8, smooth(k));
    else if (s.shape === "hill") contour = 1 + 0.25 * Math.sin(Math.PI * k);
    else if (s.shape === "trill") contour = 1 + 0.12 * Math.sign(Math.sin(TAU * 11 * time));
    const f = s.pitch * contour * (1 + vibDepth * Math.sin(TAU * vibRate * time));
    phase += f / SR;
    sub += f / 2 / SR;
    const p = phase % 1;
    let v =
      t.source === "saw" ? 2 * p - 1 :
      t.source === "square" ? (p < 0.5 ? 1 : -1) :
      t.source === "pulse" ? (p < 0.25 ? 1 : -0.33) :
      Math.sin(TAU * phase);
    // Fierce: a growl (the voice flutters roughly) and a harder edge.
    const rough = clamp(t.rough + fierce * 0.4, 0, 0.85);
    v *= 1 - rough * 0.5 * (1 + Math.sin(TAU * (32 + fierce * 25) * time + Math.sin(TAU * 7 * time)));
    // The vowel: two formants, gliding a little towards the next vowel's.
    const [fa, fb] = VOWELS[s.vowel];
    let voiced = f1(v, fa * formantScale) * 1.4 + f2(v, fb * formantScale) * 0.9;
    voiced = Math.tanh(voiced * (1 + fierce * 2.5)) * 0.8;
    // Envelope: a quick onset, a gentle fade.
    const env = Math.min(1, k / 0.08) * (1 - smooth(Math.max(0, (k - 0.55) / 0.45)));
    let sample = voiced * env;

    // The type's layers.
    const noise = r() * 2 - 1;
    if (type === "ild") {
      // A roaring breath and crackles like a campfire.
      sample += breathLp(noise) * 0.1 * env * (1 - k * 0.5);
      if (r() < 0.0015 * (0.5 + fierce)) sample += (r() - 0.5) * 1.2;
    } else if (type === "vand") {
      // Bloops: each syllable starts with a drop in pitch, and little bubbles pop around it.
      sample += Math.sin(TAU * phase * (1 + 1.5 * Math.exp(-k * 12))) * 0.4 * env;
    } else if (type === "graes") {
      // Breathy and airy, like a flute or wind through leaves.
      sample = sample * 0.8 + (noise - breathLp(noise)) * 0.05 * env + Math.sin(TAU * phase * 2) * 0.2 * env;
    } else if (type === "lyn") {
      // Buzzing (ring modulation) and a zap at the start of each syllable.
      sample *= 0.7 + 0.3 * Math.sin(TAU * 95 * time);
      sample += Math.sin(TAU * (2600 * Math.exp(-k * 25) + 200) * time) * 0.35 * Math.exp(-k * 18);
      if (r() < 0.0012) sample += (r() - 0.5) * 1.0;
    } else if (type === "sten") {
      // Rumbling underneath (an octave down) and gravel grinding.
      sample += Math.sin(TAU * sub) * 0.45 * env;
      sample += rumbleLp(noise) * 0.9 * env;
      if (r() < 0.002) sample += (r() - 0.5) * 0.4 * env;
    }
    out[i] = sample;
  }

  if (type === "vand") {
    // Bubbles: quick upward chirps scattered through the call.
    const bubbles = 5 + Math.floor(r() * 6);
    for (let b = 0; b < bubbles; b++) {
      const start = Math.floor(r() * (n - SR * 0.08));
      const f = 700 + r() * 900;
      const len = Math.floor(SR * (0.03 + r() * 0.03));
      for (let j = 0; j < len && start + j < n; j++) {
        const k = j / len;
        out[start + j] += Math.sin((TAU * f * (1 + k * 1.2) * j) / SR) * 0.25 * Math.sin(Math.PI * k);
      }
    }
  }

  // A touch of room: two short echoes.
  for (const [delay, gain] of [[0.061, 0.22], [0.097, 0.14]]) {
    const d = Math.floor(delay * SR);
    for (let i = n - 1; i >= d; i--) out[i] += out[i - d] * gain;
  }
  return out;
}
