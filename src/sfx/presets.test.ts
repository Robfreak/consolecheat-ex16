import assert from "node:assert/strict";
import test from "node:test";
import { NUM_KEYS, PARAM_RANGES, validateParams, WAVES } from "./params.ts";
import { generatePreset, MAIN_PRESETS, PRESETS, randomParams } from "./presets.ts";
import { mulberry32 } from "./prng.ts";

test("the PRNG is seedable and repeatable", () => {
  const a = mulberry32(123);
  const b = mulberry32(123);
  const c = mulberry32(124);
  const seqA = Array.from({ length: 5 }, a);
  assert.deepEqual(seqA, Array.from({ length: 5 }, b));
  assert.notDeepEqual(seqA, Array.from({ length: 5 }, c));
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
});

test("presets cover jump, coin, explosion, power-up (keys 1–4) plus laser and hit", () => {
  assert.deepEqual([...MAIN_PRESETS], ["jump", "coin", "explosion", "powerup"]);
  assert.ok(PRESETS.includes("laser"));
  assert.ok(PRESETS.includes("hit"));
});

test("every preset keeps every param inside its range for many seeds", () => {
  for (let seed = 0; seed < 300; seed++) {
    for (const p of [...PRESETS.map((id) => generatePreset(id, seed)), randomParams(seed)]) {
      assert.ok(WAVES.includes(p.wave));
      assert.ok(Number.isInteger(p.seed) && p.seed >= 0 && p.seed <= 0xffffffff);
      for (const key of NUM_KEYS) {
        const [min, max] = PARAM_RANGES[key];
        assert.ok(p[key] >= min && p[key] <= max, `${key}=${p[key]} seed ${seed}`);
      }
      assert.ok(validateParams(JSON.parse(JSON.stringify(p))), "valid after a JSON round trip");
    }
  }
});

test("each preset has its character", () => {
  for (let seed = 0; seed < 100; seed++) {
    const jump = generatePreset("jump", seed);
    assert.equal(jump.wave, "square");
    assert.ok(jump.freqRamp >= 0.1 && jump.freqRamp <= 0.3, "jump rises");
    assert.ok(jump.baseFreq >= 0.3 && jump.baseFreq <= 0.6);

    const coin = generatePreset("coin", seed);
    assert.ok(coin.punch >= 0.3 && coin.punch <= 0.6);
    assert.ok(coin.arpMod >= 0.2 && coin.arpMod <= 0.6, "coin jumps up");
    assert.ok(coin.baseFreq >= 0.4 && coin.baseFreq <= 0.9);

    const boom = generatePreset("explosion", seed);
    assert.equal(boom.wave, "noise");
    assert.ok(boom.punch >= 0.2 && boom.punch <= 0.8);
    assert.ok(boom.decay >= 0.2);

    const up = generatePreset("powerup", seed);
    assert.ok(up.wave === "square" || up.wave === "sawtooth");
    assert.ok(up.freqRamp >= 0.05 && up.freqRamp <= 0.5, "power-up rises");

    const laser = generatePreset("laser", seed);
    assert.ok(laser.freqRamp < 0, "laser falls");

    const hit = generatePreset("hit", seed);
    assert.ok(hit.freqRamp <= -0.3);
  }
});

test("random params are deterministic for one seed and audible", () => {
  assert.deepEqual(randomParams(99), randomParams(99));
  assert.notDeepEqual(randomParams(99), randomParams(100));
  for (let seed = 0; seed < 200; seed++) {
    const p = randomParams(seed);
    assert.ok(p.attack + p.sustain + p.decay >= 0.2, `length at seed ${seed}`);
    assert.equal(p.volume, 0.5);
  }
});
