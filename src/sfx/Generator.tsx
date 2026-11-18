import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { canRedo, canUndo, commit, createHistory, redo, undo, type History } from "./history.ts";
import { DiceIcon, PlayIcon } from "./icons.tsx";
import { createPadTracker, isTypingTarget, keyAction, shortcutAllowed, type Action, type TargetLike } from "./input.ts";
import {
  addSound,
  deleteSound,
  exportSound,
  fileSlug,
  findSound,
  loadLibrary,
  MAX_SOUNDS,
  newId,
  parseSoundImport,
  renameSound,
  saveLibrary,
  type Library,
  type StorageLike,
} from "./library.ts";
import { fill, type Copy } from "./messages.ts";
import { PARAM_RANGES, sameParams, WAVES, type NumKey, type SfxParams, type Wave } from "./params.ts";
import { freshSeed } from "./prng.ts";
import { generatePreset, MAIN_PRESETS, PRESETS, randomParams, type PresetId } from "./presets.ts";
import { baseFrequencyHz, renderSfx, SAMPLE_RATE } from "./synth.ts";
import { encodeWav } from "./wav.ts";
import { paramsFromSeed, parseSeed, type SeedSource } from "./seed.ts";

const START_SEED = 20261118;

const GROUPS: { heading: keyof Copy; keys: NumKey[] }[] = [
  { heading: "envelopeHeading", keys: ["attack", "sustain", "punch", "decay"] },
  { heading: "pitchHeading", keys: ["baseFreq", "freqLimit", "freqRamp", "freqDramp"] },
  { heading: "modHeading", keys: ["vibStrength", "vibSpeed", "arpMod", "arpSpeed", "repeatSpeed"] },
  { heading: "filterHeading", keys: ["lpfFreq", "lpfRamp", "lpfResonance", "hpfFreq", "hpfRamp"] },
  { heading: "outputHeading", keys: ["volume"] },
];

// The seed each generated sound came from. Keyed by the params object, so undo and redo
// show the right seed, and a hand-edited or loaded sound shows none.
const seeds = new WeakMap<SfxParams, number>();
function seeded(params: SfxParams, seed: number): SfxParams {
  seeds.set(params, seed);
  return params;
}

const cache = new WeakMap<SfxParams, Float32Array>();
function render(params: SfxParams): Float32Array {
  let samples = cache.get(params);
  if (!samples) {
    samples = renderSfx(params);
    cache.set(params, samples);
  }
  return samples;
}

function browserStore(): StorageLike | null {
  try {
    localStorage.getItem("consolecheat-sfx-v1");
    return localStorage;
  } catch {
    return null;
  }
}

function targetOf(element: Element | EventTarget | null): TargetLike {
  if (!element || !(element instanceof HTMLElement)) return null;
  return {
    tagName: element.tagName,
    type: element instanceof HTMLInputElement ? element.type : undefined,
    isContentEditable: element.isContentEditable,
  };
}

function reducedMotion(): boolean {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function envMs(value: number): number {
  return Math.round(Math.max(1, Math.floor(value * value * 100000)) / (SAMPLE_RATE / 1000));
}

function signed(value: number): string {
  const text = value.toFixed(2);
  return value > 0 ? `+${text}` : text;
}

function display(key: NumKey, value: number, text: Copy): string {
  switch (key) {
    case "attack":
    case "sustain":
    case "decay":
      return `${envMs(value)} ms`;
    case "baseFreq":
      return `${Math.round(baseFrequencyHz(value))} Hz`;
    case "freqLimit":
      return value <= 0 ? text.off : `${Math.round(baseFrequencyHz(value))} Hz`;
    case "lpfFreq":
      return value >= 1 ? text.off : `${Math.round(value * 100)} %`;
    case "hpfFreq":
    case "repeatSpeed":
    case "vibStrength":
      return value <= 0 ? text.off : `${Math.round(value * 100)} %`;
    default:
      return PARAM_RANGES[key][0] < 0 ? signed(value) : `${Math.round(value * 100)} %`;
  }
}

function download(name: string, type: string, data: BlobPart) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function Slider({
  id,
  label,
  value,
  min,
  max,
  shown,
  disabled,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  shown: string;
  disabled?: boolean;
  hint?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="slider-row">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <label htmlFor={id} className="font-medium text-fg">
          {label}
        </label>
        <output htmlFor={id} id={`${id}-out`} className="font-mono text-xs text-muted">
          {shown}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value}
        disabled={disabled}
        aria-valuetext={shown}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Generator({ text }: { text: Copy }) {
  const [history, setHistory] = useState<History<SfxParams>>(() => createHistory(seeded(generatePreset("coin", START_SEED), START_SEED)));
  const params = history.present;
  const samples = useMemo(() => render(params), [params]);
  const [label, setLabel] = useState<string>(() => text.presets.coin);
  const [source, setSource] = useState<SeedSource>({ kind: "preset", preset: "coin" });
  const currentSeed = seeds.get(params) ?? null;
  const [seedDraft, setSeedDraft] = useState(() => String(START_SEED));
  useEffect(() => {
    setSeedDraft(currentSeed === null ? "" : String(currentSeed));
  }, [currentSeed, params]);
  const [name, setName] = useState("");
  const [notice, setNotice] = useState("");
  const [playing, setPlaying] = useState(false);
  const [store] = useState(browserStore);
  const [lib, setLib] = useState(() => (store ? loadLibrary(store) : { library: { sounds: [] }, corrupt: false }));
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [themeTick, setThemeTick] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const audio = useRef<{ ctx: AudioContext | null; source: AudioBufferSourceNode | null; frame: number }>({
    ctx: null,
    source: null,
    frame: 0,
  });
  const textRef = useRef(text);
  textRef.current = text;
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const say = (message: string) => setNotice(message);

  function update(next: SfxParams, key: string | null) {
    setHistory((current) => commit(current, next, { key, now: performance.now(), equal: sameParams }));
  }

  function setParam(key: NumKey, value: number) {
    update({ ...paramsRef.current, [key]: value }, key);
  }

  function setWave(wave: Wave) {
    update({ ...paramsRef.current, wave }, null);
  }

  function stop() {
    const state = audio.current;
    cancelAnimationFrame(state.frame);
    if (state.source) {
      state.source.onended = null;
      try {
        state.source.stop();
      } catch {
        // Already stopped.
      }
      state.source = null;
    }
    if (playheadRef.current) playheadRef.current.hidden = true;
    setPlaying(false);
  }

  function ensureAudio(fromGesture: boolean): AudioContext | null {
    const state = audio.current;
    if (!state.ctx) {
      // The AudioContext is only ever created inside a click or key press.
      if (!fromGesture) return null;
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      try {
        state.ctx = new Ctor();
      } catch {
        return null;
      }
    }
    if (state.ctx.state === "suspended") void state.ctx.resume().catch(() => undefined);
    return state.ctx;
  }

  function play(fromGesture: boolean, data: Float32Array = render(paramsRef.current)) {
    const ctx = ensureAudio(fromGesture);
    if (!ctx) {
      say(fromGesture ? textRef.current.audioUnavailable : textRef.current.padNeedsGesture);
      return;
    }
    stop();
    if (data.length === 0) return;
    const buffer = ctx.createBuffer(1, data.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(data);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const state = audio.current;
    source.onended = () => {
      if (state.source !== source) return;
      state.source = null;
      cancelAnimationFrame(state.frame);
      if (playheadRef.current) playheadRef.current.hidden = true;
      setPlaying(false);
    };
    state.source = source;
    source.start();
    setPlaying(true);
    const started = performance.now();
    const duration = (data.length / SAMPLE_RATE) * 1000;
    const head = playheadRef.current;
    if (head && !reducedMotion()) {
      head.hidden = false;
      const tick = () => {
        const t = Math.min(1, (performance.now() - started) / duration);
        head.style.left = `${t * 100}%`;
        if (t < 1 && state.source === source) state.frame = requestAnimationFrame(tick);
      };
      state.frame = requestAnimationFrame(tick);
    }
  }

  function applyPreset(id: PresetId, fromGesture: boolean) {
    const seed = freshSeed();
    const next = seeded(generatePreset(id, seed), seed);
    setSource({ kind: "preset", preset: id });
    update(next, null);
    setLabel(textRef.current.presets[id]);
    say(fill(textRef.current.generated, { name: textRef.current.presets[id] }));
    play(fromGesture, render(next));
  }

  function applyRandom(fromGesture: boolean) {
    const seed = freshSeed();
    const next = seeded(randomParams(seed), seed);
    setSource({ kind: "random" });
    update(next, null);
    setLabel(textRef.current.random);
    say(textRef.current.randomized);
    play(fromGesture, render(next));
  }

  function sourceName(from: SeedSource): string {
    return from.kind === "preset" ? textRef.current.presets[from.preset] : textRef.current.random;
  }

  function applySeed() {
    const seed = parseSeed(seedDraft);
    if (seed === null) {
      say(textRef.current.seedInvalid);
      return;
    }
    const next = seeded(paramsFromSeed(source, seed), seed);
    update(next, null);
    const name = sourceName(source);
    setLabel(name);
    say(fill(textRef.current.seedApplied, { name, seed }));
    play(true, render(next));
  }

  function doUndo() {
    setHistory((current) => undo(current));
    say(textRef.current.undone);
  }

  function doRedo() {
    setHistory((current) => redo(current));
    say(textRef.current.redone);
  }

  function run(action: Action, fromGesture: boolean) {
    if (action.type === "play") play(fromGesture);
    else if (action.type === "preset") applyPreset(action.preset, fromGesture);
    else if (action.type === "random") applyRandom(fromGesture);
    else if (action.type === "undo") doUndo();
    else doRedo();
  }
  const runRef = useRef(run);
  runRef.current = run;

  // Keyboard shortcuts. Text fields keep their keys.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = keyAction(event);
      if (!action || !shortcutAllowed(action, targetOf(event.target))) return;
      event.preventDefault();
      runRef.current(action, true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Gamepad: polled with requestAnimationFrame, edge-detected so a held button fires once.
  useEffect(() => {
    if (typeof navigator.getGamepads !== "function") return;
    const tracker = createPadTracker();
    let frame = 0;
    let running = false;
    const poll = () => {
      let any = false;
      const seen: number[] = [];
      for (const pad of navigator.getGamepads()) {
        if (!pad) continue;
        any = true;
        seen.push(pad.index);
        // The first poll of a pad only stores its buttons, so a button held at connect does nothing.
        const actions = tracker.step(pad);
        if (isTypingTarget(targetOf(document.activeElement))) continue;
        for (const action of actions) runRef.current(action, false);
      }
      tracker.retain(seen);
      if (any) frame = requestAnimationFrame(poll);
      else running = false;
    };
    const start = () => {
      if (running) return;
      running = true;
      frame = requestAnimationFrame(poll);
    };
    const onConnect = () => {
      setNotice(textRef.current.padConnected);
      start();
    };
    const onDisconnect = (event: GamepadEvent) => tracker.forget(event.gamepad.index);
    window.addEventListener("gamepadconnected", onConnect);
    window.addEventListener("gamepaddisconnected", onDisconnect);
    if (navigator.getGamepads().some(Boolean)) start();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("gamepadconnected", onConnect);
      window.removeEventListener("gamepaddisconnected", onDisconnect);
    };
  }, []);

  // Redraw the waveform when the theme flips.
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeTick((n) => n + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = cssVar("--color-line", "#2a3344");
    ctx.fillRect(0, Math.floor(height / 2), width, 1);
    ctx.fillStyle = cssVar("--color-steel", "#7eb6ff");
    const n = samples.length;
    if (!n) return;
    for (let x = 0; x < width; x++) {
      const from = Math.floor((x * n) / width);
      const to = Math.max(from + 1, Math.floor(((x + 1) * n) / width));
      let min = 1;
      let max = -1;
      for (let i = from; i < to && i < n; i++) {
        const v = samples[i] ?? 0;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const top = ((1 - max) / 2) * height;
      const bottom = ((1 - min) / 2) * height;
      ctx.fillRect(x, top, 1, Math.max(1, bottom - top));
    }
  }, [samples, themeTick]);

  useEffect(() => () => {
    const state = audio.current;
    cancelAnimationFrame(state.frame);
    try {
      state.source?.stop();
    } catch {
      // ignore
    }
    void state.ctx?.close().catch(() => undefined);
  }, []);

  function persist(next: Library): boolean {
    if (!store || !saveLibrary(store, next)) {
      say(text.saveFailed);
      return false;
    }
    setLib({ library: next, corrupt: false });
    return true;
  }

  function save() {
    const result = addSound(lib.library, name || label, params, newId(Date.now(), freshSeed()), Date.now());
    if (!result.ok) {
      say(result.reason === "name" ? text.nameMissing : text.libraryFull);
      return;
    }
    if (persist(result.library)) {
      say(fill(text.saved, { name: result.sound.name }));
      setName("");
    }
  }

  function loadSound(id: string) {
    const sound = findSound(lib.library, id);
    if (!sound) return;
    update({ ...sound.params }, null);
    setLabel(sound.name);
    say(fill(text.loaded, { name: sound.name }));
  }

  function applyRename() {
    if (!renaming) return;
    const next = renameSound(lib.library, renaming.id, renaming.value);
    if (!next) {
      say(text.nameMissing);
      return;
    }
    if (persist(next)) {
      say(fill(text.renamed, { name: findSound(next, renaming.id)?.name ?? "" }));
      setRenaming(null);
    }
  }

  function removeSound(id: string) {
    const sound = findSound(lib.library, id);
    if (persist(deleteSound(lib.library, id)) && sound) say(fill(text.deletedSound, { name: sound.name }));
    setConfirming(null);
  }

  function exportWav() {
    download(`consolecheat-sfx-${fileSlug(name || label)}.wav`, "audio/wav", encodeWav(samples, SAMPLE_RATE));
    say(text.wavDone);
  }

  async function onImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    let raw = "";
    try {
      raw = file.size > 100000 ? "x".repeat(30000) : await file.text();
    } catch {
      say(text.importErrors.json);
      return;
    }
    const result = parseSoundImport(raw);
    if (!result.ok) {
      say(text.importErrors[result.error]);
      return;
    }
    update(result.params, null);
    setLabel(result.name);
    setName(result.name);
    say(fill(text.imported, { name: result.name }));
  }

  const ms = Math.round((samples.length / SAMPLE_RATE) * 1000);

  return (
    <div className="flex flex-col gap-4">
      <div className="gen-grid">
        <div className="panel flex flex-col gap-4 rounded-xl px-4 py-4">
          <div>
            <h3 className="font-display text-lg font-semibold tracking-tight">{text.presetsHeading}</h3>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PRESETS.map((id) => {
                const index = (MAIN_PRESETS as readonly string[]).indexOf(id);
                return (
                  <button
                    key={id}
                    type="button"
                    className="btn btn-ghost preset-btn"
                    aria-keyshortcuts={index >= 0 ? String(index + 1) : undefined}
                    onClick={() => applyPreset(id, true)}
                  >
                    {index >= 0 ? <span className="font-mono text-xs text-subtle">{index + 1}</span> : null}
                    {text.presets[id]}
                  </button>
                );
              })}
              <button
                type="button"
                className="btn btn-ghost preset-btn"
                aria-keyshortcuts="R"
                onClick={() => applyRandom(true)}
              >
                <DiceIcon />
                {text.random}
              </button>
            </div>
          </div>

          <div className="wave-stage">
            <canvas
              ref={canvasRef}
              className="wave-canvas"
              width={720}
              height={160}
              role="img"
              aria-label={fill(text.previewLabel, { ms })}
            />
            <div ref={playheadRef} className="playhead" hidden />
          </div>
          <p className="text-sm text-muted">
            <span className="font-medium text-fg">{label}</span> · {text.durationLabel}:{" "}
            {fill(text.durationValue, { ms, samples: samples.length })}
          </p>

          <form
            className="seed-form flex flex-col gap-1"
            data-testid="seed-form"
            onSubmit={(event) => {
              event.preventDefault();
              applySeed();
            }}
          >
            <label htmlFor="sfx-seed" className="text-sm font-medium text-fg">
              {text.seedLabel}
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="sfx-seed"
                data-testid="seed"
                className="field min-w-0 flex-1 font-mono"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                maxLength={10}
                placeholder={text.seedPlaceholder}
                aria-describedby="sfx-seed-hint"
                value={seedDraft}
                onChange={(event) => setSeedDraft(event.target.value)}
              />
              <button type="submit" className="btn btn-ghost seed-apply" data-testid="seed-apply">
                {text.seedApply}
              </button>
            </div>
            <p id="sfx-seed-hint" className="text-xs text-subtle">
              {currentSeed === null ? `${text.seedNone} ` : ""}
              {fill(text.seedHint, { source: sourceName(source) })}
            </p>
          </form>

          <div className="flex flex-wrap gap-2">
            {playing ? (
              <button type="button" className="btn btn-primary" onClick={stop}>
                {text.stop}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" aria-keyshortcuts="Space" onClick={() => play(true)}>
                <PlayIcon />
                {text.play}
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              aria-keyshortcuts="Control+Z"
              disabled={!canUndo(history)}
              onClick={doUndo}
            >
              {text.undo}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              aria-keyshortcuts="Control+Y"
              disabled={!canRedo(history)}
              onClick={doRedo}
            >
              {text.redo}
            </button>
            <button type="button" className="btn btn-ghost" onClick={exportWav}>
              {text.exportWav}
            </button>
          </div>
          <p role="status" aria-live="polite" className="min-h-6 text-sm text-fg">
            {notice}
          </p>
        </div>

        <div className="panel flex flex-col gap-5 rounded-xl px-4 py-4">
          <fieldset>
            <legend className="font-display text-lg font-semibold tracking-tight">{text.waveHeading}</legend>
            <div className="seg mt-3">
              {WAVES.map((wave) => (
                <span key={wave}>
                  <input
                    id={`wave-${wave}`}
                    type="radio"
                    name="wave"
                    className="sr-only"
                    checked={params.wave === wave}
                    onChange={() => setWave(wave)}
                  />
                  <label htmlFor={`wave-${wave}`}>{text.waves[wave]}</label>
                </span>
              ))}
            </div>
            <div className="slider-grid mt-3">
              {(["duty", "dutyRamp"] as const).map((key) => (
                <Slider
                  key={key}
                  id={`p-${key}`}
                  label={text.params[key]}
                  value={params[key]}
                  min={PARAM_RANGES[key][0]}
                  max={PARAM_RANGES[key][1]}
                  shown={display(key, params[key], text)}
                  disabled={params.wave !== "square"}
                  hint={params.wave !== "square" && key === "duty" ? text.dutyHint : undefined}
                  onChange={(value) => setParam(key, value)}
                />
              ))}
            </div>
          </fieldset>
          {GROUPS.map((group) => (
            <fieldset key={group.heading}>
              <legend className="font-display text-lg font-semibold tracking-tight">{text[group.heading] as string}</legend>
              <div className="slider-grid mt-3">
                {group.keys.map((key) => (
                  <Slider
                    key={key}
                    id={`p-${key}`}
                    label={text.params[key]}
                    value={params[key]}
                    min={PARAM_RANGES[key][0]}
                    max={PARAM_RANGES[key][1]}
                    shown={display(key, params[key], text)}
                    onChange={(value) => setParam(key, value)}
                  />
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </div>

      <section className="panel rounded-xl px-4 py-4" aria-labelledby="library-heading">
        <h3 id="library-heading" className="font-display text-lg font-semibold tracking-tight">
          {text.libraryHeading}
        </h3>
        <p className="mt-1 text-sm text-muted">
          {text.libraryNote} {fill(text.libraryCount, { n: lib.library.sounds.length, max: MAX_SOUNDS })}
        </p>
        {lib.corrupt ? <p className="mt-2 text-sm text-warn">{text.libraryCorrupt}</p> : null}
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <div className="min-w-0 flex-1 basis-48">
            <label htmlFor="sfx-name" className="text-sm font-medium">
              {text.nameLabel}
            </label>
            <input
              id="sfx-name"
              type="text"
              className="field mt-1"
              maxLength={60}
              value={name}
              placeholder={text.namePlaceholder}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary">
            {text.save}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              download(`consolecheat-sfx-${fileSlug(name || label)}.json`, "application/json", exportSound(name || label, params))
            }
          >
            {text.exportJson}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
            {text.importJson}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => void onImport(event)}
          />
        </form>
        {lib.library.sounds.length === 0 ? (
          <p className="mt-4 text-sm text-subtle">{text.empty}</p>
        ) : (
          <ul className="mt-4">
            {lib.library.sounds.map((sound) => (
              <li key={sound.id} className="sound-item">
                {renaming?.id === sound.id ? (
                  <form
                    className="flex min-w-0 flex-1 flex-wrap gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      applyRename();
                    }}
                  >
                    <label htmlFor={`rename-${sound.id}`} className="sr-only">
                      {text.nameLabel}
                    </label>
                    <input
                      id={`rename-${sound.id}`}
                      type="text"
                      className="field min-w-0 flex-1 basis-40"
                      maxLength={60}
                      value={renaming.value}
                      autoFocus
                      onChange={(event) => setRenaming({ id: sound.id, value: event.target.value })}
                    />
                    <button type="submit" className="btn btn-primary btn-sm">
                      {text.renameConfirm}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenaming(null)}>
                      {text.cancel}
                    </button>
                  </form>
                ) : confirming === sound.id ? (
                  <div role="alertdialog" aria-label={fill(text.deleteSoundAsk, { name: sound.name })} className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-fg">{fill(text.deleteSoundAsk, { name: sound.name })}</span>
                    <button type="button" className="btn btn-bad btn-sm" onClick={() => removeSound(sound.id)}>
                      {text.delete}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(null)}>
                      {text.cancel}
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="min-w-0 break-words font-medium">{sound.name}</span>
                    <span className="flex flex-wrap gap-2">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => loadSound(sound.id)}>
                        {text.load}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setRenaming({ id: sound.id, value: sound.name })}
                      >
                        {text.rename}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          download(`consolecheat-sfx-${fileSlug(sound.name)}.json`, "application/json", exportSound(sound.name, sound.params))
                        }
                      >
                        JSON
                      </button>
                      <button type="button" className="btn btn-bad btn-sm" onClick={() => setConfirming(sound.id)}>
                        {text.delete}
                      </button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
