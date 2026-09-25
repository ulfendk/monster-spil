// A stand-in cry for a new monster until it gets its own recording: a short call whose
// character comes from its type and whose tune comes from its id (so each one differs).
import { SAMPLE_RATE as SR } from "./wav.mjs";

const TAU = Math.PI * 2;

function seeded(text) {
  let a = 0;
  for (const ch of text) a = (Math.imul(a, 31) + ch.codePointAt(0)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Samples (−1…1) of a 0.7–1 s cry for a monster of this type. */
export function makeCry(id, type) {
  const r = seeded(id);
  const base = { ild: 260, vand: 330, graes: 520, lyn: 700, sten: 150 }[type] ?? 400;
  const notes = 2 + Math.floor(r() * 3);
  const seconds = 0.7 + r() * 0.3;
  const steps = [1, 1.26, 0.84, 1.5, 1.12];
  const tune = Array.from({ length: notes }, () => steps[Math.floor(r() * steps.length)]);
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const k = Math.min(notes - 1, Math.floor((t / seconds) * notes));
    const noteT = t - (k * seconds) / notes;
    let f = base * tune[k] * (1 + 0.15 * Math.sin(TAU * 7 * t));
    if (type === "lyn") f *= 1 + 0.5 * Math.exp(-noteT * 20);
    phase += f / SR;
    let v = Math.sin(TAU * phase);
    if (type === "ild") v = Math.tanh(3 * v) + 0.2 * (r() * 2 - 1); // crackly
    if (type === "sten") v = Math.sign(v) * 0.6 + 0.4 * v; // gravelly
    if (type === "vand") v *= 0.6 + 0.4 * Math.sin(TAU * 18 * t); // bubbly
    if (type === "graes") v = v * 0.7 + 0.3 * Math.sin(TAU * phase * 2); // airy
    const env = Math.min(1, noteT / 0.02) * Math.exp(-noteT * 5);
    out[i] = v * env;
  }
  return out;
}
