import assert from "node:assert/strict";
import test from "node:test";
import { canRedo, canUndo, COALESCE_MS, commit, createHistory, HISTORY_LIMIT, redo, undo } from "./history.ts";

test("undo and redo walk the stack", () => {
  let h = createHistory(1);
  h = commit(h, 2);
  h = commit(h, 3);
  assert.equal(h.present, 3);
  assert.ok(canUndo(h));
  assert.equal(canRedo(h), false);
  h = undo(h);
  assert.equal(h.present, 2);
  h = undo(h);
  assert.equal(h.present, 1);
  assert.equal(canUndo(h), false);
  assert.equal(undo(h), h, "undo at the start is a no-op");
  h = redo(h);
  assert.equal(h.present, 2);
  h = redo(h);
  assert.equal(h.present, 3);
  assert.equal(redo(h), h, "redo at the end is a no-op");
});

test("a new change after undo drops the redo branch", () => {
  let h = commit(commit(createHistory("a"), "b"), "c");
  h = undo(h);
  h = commit(h, "x");
  assert.equal(h.present, "x");
  assert.equal(canRedo(h), false);
  assert.deepEqual(h.past, ["a", "b"]);
});

test("one slider drag is one undo step, a pause starts a new one", () => {
  let h = createHistory(0);
  h = commit(h, 1, { key: "decay", now: 1000 });
  h = commit(h, 2, { key: "decay", now: 1100 });
  h = commit(h, 3, { key: "decay", now: 1200 });
  assert.equal(h.past.length, 1);
  h = commit(h, 4, { key: "decay", now: 1200 + COALESCE_MS + 1 });
  assert.equal(h.past.length, 2);
  h = commit(h, 5, { key: "attack", now: 1200 + COALESCE_MS + 2 });
  assert.equal(h.past.length, 3);
  h = undo(h);
  assert.equal(h.present, 4);
  h = undo(h);
  assert.equal(h.present, 3);
  h = undo(h);
  assert.equal(h.present, 0);
});

test("equal values do not add steps and the stack is capped", () => {
  let h = createHistory(0);
  h = commit(h, 0, { equal: (a, b) => a === b });
  assert.equal(h.past.length, 0);
  for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = commit(h, i);
  assert.equal(h.past.length, HISTORY_LIMIT);
});
