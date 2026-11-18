import { MAX_SEED, type SfxParams } from "./params.ts";
import { generatePreset, randomParams, type PresetId } from "./presets.ts";

// The seed field: which generator made the current sound, and with which seed.
// Pure, so the tests can check that the same seed always gives the same sound.

export type SeedSource = { kind: "preset"; preset: PresetId } | { kind: "random" };

/** A decimal integer from 0 to MAX_SEED, surrounding spaces allowed. Anything else is null. */
export function parseSeed(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d{1,10}$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value <= MAX_SEED ? value : null;
}

/** Regenerates with the given preset or Zufall. Same source and seed, same params. */
export function paramsFromSeed(source: SeedSource, seed: number): SfxParams {
  return source.kind === "preset" ? generatePreset(source.preset, seed) : randomParams(seed);
}

/**
 * The seed the field shows. `cleared` is the params object that was current when a sound was
 * loaded from the library or a file. The history skips a load with identical params, so the
 * present object can still carry its seed; marking it cleared hides the seed anyway.
 */
export function shownSeed<P extends object>(params: P, lookup: (params: P) => number | undefined, cleared: P | null): number | null {
  if (cleared !== null && params === cleared) return null;
  return lookup(params) ?? null;
}
