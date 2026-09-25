// A tiny WAV writer (mono, 16-bit), dependency-free. Shared by the sound scripts.
export const SAMPLE_RATE = 22050;

/** Normalises the samples, fades out the last 20 ms (no click), and wraps them as a WAV file. */
export function encodeWav(samples, sr = SAMPLE_RATE) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const gain = peak > 0 ? 0.7 / peak : 1;
  const fade = Math.round(0.02 * sr);
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => {
    const tail = Math.min(1, (samples.length - i) / fade);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * gain * tail)) * 32767), i * 2);
  });
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sr, 24); header.writeUInt32LE(sr * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
