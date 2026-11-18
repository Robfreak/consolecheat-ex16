import { MAIN_PRESETS, type PresetId } from "./presets.ts";

// Keyboard and gamepad mapping. Pure helpers so node:test can check them.

export type Action =
  | { type: "play" }
  | { type: "preset"; preset: PresetId }
  | { type: "random" }
  | { type: "undo" }
  | { type: "redo" };

export type KeyLike = {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
};

export function keyAction(event: KeyLike): Action | null {
  const mod = Boolean(event.ctrlKey || event.metaKey);
  const key = event.key.toLowerCase();
  if (event.altKey) return null;
  if (mod) {
    if (key === "z" && event.shiftKey) return { type: "redo" };
    if (key === "z") return { type: "undo" };
    if (key === "y") return { type: "redo" };
    return null;
  }
  if (event.repeat) return null;
  if (event.key === " " || event.code === "Space") return { type: "play" };
  const digit = /^[1-4]$/.test(event.key) ? Number(event.key) : null;
  if (digit !== null) {
    const preset = MAIN_PRESETS[digit - 1];
    return preset ? { type: "preset", preset } : null;
  }
  if (key === "r" && !event.shiftKey) return { type: "random" };
  return null;
}

export type TargetLike = {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
} | null;

const TEXT_INPUTS = new Set(["text", "search", "email", "url", "tel", "password", "number", "file"]);

/** True when the focused element types text, so global shortcuts must stay away. */
export function isTypingTarget(target: TargetLike): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = (target.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return TEXT_INPUTS.has((target.type ?? "text").toLowerCase());
  return false;
}

/**
 * Whether a global shortcut may act on this target. Text fields keep every key.
 * Buttons, links, and checkboxes keep Space (they activate on it).
 * Sliders keep their own keys but pass through undo/redo.
 */
export function shortcutAllowed(action: Action, target: TargetLike): boolean {
  if (isTypingTarget(target)) return false;
  const tag = (target?.tagName ?? "").toUpperCase();
  const type = (target?.type ?? "").toLowerCase();
  if (tag === "INPUT" && type === "range") return action.type === "undo" || action.type === "redo";
  if (action.type === "play" && (tag === "BUTTON" || tag === "A" || tag === "SUMMARY" || (tag === "INPUT" && (type === "checkbox" || type === "radio")))) {
    return false;
  }
  return true;
}

// Standard gamepad mapping (PlayStation labels).
export const PAD = { cross: 0, circle: 1, square: 2, triangle: 3, up: 12, down: 13, left: 14, right: 15 } as const;

/** D-pad direction to preset: up Sprung, right Münze, down Explosion, left Power-up. */
export const DPAD_PRESETS: Record<number, PresetId> = {
  [PAD.up]: "jump",
  [PAD.right]: "coin",
  [PAD.down]: "explosion",
  [PAD.left]: "powerup",
};

/** Indices that are pressed now but were not pressed in the previous poll. */
export function risingEdges(previous: readonly boolean[], current: readonly boolean[]): number[] {
  const edges: number[] = [];
  for (let i = 0; i < current.length; i++) {
    if (current[i] && !previous[i]) edges.push(i);
  }
  return edges;
}

export function padActions(previous: readonly boolean[], current: readonly boolean[]): Action[] {
  const actions: Action[] = [];
  for (const index of risingEdges(previous, current)) {
    if (index === PAD.cross) actions.push({ type: "play" });
    else if (index === PAD.triangle) actions.push({ type: "random" });
    else {
      const preset = DPAD_PRESETS[index];
      if (preset) actions.push({ type: "preset", preset });
    }
  }
  return actions;
}

/** Keeps the last button state per gamepad index, so a held button fires once. */
export function createPadTracker() {
  const last = new Map<number, boolean[]>();
  return {
    step(index: number, buttons: readonly { pressed: boolean }[]): Action[] {
      const current = buttons.map((button) => Boolean(button.pressed));
      const actions = padActions(last.get(index) ?? [], current);
      last.set(index, current);
      return actions;
    },
    forget(index: number) {
      last.delete(index);
    },
  };
}
