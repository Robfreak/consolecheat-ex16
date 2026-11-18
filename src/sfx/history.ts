// Undo/redo stack for sound parameters. Pure: every call returns a new history.

export type History<T> = {
  past: T[];
  present: T;
  future: T[];
  /** Key and time of the last commit, so one slider drag becomes one undo step. */
  lastKey: string | null;
  lastAt: number;
};

export const HISTORY_LIMIT = 100;
export const COALESCE_MS = 800;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastKey: null, lastAt: 0 };
}

/**
 * Commits `next`. A commit with the same `key` within COALESCE_MS of the previous one
 * replaces the present instead of adding a step (slider drags). `equal` skips no-ops.
 */
export function commit<T>(
  history: History<T>,
  next: T,
  options: { key?: string | null; now?: number; equal?: (a: T, b: T) => boolean } = {},
): History<T> {
  const key = options.key ?? null;
  const now = options.now ?? 0;
  if (options.equal?.(history.present, next)) return history;
  if (key !== null && key === history.lastKey && now - history.lastAt < COALESCE_MS && history.past.length > 0) {
    return { ...history, present: next, future: [], lastAt: now };
  }
  const past = [...history.past, history.present].slice(-HISTORY_LIMIT);
  return { past, present: next, future: [], lastKey: key, lastAt: now };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    lastKey: null,
    lastAt: 0,
  };
}

export function redo<T>(history: History<T>): History<T> {
  const next = history.future[0];
  if (next === undefined) return history;
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: history.future.slice(1),
    lastKey: null,
    lastAt: 0,
  };
}
