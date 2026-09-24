let audioCtx: AudioContext | undefined;

function getContext(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

/** A short synthesized tone — no audio asset files exist yet, so this stands in for real sound effects. */
function playBeep(frequency: number, durationMs: number, type: OscillatorType = "sine"): void {
  try {
    const ctx = getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch {
    // Sound is a nice-to-have, never worth crashing the battle over.
  }
}

export function playHitSound(): void {
  playBeep(220, 120, "square");
}

export function playMissSound(): void {
  playBeep(140, 150, "triangle");
}

export function playFaintSound(): void {
  playBeep(180, 350, "sawtooth");
}

/** A short tone for callers outside this file (the fallback monster cry). */
export function playBlip(frequency: number, durationMs: number): void {
  playBeep(frequency, durationMs, "triangle");
}
