import { validateParams, type SfxParams } from "./params.ts";

// What this page stores.
//
// localStorage key `consolecheat-sfx-v1`:
//
//   {
//     "schema": "consolecheat-sfx",
//     "version": 1,
//     "sounds": [
//       { "id": "s-…", "name": "Sprung 1", "created": 1731960000000, "params": { …SfxParams } }
//     ]
//   }
//
// A single exported sound (JSON file) looks like:
//
//   { "schema": "consolecheat-sfx-sound", "version": 1, "name": "Sprung 1", "params": { … } }

export const LIBRARY_KEY = "consolecheat-sfx-v1";
export const LANG_KEY = "consolecheat-lang";
export const THEME_KEY = "consolecheat-theme";
export const LIBRARY_SCHEMA = "consolecheat-sfx";
export const SOUND_SCHEMA = "consolecheat-sfx-sound";
export const LIBRARY_VERSION = 1;
export const MAX_SOUNDS = 200;
export const MAX_NAME = 60;
export const MAX_IMPORT_CHARS = 20000;

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type SavedSound = { id: string; name: string; created: number; params: SfxParams };
export type Library = { sounds: SavedSound[] };
export type LoadResult = { library: Library; corrupt: boolean };

export function emptyLibrary(): Library {
  return { sounds: [] };
}

export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
}

function parseSound(data: unknown): SavedSound | null {
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  if (typeof rec.id !== "string" || !rec.id || rec.id.length > 80) return null;
  if (typeof rec.name !== "string") return null;
  const name = cleanName(rec.name);
  if (!name) return null;
  const created = typeof rec.created === "number" && Number.isFinite(rec.created) ? rec.created : 0;
  const params = validateParams(rec.params);
  if (!params) return null;
  return { id: rec.id, name, created, params };
}

/**
 * Never throws. Missing key: empty, not corrupt. Unreadable JSON, a foreign schema,
 * or another version: empty and `corrupt: true`. Single broken entries are skipped.
 */
export function parseLibrary(raw: string | null): LoadResult {
  if (raw == null) return { library: emptyLibrary(), corrupt: false };
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object") return { library: emptyLibrary(), corrupt: true };
    const rec = data as Record<string, unknown>;
    if (rec.schema !== LIBRARY_SCHEMA || rec.version !== LIBRARY_VERSION || !Array.isArray(rec.sounds)) {
      return { library: emptyLibrary(), corrupt: true };
    }
    const sounds: SavedSound[] = [];
    const ids = new Set<string>();
    let skipped = false;
    for (const item of rec.sounds.slice(0, MAX_SOUNDS)) {
      const sound = parseSound(item);
      if (!sound || ids.has(sound.id)) {
        skipped = true;
        continue;
      }
      ids.add(sound.id);
      sounds.push(sound);
    }
    return { library: { sounds }, corrupt: skipped };
  } catch {
    return { library: emptyLibrary(), corrupt: true };
  }
}

export function serializeLibrary(library: Library): string {
  return JSON.stringify({ schema: LIBRARY_SCHEMA, version: LIBRARY_VERSION, sounds: library.sounds });
}

export function loadLibrary(local: StorageLike): LoadResult {
  try {
    return parseLibrary(local.getItem(LIBRARY_KEY));
  } catch {
    return { library: emptyLibrary(), corrupt: false };
  }
}

export function saveLibrary(local: StorageLike, library: Library): boolean {
  try {
    local.setItem(LIBRARY_KEY, serializeLibrary(library));
    return true;
  } catch {
    return false;
  }
}

/** Removes only `consolecheat-sfx-v1`. Language, theme, and every other key stay. */
export function resetLibrary(local: StorageLike): boolean {
  try {
    local.removeItem(LIBRARY_KEY);
    return true;
  } catch {
    return false;
  }
}

export type AddResult = { ok: true; library: Library; sound: SavedSound } | { ok: false; reason: "name" | "full" };

export function addSound(library: Library, name: string, params: SfxParams, id: string, now: number): AddResult {
  const clean = cleanName(name);
  if (!clean) return { ok: false, reason: "name" };
  if (library.sounds.length >= MAX_SOUNDS) return { ok: false, reason: "full" };
  const sound: SavedSound = { id, name: clean, created: now, params: { ...params } };
  return { ok: true, library: { sounds: [sound, ...library.sounds] }, sound };
}

export function renameSound(library: Library, id: string, name: string): Library | null {
  const clean = cleanName(name);
  if (!clean || !library.sounds.some((sound) => sound.id === id)) return null;
  return { sounds: library.sounds.map((sound) => (sound.id === id ? { ...sound, name: clean } : sound)) };
}

export function deleteSound(library: Library, id: string): Library {
  return { sounds: library.sounds.filter((sound) => sound.id !== id) };
}

export function findSound(library: Library, id: string): SavedSound | undefined {
  return library.sounds.find((sound) => sound.id === id);
}

export function exportSound(name: string, params: SfxParams): string {
  return `${JSON.stringify({ schema: SOUND_SCHEMA, version: LIBRARY_VERSION, name: cleanName(name) || "sfx", params }, null, 2)}\n`;
}

export type ImportError = "size" | "json" | "schema" | "version" | "name" | "params";
export type ImportResult = { ok: true; name: string; params: SfxParams } | { ok: false; error: ImportError };

/** Validates an exported sound file. Never throws. */
export function parseSoundImport(text: string): ImportResult {
  if (text.length > MAX_IMPORT_CHARS) return { ok: false, error: "size" };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "json" };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, error: "schema" };
  const rec = data as Record<string, unknown>;
  if (rec.schema !== SOUND_SCHEMA) return { ok: false, error: "schema" };
  if (rec.version !== LIBRARY_VERSION) return { ok: false, error: "version" };
  if (typeof rec.name !== "string" || !cleanName(rec.name)) return { ok: false, error: "name" };
  const params = validateParams(rec.params);
  if (!params) return { ok: false, error: "params" };
  return { ok: true, name: cleanName(rec.name), params };
}

export function newId(now: number, salt: number): string {
  return `s-${now.toString(36)}-${(salt >>> 0).toString(36)}`;
}

export function fileSlug(name: string): string {
  const slug = cleanName(name)
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "sfx";
}
