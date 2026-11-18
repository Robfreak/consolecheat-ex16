import { clampParams, defaultParams, MAX_SEED, type SfxParams, type Wave } from "./params.ts";
import { mulberry32 } from "./prng.ts";

// Presets after the classic sfxr generators. Each one draws its choices from a
// seeded PRNG, so the same seed always gives the same sound.

export const PRESETS = ["jump", "coin", "explosion", "powerup", "laser", "hit"] as const;
export type PresetId = (typeof PRESETS)[number];

/** Presets on the number keys 1–4 and on the D-pad. */
export const MAIN_PRESETS = ["jump", "coin", "explosion", "powerup"] as const satisfies readonly PresetId[];

export function isPreset(value: unknown): value is PresetId {
  return typeof value === "string" && (PRESETS as readonly string[]).includes(value);
}

type Rng = {
  /** 0..range */
  f: (range: number) => number;
  /** 0..max integer, inclusive */
  i: (max: number) => number;
  /** coin flip */
  b: () => boolean;
};

function rng(seed: number): Rng {
  const next = mulberry32(seed);
  return {
    f: (range) => next() * range,
    i: (max) => Math.floor(next() * (max + 1)),
    b: () => next() < 0.5,
  };
}

function noiseSeed(r: Rng): number {
  return Math.floor(r.f(1) * MAX_SEED) >>> 0;
}

export function generatePreset(id: PresetId, seed: number): SfxParams {
  const r = rng(seed);
  const p = defaultParams();
  p.seed = noiseSeed(r);
  switch (id) {
    case "jump":
      p.wave = "square";
      p.duty = r.f(0.6);
      p.baseFreq = 0.3 + r.f(0.3);
      p.freqRamp = 0.1 + r.f(0.2);
      p.attack = 0;
      p.sustain = 0.1 + r.f(0.3);
      p.decay = 0.1 + r.f(0.2);
      if (r.b()) p.hpfFreq = r.f(0.3);
      if (r.b()) p.lpfFreq = 1 - r.f(0.6);
      break;
    case "coin":
      p.wave = r.b() ? "square" : "sine";
      p.duty = r.f(0.6);
      p.baseFreq = 0.4 + r.f(0.5);
      p.attack = 0;
      p.sustain = r.f(0.1);
      p.decay = 0.1 + r.f(0.4);
      p.punch = 0.3 + r.f(0.3);
      p.arpSpeed = 0.5 + r.f(0.2);
      p.arpMod = 0.2 + r.f(0.4);
      break;
    case "explosion":
      p.wave = "noise";
      if (r.b()) {
        p.baseFreq = 0.1 + r.f(0.4);
        p.freqRamp = -0.1 + r.f(0.4);
      } else {
        p.baseFreq = 0.2 + r.f(0.7);
        p.freqRamp = -0.2 - r.f(0.2);
      }
      p.baseFreq *= p.baseFreq;
      if (r.i(4) === 0) p.freqRamp = 0;
      if (r.i(2) === 0) p.repeatSpeed = 0.3 + r.f(0.5);
      p.attack = 0;
      p.sustain = 0.1 + r.f(0.3);
      p.decay = 0.2 + r.f(0.4);
      if (r.b()) {
        p.vibStrength = r.f(0.7);
        p.vibSpeed = r.f(0.6);
      }
      p.punch = 0.2 + r.f(0.6);
      if (r.i(2) === 0) {
        p.arpSpeed = 0.6 + r.f(0.3);
        p.arpMod = 0.8 - r.f(1.6);
      }
      break;
    case "powerup":
      if (r.b()) p.wave = "sawtooth";
      else {
        p.wave = "square";
        p.duty = r.f(0.6);
      }
      if (r.b()) {
        p.baseFreq = 0.2 + r.f(0.3);
        p.freqRamp = 0.1 + r.f(0.4);
        p.repeatSpeed = 0.4 + r.f(0.4);
      } else {
        p.baseFreq = 0.2 + r.f(0.3);
        p.freqRamp = 0.05 + r.f(0.2);
        if (r.b()) {
          p.vibStrength = r.f(0.7);
          p.vibSpeed = r.f(0.6);
        }
      }
      p.attack = 0;
      p.sustain = 0.1 + r.f(0.4);
      p.decay = 0.1 + r.f(0.4);
      break;
    case "laser": {
      const waves: Wave[] = ["square", "sawtooth", "sine"];
      p.wave = waves[r.i(2)] ?? "square";
      p.baseFreq = 0.5 + r.f(0.5);
      p.freqLimit = Math.max(0.2, p.baseFreq - 0.2 - r.f(0.6));
      p.freqRamp = -0.15 - r.f(0.2);
      if (r.b()) {
        p.duty = r.f(0.5);
        p.dutyRamp = r.f(0.2);
      } else {
        p.duty = 0.4 + r.f(0.5);
        p.dutyRamp = -r.f(0.7);
      }
      p.attack = 0;
      p.sustain = 0.1 + r.f(0.2);
      p.decay = r.f(0.4) + 0.05;
      if (r.b()) p.punch = r.f(0.3);
      if (r.b()) p.hpfFreq = r.f(0.3);
      break;
    }
    case "hit": {
      const waves: Wave[] = ["square", "sawtooth", "noise"];
      p.wave = waves[r.i(2)] ?? "square";
      if (p.wave === "square") p.duty = r.f(0.6);
      p.baseFreq = 0.2 + r.f(0.6);
      p.freqRamp = -0.3 - r.f(0.4);
      p.attack = 0;
      p.sustain = r.f(0.1);
      p.decay = 0.1 + r.f(0.2);
      if (r.b()) p.hpfFreq = r.f(0.3);
      break;
    }
  }
  return clampParams(p);
}

/** Fully random sound, kept audible: some length, not silent, not ear-splitting. */
export function randomParams(seed: number): SfxParams {
  const r = rng(seed);
  const p = defaultParams();
  p.seed = noiseSeed(r);
  const waves: Wave[] = ["square", "sawtooth", "sine", "triangle", "noise"];
  p.wave = waves[r.i(4)] ?? "square";
  p.baseFreq = (r.f(2) - 1) ** 2;
  if (r.b()) p.baseFreq = (r.f(2) - 1) ** 3 + 0.5;
  p.freqLimit = 0;
  p.freqRamp = (r.f(2) - 1) ** 5;
  if (p.baseFreq > 0.7 && p.freqRamp > 0.2) p.freqRamp = -p.freqRamp;
  if (p.baseFreq < 0.2 && p.freqRamp < -0.05) p.freqRamp = -p.freqRamp;
  p.freqDramp = (r.f(2) - 1) ** 3;
  p.duty = r.f(2) - 1;
  p.dutyRamp = (r.f(2) - 1) ** 3;
  p.vibStrength = (r.f(2) - 1) ** 3;
  p.vibSpeed = r.f(2) - 1;
  p.attack = (r.f(2) - 1) ** 3;
  p.sustain = (r.f(2) - 1) ** 2;
  p.decay = r.f(2) - 1;
  p.punch = r.f(0.8) ** 2;
  if (p.attack + p.sustain + p.decay < 0.2) {
    p.sustain += 0.2 + r.f(0.3);
    p.decay += 0.2 + r.f(0.3);
  }
  p.lpfResonance = r.f(2) - 1;
  p.lpfFreq = 1 - r.f(1) ** 3;
  p.lpfRamp = (r.f(2) - 1) ** 3;
  if (p.lpfFreq < 0.1 && p.lpfRamp < -0.05) p.lpfRamp = -p.lpfRamp;
  p.hpfFreq = r.f(1) ** 5;
  p.hpfRamp = (r.f(2) - 1) ** 5;
  p.repeatSpeed = r.b() ? 0 : r.f(2) - 1;
  p.arpSpeed = r.f(2) - 1;
  p.arpMod = r.f(2) - 1;
  p.volume = 0.5;
  return clampParams(p);
}
