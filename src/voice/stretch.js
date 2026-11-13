// Speeds speech up or slows it down without changing its pitch (WSOLA: overlap-add of short
// windows, each nudged to line up with the waveform of the one before). Chrome does the same
// for <audio> with preservesPitch. We do it ourselves so playback can use Web Audio, which
// plays parts back to back with no gap and doesn't show Chrome's media controls.
const N = 720, H = N / 2, D = 240; // at 24 kHz: 30 ms windows, 15 ms hop, search ±10 ms
const WIN = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));

// Returns audio rate times shorter (rate 2 is twice as fast). Times map as t / rate.
export function stretch(x, rate) {
  if (Math.abs(rate - 1) < 0.01 || x.length < 2 * N) return x;
  const outLen = Math.floor(x.length / rate);
  const y = new Float32Array(outLen + N), w = new Float32Array(outLen + N);
  const last = x.length - N;
  let prev = -1;
  for (let o = 0; o < outLen; o += H) {
    const target = Math.min(last, Math.round(o * rate));
    let pos = target;
    const nat = prev + H; // where the previous window naturally continues
    if (prev >= 0 && nat + H <= x.length) {
      let best = -Infinity;
      for (let p = Math.max(0, target - D), hi = Math.min(last, target + D); p <= hi; p += 2) {
        let c = 0;
        for (let j = 0; j < H; j += 2) c += x[p + j] * x[nat + j];
        if (c > best) { best = c; pos = p; }
      }
    }
    for (let j = 0; j < N; j++) { y[o + j] += x[pos + j] * WIN[j]; w[o + j] += WIN[j]; }
    prev = pos;
  }
  for (let i = 0; i < outLen; i++) if (w[i] > 1e-3) y[i] /= w[i];
  return y.subarray(0, outLen);
}
