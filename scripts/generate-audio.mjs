#!/usr/bin/env node
/**
 * Generates the local ambient preview loops used by the YORU demo player.
 * These are deliberately quiet, generative soundscapes — not audio from asmr.one.
 *
 *   node scripts/generate-audio.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "audio");
const SAMPLE_RATE = 22050;
const DURATION = 20;
const N = SAMPLE_RATE * DURATION;

mkdirSync(outDir, { recursive: true });

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeBuffer() {
  return new Float32Array(N);
}

function addNoise(buffer, rand, gain, lowpass = 0.06, highpass = 0.0008) {
  let lp = 0;
  let hp = 0;
  let prev = 0;
  for (let i = 0; i < N; i++) {
    const white = rand() * 2 - 1;
    lp += lowpass * (white - lp);
    hp = 0.995 * (hp + lp - prev);
    prev = lp;
    buffer[i] += hp * gain;
  }
}

function addTone(buffer, freq, gain, opts = {}) {
  const {
    pan = 0,
    phase = 0,
    tremolo = 0,
    tremoloRate = 0.1,
    attack = 3,
    release = 4,
    partials = [1, 0.28, 0.08],
  } = opts;
  const left = 1 - Math.max(0, pan);
  const right = 1 + Math.min(0, pan);
  const fadeIn = SAMPLE_RATE * attack;
  const fadeOut = SAMPLE_RATE * release;
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const envIn = Math.min(1, i / fadeIn);
    const envOut = Math.min(1, (N - i) / fadeOut);
    const env = Math.sin((Math.PI / 2) * envIn) * Math.sin((Math.PI / 2) * envOut);
    const trem = 1 + tremolo * Math.sin(2 * Math.PI * tremoloRate * t + phase);
    let s = 0;
    for (let p = 0; p < partials.length; p++) {
      s += partials[p] * Math.sin(2 * Math.PI * freq * (p + 1) * t + phase * (p + 1));
    }
    const val = s * gain * env * trem;
    if (buffer instanceof Float32Array) {
      buffer[i] += val * (1 + left * 0.12);
    } else {
      buffer[i][0] += val * left;
      buffer[i][1] += val * right;
    }
  }
}

function addBell(buffer, at, freq, gain, rand, decay = 1.8) {
  const start = Math.floor(at * SAMPLE_RATE);
  const len = Math.floor(Math.min(5, decay * 2.8) * SAMPLE_RATE);
  for (let j = 0; j < len && start + j < N; j++) {
    const t = j / SAMPLE_RATE;
    const env = Math.exp(-t / decay) * Math.min(1, j / 120);
    const shimmer = 1 + 0.002 * Math.sin(2 * Math.PI * 0.6 * t);
    const s =
      Math.sin(2 * Math.PI * freq * shimmer * t) * 0.62 +
      Math.sin(2 * Math.PI * freq * 2.01 * t) * 0.19 +
      Math.sin(2 * Math.PI * freq * 3.98 * t) * 0.08 +
      (rand() * 2 - 1) * 0.004;
    buffer[start + j] += s * gain * env;
  }
}

function addCrackle(buffer, rand, density, gain, low = 0.2) {
  let i = 0;
  while (i < N) {
    i += Math.floor(SAMPLE_RATE * (0.03 + rand() * density));
    if (i >= N) break;
    const amp = gain * (0.25 + rand() * 0.75);
    const length = 80 + Math.floor(rand() * 260);
    let lp = 0;
    for (let j = 0; j < length && i + j < N; j++) {
      const white = rand() * 2 - 1;
      lp += 0.18 * (white - lp);
      const env = Math.exp(-j / (28 + rand() * 50));
      buffer[i + j] += lp * env * amp;
    }
    if (rand() > 0.82) {
      addBell(buffer, i / SAMPLE_RATE, 1500 + rand() * 2500, amp * 0.18, rand, 0.2);
    }
  }
}

function addDrop(buffer, at, rand, gain) {
  const start = Math.floor(at * SAMPLE_RATE);
  const f0 = 440 + rand() * 1300;
  const len = Math.floor(SAMPLE_RATE * (0.06 + rand() * 0.18));
  for (let j = 0; j < len && start + j < N; j++) {
    const t = j / SAMPLE_RATE;
    const env = Math.exp(-t * (28 + rand() * 20));
    const freq = f0 * (0.65 + 0.35 * Math.exp(-t * 16));
    buffer[start + j] += Math.sin(2 * Math.PI * freq * t) * env * gain;
  }
}

function addWave(buffer, rand, gain, period = 8) {
  let lp = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const white = rand() * 2 - 1;
    lp += 0.035 * (white - lp);
    const swell =
      0.28 +
      0.72 *
        Math.pow(0.5 + 0.5 * Math.sin((2 * Math.PI * t) / period - Math.PI / 2), 2);
    buffer[i] += lp * swell * gain;
  }
}

function addChirp(buffer, at, base, gain, rand) {
  const start = Math.floor(at * SAMPLE_RATE);
  const len = Math.floor(SAMPLE_RATE * 0.22);
  for (let j = 0; j < len && start + j < N; j++) {
    const t = j / SAMPLE_RATE;
    const env = Math.sin((Math.PI * j) / len) ** 2;
    const freq = base + 650 * (j / len);
    buffer[start + j] +=
      Math.sin(2 * Math.PI * freq * t + 3 * Math.sin(2 * Math.PI * 42 * t)) *
      env *
      gain *
      (0.7 + rand() * 0.3);
  }
}

const palette = {
  D: 73.42,
  E: 82.41,
  F: 87.31,
  G: 98.0,
  A: 110.0,
  Bb: 116.54,
  B: 123.47,
  C: 130.81,
};

function compose(index) {
  const buffer = makeBuffer();
  const rand = rng(9321 + index * 117);
  const chord = [
    [palette.D, palette.A, palette.F, palette.C],
    [palette.F, palette.C, palette.A, palette.E],
    [palette.G, palette.D, palette.Bb, palette.F],
    [palette.A, palette.E, palette.C, palette.G],
    [palette.E, palette.B, palette.G, palette.D],
    [palette.C, palette.G, palette.E, palette.B],
    [palette.D, palette.A, palette.F, palette.C],
    [palette.G, palette.D, palette.Bb, palette.F],
    [palette.B, palette.F, palette.D, palette.A],
    [palette.F, palette.C, palette.A, palette.E],
    [palette.A, palette.E, palette.C, palette.G],
    [palette.E, palette.B, palette.G, palette.D],
  ][index - 1];

  const tones = chord.map((f, i) => f * (i === 3 ? 2 : 1.5));

  // A quiet harmonic floor for every scene.
  tones.forEach((freq, i) => {
    addTone(buffer, freq, 0.055 / (i * 0.45 + 1), {
      phase: i * 1.7 + index,
      tremolo: 0.16,
      tremoloRate: 0.04 + i * 0.013,
      attack: 4,
      release: 5,
      partials: [1, 0.18, 0.05],
    });
  });

  addTone(buffer, chord[0] / 2, 0.055, {
    phase: 0.8,
    attack: 5,
    release: 6,
    partials: [1, 0.08],
  });

  switch (index) {
    case 1:
      addNoise(buffer, rand, 0.038, 0.022, 0.0006);
      addCrackle(buffer, rand, 0.5, 0.016, 0.25);
      addBell(buffer, 2.6, 880, 0.05, rand, 2.4);
      addBell(buffer, 8.2, 1174.7, 0.045, rand, 2.8);
      addBell(buffer, 14.1, 659.3, 0.05, rand, 2.2);
      break;
    case 2:
      addNoise(buffer, rand, 0.03, 0.018, 0.0004);
      [3.2, 5.5, 9.8, 13.4, 16.8].forEach((t, i) =>
        addBell(buffer, t, 1046.5 * (i % 2 ? 1.25 : 1), 0.042, rand, 2.8),
      );
      break;
    case 3:
      addNoise(buffer, rand, 0.034, 0.015, 0.0005);
      [2.1, 4.7, 7.8, 11.2, 15.4, 18.2].forEach((t) => addCrackle(buffer, rand, 0.4, 0.012));
      addBell(buffer, 6.4, 1318.5, 0.03, rand, 1.6);
      break;
    case 4:
      addNoise(buffer, rand, 0.08, 0.08, 0.002);
      for (let t = 0.7; t < DURATION; t += 0.18 + rand() * 0.55) addDrop(buffer, t, rand, 0.025);
      addNoise(buffer, rand, 0.025, 0.008, 0.0004);
      break;
    case 5:
      addCrackle(buffer, rand, 0.12, 0.05, 0.6);
      addNoise(buffer, rand, 0.018, 0.012, 0.0004);
      [1.4, 4.1, 7.2, 9.8, 12.7, 16.9].forEach((t) => addChirp(buffer, t, 3200, 0.012, rand));
      break;
    case 6:
      addNoise(buffer, rand, 0.07, 0.05, 0.0015);
      for (let t = 0.5; t < DURATION; t += 0.45 + rand() * 1.1) {
        addBell(buffer, t, 720 + rand() * 380, 0.018, rand, 0.55);
      }
      addBell(buffer, 4.2, 523.3, 0.05, rand, 3.2);
      addBell(buffer, 13.5, 659.3, 0.038, rand, 3.6);
      break;
    case 7:
      addNoise(buffer, rand, 0.06, 0.04, 0.0008);
      addTone(buffer, 146.8, 0.012, { pan: -0.6, phase: 3, attack: 6, release: 7, partials: [1, 0.02] });
      [5.9, 15.2].forEach((t) => addBell(buffer, t, 392, 0.02, rand, 4));
      break;
    case 8:
      addNoise(buffer, rand, 0.04, 0.02, 0.0005);
      addCrackle(buffer, rand, 0.8, 0.008, 0.4);
      [2.8, 6.7, 10.9, 14.4, 17.2].forEach((t) => addBell(buffer, t, 1760 * (0.9 + rand() * 0.2), 0.018, rand, 0.3));
      addTone(buffer, 220, 0.018, { phase: 2.4, attack: 7, release: 7, tremolo: 0.3, tremoloRate: 0.16 });
      break;
    case 9:
      addNoise(buffer, rand, 0.05, 0.028, 0.0005);
      [2.4, 3.1, 7.6, 12.2, 16.8].forEach((t, i) =>
        addBell(buffer, t, 1567.98 * (1 + i * 0.02), 0.02, rand, 3.2),
      );
      break;
    case 10: {
      addNoise(buffer, rand, 0.045, 0.06, 0.001);
      const purr = makeBuffer();
      for (let i = 0; i < N; i++) {
        const t = i / SAMPLE_RATE;
        purr[i] = Math.sin(2 * Math.PI * 27 * t) * (0.55 + 0.45 * Math.sin(2 * Math.PI * 1.7 * t));
      }
      let lp = 0;
      for (let i = 0; i < N; i++) {
        lp += 0.05 * (purr[i] - lp);
        buffer[i] += lp * 0.055;
      }
      for (let t = 0.9; t < DURATION; t += 0.35 + rand() * 0.8) addDrop(buffer, t, rand, 0.012);
      break;
    }
    case 11:
      addNoise(buffer, rand, 0.023, 0.02, 0.0004);
      for (let t = 1.1; t < DURATION; t += 2.7 + rand() * 2.1) {
        const start = Math.floor(t * SAMPLE_RATE);
        const len = Math.floor(SAMPLE_RATE * 0.28);
        for (let j = 0; j < len && start + j < N; j++) {
          const env = Math.sin((Math.PI * j) / len) ** 2;
          buffer[start + j] += (rand() * 2 - 1) * env * 0.012;
        }
      }
      addBell(buffer, 9.4, 1046.5, 0.025, rand, 1.2);
      break;
    case 12:
      addNoise(buffer, rand, 0.09, 0.035, 0.0007);
      addWave(buffer, rand, 0.065, 9.2);
      addBell(buffer, 3.6, 523.3, 0.035, rand, 4.6);
      addBell(buffer, 15.1, 783.99, 0.025, rand, 4);
      break;
  }

  // Gentle tape hiss + master fades.
  addNoise(buffer, rand, 0.006, 0.008, 0.001);
  const fadeIn = SAMPLE_RATE * 1.8;
  const fadeOut = SAMPLE_RATE * 3.2;
  let peak = 0;
  for (let i = 0; i < N; i++) {
    const env =
      Math.min(1, i / fadeIn) * Math.min(1, (N - i) / fadeOut) ** 0.8;
    buffer[i] = Math.tanh(buffer[i] * env * 1.3);
    peak = Math.max(peak, Math.abs(buffer[i]));
  }
  const scale = peak > 0 ? 0.68 / peak : 1;
  for (let i = 0; i < N; i++) buffer[i] *= scale;
  return buffer;
}

function wavFromFloat(buffer) {
  const bytes = new Uint8Array(44 + buffer.length * 2);
  const view = new DataView(bytes.buffer);
  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + buffer.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, buffer.length * 2, true);
  for (let i = 0; i < buffer.length; i++) {
    const s = Math.max(-1, Math.min(1, buffer[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}

for (let i = 1; i <= 12; i++) {
  const file = join(outDir, `ambient-${String(i).padStart(2, "0")}.wav`);
  writeFileSync(file, wavFromFloat(compose(i)));
  console.log(`generated ${file}`);
}
