import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { LIBRARY_KEY } from "./library.ts";
import { copy, fill, initialLang, languageOptions } from "./messages.ts";
import { NUM_KEYS, WAVES } from "./params.ts";
import { PRESETS } from "./presets.ts";

function leaves(value: unknown, prefix = ""): string[] {
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, inner]) => leaves(inner, prefix ? `${prefix}.${key}` : key));
  }
  return [prefix];
}

function read(lang: "de" | "en", key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => {
    if (!node || typeof node !== "object") return undefined;
    return (node as Record<string, unknown>)[part];
  }, copy[lang]);
}

test("German is the default and English has the same keys", () => {
  assert.equal(languageOptions[0]?.id, "de");
  assert.deepEqual(languageOptions.map((item) => item.id), ["de", "en"]);
  assert.equal(initialLang(null), "de");
  assert.equal(initialLang("fr"), "de");
  assert.equal(initialLang("en"), "en");
  assert.deepEqual(leaves(copy.de).sort(), leaves(copy.en).sort());
  for (const key of leaves(copy.de)) {
    const de = read("de", key);
    const en = read("en", key);
    assert.equal(typeof de, "string", key);
    assert.equal(typeof en, "string", key);
    assert.ok(String(de).trim() && String(en).trim(), key);
    const holes = (s: unknown) => (String(s).match(/\{[A-Za-z0-9]+\}/g) ?? []).sort();
    assert.deepEqual(holes(de), holes(en), `placeholders differ in ${key}`);
  }
});

test("every param, wave, and preset has a label in both languages", () => {
  for (const lang of ["de", "en"] as const) {
    for (const key of NUM_KEYS) assert.ok(copy[lang].params[key], `${lang} ${key}`);
    for (const wave of WAVES) assert.ok(copy[lang].waves[wave], `${lang} ${wave}`);
    for (const id of PRESETS) assert.ok(copy[lang].presets[id], `${lang} ${id}`);
  }
  assert.equal(copy.de.presets.jump, "Sprung");
  assert.equal(copy.de.presets.coin, "Münze");
  assert.equal(copy.de.presets.explosion, "Explosion");
  assert.equal(copy.de.presets.powerup, "Power-up");
  assert.equal(copy.de.random, "Zufall");
  assert.equal(copy.de.toolsHeading, "Weitere Werkzeuge");
  assert.equal(copy.en.toolsHeading, "Other tools");
});

test("copy names the storage key, the controls, and stays unofficial", () => {
  assert.match(copy.de.storageNote, new RegExp(LIBRARY_KEY));
  assert.match(copy.en.storageNote, new RegExp(LIBRARY_KEY));
  assert.match(copy.de.deleteAsk, new RegExp(LIBRARY_KEY));
  assert.match(copy.de.controls, /Leertaste/);
  assert.match(copy.de.controls, /Strg\+Z/);
  assert.match(copy.en.controls, /Ctrl\+Z/);
  assert.match(copy.de.controls, /×/);
  assert.match(copy.de.controls, /△/);
  assert.match(copy.de.unofficial, /Nicht von Sony/);
  assert.equal(fill("{a} und {b}", { a: 1 }), "1 und {b}");
});

test("the page wires aria-live, labelled sliders, outputs, and reduced motion", () => {
  const ui = readFileSync(new URL("./Generator.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  assert.match(ui, /aria-live="polite"/);
  assert.match(ui, /<output htmlFor=\{id\}/);
  assert.match(ui, /<label htmlFor=\{id\}/);
  assert.match(ui, /aria-valuetext/);
  assert.match(ui, /aria-keyshortcuts/);
  assert.match(ui, /prefers-reduced-motion/);
  assert.match(ui, /requestAnimationFrame\(poll\)/);
  assert.match(ui, /getGamepads/);
  assert.match(ui, /new Ctor\(\)/);
  assert.doesNotMatch(ui, /new (window\.)?AudioContext\(/, "the context is created lazily in ensureAudio");
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /390px/);
});
