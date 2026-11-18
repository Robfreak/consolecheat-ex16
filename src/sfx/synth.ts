import { clampParams, type SfxParams } from "./params.ts";
import { mulberry32 } from "./prng.ts";

// Pure sfxr-style synthesizer. Same params (including `seed`), same samples.
// No Web Audio here, so it runs in node:test and in the browser alike.

export const SAMPLE_RATE = 44100;
const SUPERSAMPLE = 8;

/** Samples per envelope stage: attack, sustain, decay. Each stage lasts at least one sample. */
export function envelopeLengths(input: SfxParams): [number, number, number] {
  const p = clampParams(input);
  const len = (x: number) => Math.max(1, Math.floor(x * x * 100000));
  return [len(p.attack), len(p.sustain), len(p.decay)];
}

/** Sample count when the frequency limit does not cut the sound short. */
export function expectedLength(input: SfxParams): number {
  const [a, s, d] = envelopeLengths(input);
  return a + s + d;
}

/** Approximate start pitch in Hz for display. */
export function baseFrequencyHz(baseFreq: number): number {
  return (SAMPLE_RATE * SUPERSAMPLE * (baseFreq * baseFreq + 0.001)) / 100;
}

export function renderSfx(input: SfxParams): Float32Array {
  const p = clampParams(input);
  const rand = mulberry32(p.seed);
  const lengths = envelopeLengths(p);
  const total = lengths[0] + lengths[1] + lengths[2];
  const out = new Float32Array(total);

  let fperiod = 0;
  let fmaxperiod = 0;
  let fslide = 0;
  let fdslide = 0;
  let squareDuty = 0;
  let squareSlide = 0;
  let arpMod = 1;
  let arpTime = 0;
  let arpLimit = 0;

  const resetPitch = () => {
    fperiod = 100 / (p.baseFreq * p.baseFreq + 0.001);
    fmaxperiod = 100 / (p.freqLimit * p.freqLimit + 0.001);
    fslide = 1 - p.freqRamp ** 3 * 0.01;
    fdslide = -(p.freqDramp ** 3) * 0.000001;
    squareDuty = 0.5 - p.duty * 0.5;
    squareSlide = -p.dutyRamp * 0.00005;
    arpMod = p.arpMod >= 0 ? 1 - p.arpMod * p.arpMod * 0.9 : 1 + p.arpMod * p.arpMod * 10;
    arpTime = 0;
    arpLimit = p.arpSpeed >= 1 || p.arpMod === 0 ? 0 : Math.floor((1 - p.arpSpeed) ** 2 * 20000 + 32);
  };
  resetPitch();

  let fltp = 0;
  let fltdp = 0;
  let fltw = p.lpfFreq ** 3 * 0.1;
  const fltwD = 1 + p.lpfRamp * 0.0001;
  const fltdmp = Math.min(0.8, (5 / (1 + p.lpfResonance ** 2 * 20)) * (0.01 + fltw));
  let fltphp = 0;
  let flthp = p.hpfFreq * p.hpfFreq * 0.1;
  const flthpD = 1 + p.hpfRamp * 0.0003;

  let vibPhase = 0;
  const vibSpeed = p.vibSpeed * p.vibSpeed * 0.01;
  const vibAmp = p.vibStrength * 0.5;

  const noise = new Float32Array(32);
  const refillNoise = () => {
    for (let i = 0; i < noise.length; i++) noise[i] = rand() * 2 - 1;
  };
  refillNoise();

  let phase = 0;
  let repTime = 0;
  const repLimit = p.repeatSpeed <= 0 ? 0 : Math.floor((1 - p.repeatSpeed) ** 2 * 20000 + 32);
  let stage = 0;
  let envTime = 0;

  for (let i = 0; i < total; i++) {
    if (repLimit !== 0 && ++repTime >= repLimit) {
      repTime = 0;
      resetPitch();
    }
    arpTime++;
    if (arpLimit !== 0 && arpTime >= arpLimit) {
      arpLimit = 0;
      fperiod *= arpMod;
    }
    fslide += fdslide;
    fperiod *= fslide;
    if (fperiod > fmaxperiod) {
      fperiod = fmaxperiod;
      if (p.freqLimit > 0) return out.slice(0, i);
    }
    let rfperiod = fperiod;
    if (vibAmp > 0) {
      vibPhase += vibSpeed;
      rfperiod = fperiod * (1 + Math.sin(vibPhase) * vibAmp);
    }
    const period = Math.max(SUPERSAMPLE, Math.floor(rfperiod));
    squareDuty = Math.min(0.5, Math.max(0, squareDuty + squareSlide));

    const length = lengths[stage] ?? 1;
    let env: number;
    if (stage === 0) env = envTime / length;
    else if (stage === 1) env = 1 + (1 - envTime / length) * 2 * p.punch;
    else env = 1 - envTime / length;
    envTime++;
    if (envTime >= length) {
      envTime = 0;
      stage++;
    }

    if (flthpD !== 1) flthp = Math.min(0.1, Math.max(0.00001, flthp * flthpD));

    let sum = 0;
    for (let si = 0; si < SUPERSAMPLE; si++) {
      phase++;
      if (phase >= period) {
        phase %= period;
        if (p.wave === "noise") refillNoise();
      }
      const fp = phase / period;
      let sample: number;
      switch (p.wave) {
        case "square":
          sample = fp < squareDuty ? 0.5 : -0.5;
          break;
        case "sawtooth":
          sample = 1 - fp * 2;
          break;
        case "sine":
          sample = Math.sin(fp * 2 * Math.PI);
          break;
        case "triangle":
          sample = Math.abs(1 - fp * 2) * 2 - 1;
          break;
        default:
          sample = noise[Math.floor((phase * 32) / period) % 32] ?? 0;
      }
      const pp = fltp;
      fltw = Math.min(0.1, Math.max(0, fltw * fltwD));
      if (p.lpfFreq < 1) {
        fltdp += (sample - fltp) * fltw;
        fltdp -= fltdp * fltdmp;
      } else {
        fltp = sample;
        fltdp = 0;
      }
      fltp += fltdp;
      fltphp += fltp - pp;
      fltphp -= fltphp * flthp;
      sum += fltphp * env;
    }
    const value = (sum / SUPERSAMPLE) * p.volume * 1.5;
    out[i] = Math.min(1, Math.max(-1, value));
  }
  return out;
}
