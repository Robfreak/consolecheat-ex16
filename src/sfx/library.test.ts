import assert from "node:assert/strict";
import test from "node:test";
import {
  addSound,
  deleteSound,
  emptyLibrary,
  exportSound,
  fileSlug,
  LANG_KEY,
  LIBRARY_KEY,
  loadLibrary,
  MAX_SOUNDS,
  parseLibrary,
  parseSoundImport,
  renameSound,
  resetLibrary,
  saveLibrary,
  serializeLibrary,
  THEME_KEY,
  type StorageLike,
} from "./library.ts";
import { defaultParams, validateParams } from "./params.ts";
import { generatePreset } from "./presets.ts";

function memory(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, String(value)),
    removeItem: (key) => void data.delete(key),
  };
}

test("the storage key is consolecheat-sfx-v1", () => {
  assert.equal(LIBRARY_KEY, "consolecheat-sfx-v1");
});

test("save, list, load, rename, and delete persist through storage", () => {
  const store = memory();
  assert.deepEqual(loadLibrary(store), { library: emptyLibrary(), corrupt: false });
  assert.equal(store.data.has(LIBRARY_KEY), false, "loading does not create the key");

  const jump = generatePreset("jump", 3);
  const first = addSound(emptyLibrary(), "  Sprung   1 ", jump, "s-1", 100);
  assert.ok(first.ok);
  if (!first.ok) return;
  assert.equal(first.sound.name, "Sprung 1");
  const second = addSound(first.library, "Münze", generatePreset("coin", 4), "s-2", 200);
  assert.ok(second.ok);
  if (!second.ok) return;
  assert.ok(saveLibrary(store, second.library));

  const raw = JSON.parse(store.data.get(LIBRARY_KEY) ?? "{}");
  assert.equal(raw.schema, "consolecheat-sfx");
  assert.equal(raw.version, 1);

  const loaded = loadLibrary(store);
  assert.equal(loaded.corrupt, false);
  assert.deepEqual(loaded.library.sounds.map((s) => s.name), ["Münze", "Sprung 1"]);
  assert.deepEqual(loaded.library.sounds[1]?.params, jump);

  const renamed = renameSound(loaded.library, "s-1", "Hüpfer");
  assert.ok(renamed);
  assert.equal(renameSound(loaded.library, "s-1", "   "), null);
  assert.equal(renameSound(loaded.library, "nope", "x"), null);
  const removed = deleteSound(renamed!, "s-2");
  assert.ok(saveLibrary(store, removed));
  assert.deepEqual(loadLibrary(store).library.sounds.map((s) => s.name), ["Hüpfer"]);
});

test("names are required and the library is capped", () => {
  assert.deepEqual(addSound(emptyLibrary(), "   ", defaultParams(), "x", 0), { ok: false, reason: "name" });
  let lib = emptyLibrary();
  for (let i = 0; i < MAX_SOUNDS; i++) {
    const r = addSound(lib, `s${i}`, defaultParams(), `id-${i}`, i);
    assert.ok(r.ok);
    if (r.ok) lib = r.library;
  }
  assert.deepEqual(addSound(lib, "one more", defaultParams(), "z", 0), { ok: false, reason: "full" });
  assert.equal(addSound(emptyLibrary(), "x".repeat(100), defaultParams(), "y", 0).ok, true);
  const long = addSound(emptyLibrary(), "x".repeat(100), defaultParams(), "y", 0);
  if (long.ok) assert.equal(long.sound.name.length, 60);
});

test("corrupt or foreign data falls back to an empty library without throwing", () => {
  for (const raw of ["{", "null", "42", "[]", '"x"', '{"schema":"other","version":1,"sounds":[]}', '{"schema":"consolecheat-sfx","version":2,"sounds":[]}', '{"schema":"consolecheat-sfx","version":1,"sounds":{}}']) {
    const result = parseLibrary(raw);
    assert.deepEqual(result.library, emptyLibrary(), raw);
    assert.equal(result.corrupt, true, raw);
  }
  const good = addSound(emptyLibrary(), "ok", defaultParams(), "a", 1);
  assert.ok(good.ok);
  if (!good.ok) return;
  const mixed = JSON.parse(serializeLibrary(good.library));
  mixed.sounds.push({ id: "b", name: "bad", params: { ...defaultParams(), decay: 7 } });
  mixed.sounds.push({ id: "a", name: "dupe", params: defaultParams() });
  mixed.sounds.push("junk");
  const partial = parseLibrary(JSON.stringify(mixed));
  assert.deepEqual(partial.library.sounds.map((s) => s.name), ["ok"]);
  assert.equal(partial.corrupt, true);

  const throwing: StorageLike = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("full");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  assert.deepEqual(loadLibrary(throwing).library, emptyLibrary());
  assert.equal(saveLibrary(throwing, emptyLibrary()), false);
  assert.equal(resetLibrary(throwing), false);
});

test("reset removes only consolecheat-sfx-v1", () => {
  const store = memory({
    [LIBRARY_KEY]: serializeLibrary(emptyLibrary()),
    [LANG_KEY]: "en",
    [THEME_KEY]: "light",
    "consolecheat-sprite-v1": "{}",
    "consolecheat-chiptune-v1": "{}",
    "consolecheat-ex6-merkliste-v1": "[]",
  });
  assert.ok(resetLibrary(store));
  assert.equal(store.data.has(LIBRARY_KEY), false);
  assert.deepEqual([...store.data.keys()].sort(), [
    "consolecheat-chiptune-v1",
    "consolecheat-ex6-merkliste-v1",
    "consolecheat-sprite-v1",
    LANG_KEY,
    THEME_KEY,
  ].sort());
});

test("a sound exports to JSON and imports back", () => {
  const params = generatePreset("explosion", 11);
  const text = exportSound("Bumm!", params);
  const parsed = JSON.parse(text);
  assert.equal(parsed.schema, "consolecheat-sfx-sound");
  assert.equal(parsed.version, 1);
  const back = parseSoundImport(text);
  assert.ok(back.ok);
  if (back.ok) {
    assert.equal(back.name, "Bumm!");
    assert.deepEqual(back.params, params);
  }
});

test("import validation rejects bad files with a reason", () => {
  const good = JSON.parse(exportSound("x", defaultParams()));
  const make = (patch: (value: Record<string, unknown>) => void) => {
    const copy = structuredClone(good);
    patch(copy);
    return JSON.stringify(copy);
  };
  assert.deepEqual(parseSoundImport("not json"), { ok: false, error: "json" });
  assert.deepEqual(parseSoundImport("[]"), { ok: false, error: "schema" });
  assert.deepEqual(parseSoundImport("x".repeat(30000)), { ok: false, error: "size" });
  assert.deepEqual(parseSoundImport(make((v) => (v.schema = "other"))), { ok: false, error: "schema" });
  assert.deepEqual(parseSoundImport(make((v) => (v.version = 2))), { ok: false, error: "version" });
  assert.deepEqual(parseSoundImport(make((v) => (v.name = "  "))), { ok: false, error: "name" });
  assert.deepEqual(parseSoundImport(make((v) => ((v.params as Record<string, unknown>).wave = "organ"))), { ok: false, error: "params" });
  assert.deepEqual(parseSoundImport(make((v) => ((v.params as Record<string, unknown>).decay = 1.5))), { ok: false, error: "params" });
  assert.deepEqual(parseSoundImport(make((v) => ((v.params as Record<string, unknown>).freqRamp = "0.1"))), { ok: false, error: "params" });
  assert.deepEqual(parseSoundImport(make((v) => delete (v.params as Record<string, unknown>).volume)), { ok: false, error: "params" });
  assert.deepEqual(parseSoundImport(make((v) => ((v.params as Record<string, unknown>).seed = -1))), { ok: false, error: "params" });
  assert.deepEqual(parseSoundImport(make((v) => ((v.params as Record<string, unknown>).seed = 1.5))), { ok: false, error: "params" });
  const extra = parseSoundImport(make((v) => ((v.params as Record<string, unknown>).evil = "<script>")));
  assert.ok(extra.ok, "unknown keys are dropped");
  if (extra.ok) assert.equal("evil" in extra.params, false);
  assert.equal(validateParams(null), null);
});

test("file names are slugged", () => {
  assert.equal(fileSlug("Münze Groß!"), "muenze-gross");
  assert.equal(fileSlug("   "), "sfx");
});
