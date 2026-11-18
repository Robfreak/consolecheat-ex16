import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isTypingTarget, keyAction, shortcutAllowed } from "./input.ts";
import { MAX_SEED } from "./params.ts";
import { generatePreset, PRESETS, randomParams } from "./presets.ts";
import { paramsFromSeed, parseSeed } from "./seed.ts";

test("the same seed gives the same params, for every preset and for Zufall", () => {
  for (const seed of [0, 1, 42, 20261118, MAX_SEED]) {
    for (const preset of PRESETS) {
      const a = paramsFromSeed({ kind: "preset", preset }, seed);
      assert.deepEqual(a, paramsFromSeed({ kind: "preset", preset }, seed), `${preset} ${seed}`);
      assert.deepEqual(a, generatePreset(preset, seed));
    }
    assert.deepEqual(paramsFromSeed({ kind: "random" }, seed), paramsFromSeed({ kind: "random" }, seed));
    assert.deepEqual(paramsFromSeed({ kind: "random" }, seed), randomParams(seed));
  }
  assert.notDeepEqual(paramsFromSeed({ kind: "random" }, 1), paramsFromSeed({ kind: "random" }, 2));
  assert.notDeepEqual(paramsFromSeed({ kind: "preset", preset: "coin" }, 7), paramsFromSeed({ kind: "preset", preset: "jump" }, 7));
});

test("seed input accepts whole numbers from 0 to 4294967295 only", () => {
  assert.equal(parseSeed("0"), 0);
  assert.equal(parseSeed(" 20261118 "), 20261118);
  assert.equal(parseSeed("4294967295"), MAX_SEED);
  for (const bad of ["", " ", "-1", "1.5", "1e3", "0x10", "abc", "4294967296", "99999999999", "12 34"]) {
    assert.equal(parseSeed(bad), null, bad);
  }
});

test("shortcuts stay off while the seed field has focus, and the field is wired up", () => {
  const field = { tagName: "INPUT", type: "text" };
  assert.ok(isTypingTarget(field));
  for (const key of [" ", "1", "r", "z"]) {
    const action = keyAction({ key, ctrlKey: key === "z" });
    assert.ok(action, key);
    assert.equal(shortcutAllowed(action, field), false, key);
  }
  const ui = readFileSync(new URL("./Generator.tsx", import.meta.url), "utf8");
  assert.match(ui, /id="sfx-seed"/);
  assert.match(ui, /htmlFor="sfx-seed"/);
  assert.match(ui, /type="text"/);
  assert.match(ui, /inputMode="numeric"/);
  assert.match(ui, /paramsFromSeed\(source, seed\)/);
  const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  assert.match(styles, /\.seed-apply/);
});
