import assert from "node:assert/strict";
import test from "node:test";
import { defaultParams, type SfxParams } from "./params.ts";
import { generatePreset, PRESETS, randomParams } from "./presets.ts";
import { envelopeLengths, expectedLength, renderSfx, SAMPLE_RATE } from "./synth.ts";

function tone(overrides: Partial<SfxParams>): SfxParams {
  return { ...defaultParams(), wave: "sine", lpfFreq: 1, hpfFreq: 0, punch: 0, ...overrides };
}

function crossings(samples: Float32Array, from: number, to: number): number {
  let count = 0;
  for (let i = from + 1; i < to; i++) {
    const a = samples[i - 1] ?? 0;
    const b = samples[i] ?? 0;
    if ((a <= 0 && b > 0) || (a >= 0 && b < 0)) count++;
  }
  return count;
}

test("the same params and seed render the same samples", () => {
  for (const id of PRESETS) {
    const a = renderSfx(generatePreset(id, 42));
    const b = renderSfx(generatePreset(id, 42));
    assert.equal(a.length, b.length, id);
    assert.deepEqual(Array.from(a), Array.from(b), id);
  }
  const noiseA = renderSfx(tone({ wave: "noise", seed: 7 }));
  const noiseB = renderSfx(tone({ wave: "noise", seed: 7 }));
  const noiseC = renderSfx(tone({ wave: "noise", seed: 8 }));
  assert.deepEqual(Array.from(noiseA), Array.from(noiseB));
  assert.notDeepEqual(Array.from(noiseA.slice(0, 2000)), Array.from(noiseC.slice(0, 2000)));
});

test("different preset seeds give different sounds", () => {
  const a = renderSfx(generatePreset("jump", 1));
  const b = renderSfx(generatePreset("jump", 2));
  assert.notDeepEqual(Array.from(a.slice(0, 500)), Array.from(b.slice(0, 500)));
});

test("the envelope sets the sample count", () => {
  const p = tone({ attack: 0.1, sustain: 0.2, decay: 0.3 });
  const [a, s, d] = envelopeLengths(p);
  assert.equal(a, Math.floor(0.1 * 0.1 * 100000));
  assert.equal(s, Math.floor(0.2 * 0.2 * 100000));
  assert.equal(d, Math.floor(0.3 * 0.3 * 100000));
  assert.equal(expectedLength(p), a + s + d);
  assert.equal(renderSfx(p).length, a + s + d);
  for (const wave of ["square", "sawtooth", "triangle", "noise"] as const) {
    assert.equal(renderSfx({ ...p, wave }).length, a + s + d, wave);
  }
  // Every stage lasts at least one sample.
  assert.equal(renderSfx(tone({ attack: 0, sustain: 0, decay: 0 })).length, 3);
  // Max length stays bounded (about 6.8 s at 44.1 kHz).
  assert.ok(expectedLength(tone({ attack: 1, sustain: 1, decay: 1 })) <= 3 * 100000);
  assert.equal(SAMPLE_RATE, 44100);
});

test("attack starts from silence and decay ends near silence", () => {
  const out = renderSfx(tone({ attack: 0.2, sustain: 0.2, decay: 0.2, wave: "square" }));
  assert.equal(out[0], 0);
  const tail = out.slice(-20);
  for (const v of tail) assert.ok(Math.abs(v) < 0.02, String(v));
});

test("a positive slide sweeps up and a negative slide sweeps down", () => {
  const up = renderSfx(tone({ baseFreq: 0.25, freqRamp: 0.3, sustain: 0.4, decay: 0.1 }));
  const quarter = Math.floor(up.length / 4);
  assert.ok(crossings(up, up.length - 2 * quarter, up.length - quarter) > crossings(up, 0, quarter) * 1.3);

  const down = renderSfx(tone({ baseFreq: 0.6, freqRamp: -0.3, sustain: 0.4, decay: 0.1 }));
  const q2 = Math.floor(down.length / 4);
  assert.ok(crossings(down, down.length - 2 * q2, down.length - q2) < crossings(down, 0, q2) * 0.77);

  const flat = renderSfx(tone({ baseFreq: 0.4, freqRamp: 0, sustain: 0.4, decay: 0.1 }));
  const q3 = Math.floor(flat.length / 4);
  const first = crossings(flat, 0, q3);
  const later = crossings(flat, q3, 2 * q3);
  assert.ok(Math.abs(first - later) <= 2, `${first} vs ${later}`);
});

test("a frequency limit ends a falling sweep early", () => {
  const p = tone({ baseFreq: 0.5, freqRamp: -0.5, freqLimit: 0.3, sustain: 0.5, decay: 0.3 });
  const out = renderSfx(p);
  assert.ok(out.length > 0);
  assert.ok(out.length < expectedLength(p));
});

test("every preset and random roll renders finite samples within -1..1", () => {
  for (let seed = 1; seed <= 12; seed++) {
    const all = [...PRESETS.map((id) => generatePreset(id, seed)), randomParams(seed)];
    for (const p of all) {
      const out = renderSfx(p);
      assert.ok(out.length > 0);
      let peak = 0;
      for (const v of out) {
        assert.ok(Number.isFinite(v));
        assert.ok(v >= -1 && v <= 1);
        peak = Math.max(peak, Math.abs(v));
      }
      if (p.volume > 0 && p.wave !== "noise") assert.ok(peak > 0, `${p.wave} seed ${seed} is silent`);
    }
  }
});
