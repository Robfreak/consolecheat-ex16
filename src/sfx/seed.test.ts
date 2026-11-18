import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isTypingTarget, keyAction, shortcutAllowed } from "./input.ts";
import { MAX_SEED } from "./params.ts";
import { generatePreset, PRESETS, randomParams } from "./presets.ts";
import { commit, createHistory } from "./history.ts";
import { sameParams } from "./params.ts";
import { paramsFromSeed, parseSeed, shownSeed } from "./seed.ts";

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

test("a sound loaded from the library or a file shows no seed, even with identical params", () => {
  const seeds = new WeakMap<object, number>();
  const lookup = (p: object) => seeds.get(p);
  const generated = paramsFromSeed({ kind: "preset", preset: "coin" }, 4242);
  seeds.set(generated, 4242);
  let history = createHistory(generated);
  assert.equal(shownSeed(history.present, lookup, null), 4242);

  // Save, then load the same sound again: the history keeps the old object because the params are equal.
  const loaded = { ...generated };
  history = commit(history, loaded, { equal: sameParams });
  assert.equal(history.present, generated, "identical params do not add a history entry");
  const cleared = sameParams(loaded, generated) ? generated : loaded;
  assert.equal(shownSeed(history.present, lookup, cleared), null, "the seed field is empty after the load");

  // A loaded sound with different params is a new, unseeded object.
  const other = { ...paramsFromSeed({ kind: "random" }, 9), volume: 0.3 };
  history = commit(history, other, { equal: sameParams });
  assert.equal(shownSeed(history.present, lookup, other), null);

  // Generating again shows the new seed.
  const fresh = paramsFromSeed({ kind: "random" }, 77);
  seeds.set(fresh, 77);
  history = commit(history, fresh, { equal: sameParams });
  assert.equal(shownSeed(history.present, lookup, other), 77);

  const ui = readFileSync(new URL("./Generator.tsx", import.meta.url), "utf8");
  assert.equal(ui.match(/setCleared\(sameParams\(/g)?.length, 2, "library load and JSON import both clear the seed");
});
