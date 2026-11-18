// sfxr-style parameter model. Every number is normalized like in the original sfxr:
// 0..1 for amounts, -1..1 for slides and ramps. `seed` drives the noise table.

export const WAVES = ["square", "sawtooth", "sine", "triangle", "noise"] as const;
export type Wave = (typeof WAVES)[number];

export const PARAM_RANGES = {
  attack: [0, 1],
  sustain: [0, 1],
  punch: [0, 1],
  decay: [0, 1],
  baseFreq: [0, 1],
  freqLimit: [0, 1],
  freqRamp: [-1, 1],
  freqDramp: [-1, 1],
  vibStrength: [0, 1],
  vibSpeed: [0, 1],
  arpMod: [-1, 1],
  arpSpeed: [0, 1],
  duty: [0, 1],
  dutyRamp: [-1, 1],
  repeatSpeed: [0, 1],
  lpfFreq: [0, 1],
  lpfRamp: [-1, 1],
  lpfResonance: [0, 1],
  hpfFreq: [0, 1],
  hpfRamp: [-1, 1],
  volume: [0, 1],
} as const satisfies Record<string, readonly [number, number]>;

export type NumKey = keyof typeof PARAM_RANGES;
export const NUM_KEYS = Object.keys(PARAM_RANGES) as NumKey[];

export type SfxParams = { wave: Wave; seed: number } & Record<NumKey, number>;

export const MAX_SEED = 0xffffffff;

export function defaultParams(): SfxParams {
  return {
    wave: "square",
    seed: 1,
    attack: 0,
    sustain: 0.3,
    punch: 0,
    decay: 0.4,
    baseFreq: 0.3,
    freqLimit: 0,
    freqRamp: 0,
    freqDramp: 0,
    vibStrength: 0,
    vibSpeed: 0,
    arpMod: 0,
    arpSpeed: 0,
    duty: 0,
    dutyRamp: 0,
    repeatSpeed: 0,
    lpfFreq: 1,
    lpfRamp: 0,
    lpfResonance: 0,
    hpfFreq: 0,
    hpfRamp: 0,
    volume: 0.5,
  };
}

export function isWave(value: unknown): value is Wave {
  return typeof value === "string" && (WAVES as readonly string[]).includes(value);
}

export function clampParam(key: NumKey, value: number): number {
  const [min, max] = PARAM_RANGES[key];
  if (!Number.isFinite(value)) return defaultParams()[key];
  return Math.min(max, Math.max(min, value));
}

export function clampParams(input: SfxParams): SfxParams {
  const out = { ...input };
  for (const key of NUM_KEYS) out[key] = clampParam(key, input[key]);
  out.wave = isWave(input.wave) ? input.wave : "square";
  out.seed = Number.isInteger(input.seed) ? Math.min(MAX_SEED, Math.max(0, input.seed)) : 1;
  return out;
}

/**
 * Strict check for imported or stored data. Every known number must be finite and
 * inside its range, the wave must be known, the seed an unsigned 32-bit integer.
 * Unknown keys are dropped. Returns null when anything is off.
 */
export function validateParams(data: unknown): SfxParams | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const rec = data as Record<string, unknown>;
  if (!isWave(rec.wave)) return null;
  const seed = rec.seed;
  if (typeof seed !== "number" || !Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) return null;
  const out = defaultParams();
  out.wave = rec.wave;
  out.seed = seed;
  for (const key of NUM_KEYS) {
    const value = rec[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    const [min, max] = PARAM_RANGES[key];
    if (value < min || value > max) return null;
    out[key] = value;
  }
  return out;
}

export function sameParams(a: SfxParams, b: SfxParams): boolean {
  if (a.wave !== b.wave || a.seed !== b.seed) return false;
  return NUM_KEYS.every((key) => a[key] === b[key]);
}
