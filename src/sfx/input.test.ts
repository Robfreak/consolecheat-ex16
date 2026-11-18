import assert from "node:assert/strict";
import test from "node:test";
import { createPadTracker, isTypingTarget, keyAction, PAD, padActions, risingEdges, shortcutAllowed } from "./input.ts";

test("keyboard: Space plays, 1–4 pick presets, R is random, Ctrl+Z/Y undo and redo", () => {
  assert.deepEqual(keyAction({ key: " ", code: "Space" }), { type: "play" });
  assert.deepEqual(keyAction({ key: "1" }), { type: "preset", preset: "jump" });
  assert.deepEqual(keyAction({ key: "2" }), { type: "preset", preset: "coin" });
  assert.deepEqual(keyAction({ key: "3" }), { type: "preset", preset: "explosion" });
  assert.deepEqual(keyAction({ key: "4" }), { type: "preset", preset: "powerup" });
  assert.equal(keyAction({ key: "5" }), null);
  assert.deepEqual(keyAction({ key: "r" }), { type: "random" });
  assert.deepEqual(keyAction({ key: "R" }), { type: "random" });
  assert.deepEqual(keyAction({ key: "z", ctrlKey: true }), { type: "undo" });
  assert.deepEqual(keyAction({ key: "z", metaKey: true }), { type: "undo" });
  assert.deepEqual(keyAction({ key: "y", ctrlKey: true }), { type: "redo" });
  assert.deepEqual(keyAction({ key: "Z", ctrlKey: true, shiftKey: true }), { type: "redo" });
  assert.equal(keyAction({ key: "r", ctrlKey: true }), null, "Ctrl+R stays a browser reload");
  assert.equal(keyAction({ key: "1", altKey: true }), null);
  assert.equal(keyAction({ key: " ", repeat: true }), null, "held Space does not retrigger");
});

test("shortcuts never hijack a focused text field", () => {
  const text = { tagName: "INPUT", type: "text" };
  assert.ok(isTypingTarget(text));
  assert.ok(isTypingTarget({ tagName: "TEXTAREA" }));
  assert.ok(isTypingTarget({ tagName: "SELECT" }));
  assert.ok(isTypingTarget({ tagName: "DIV", isContentEditable: true }));
  assert.equal(isTypingTarget({ tagName: "INPUT", type: "range" }), false);
  assert.equal(isTypingTarget(null), false);
  for (const action of [{ type: "play" }, { type: "random" }, { type: "undo" }, { type: "preset", preset: "jump" }] as const) {
    assert.equal(shortcutAllowed(action, text), false);
  }
  assert.equal(shortcutAllowed({ type: "play" }, { tagName: "BUTTON" }), false, "Space activates the button instead");
  assert.equal(shortcutAllowed({ type: "play" }, { tagName: "INPUT", type: "radio" }), false);
  assert.equal(shortcutAllowed({ type: "random" }, { tagName: "BUTTON" }), true);
  assert.equal(shortcutAllowed({ type: "undo" }, { tagName: "INPUT", type: "range" }), true);
  assert.equal(shortcutAllowed({ type: "preset", preset: "coin" }, { tagName: "INPUT", type: "range" }), false);
  assert.equal(shortcutAllowed({ type: "play" }, { tagName: "BODY" }), true);
});

test("gamepad edge detection fires once per press", () => {
  assert.deepEqual(risingEdges([], [true, false, true]), [0, 2]);
  assert.deepEqual(risingEdges([true, false, true], [true, true, false]), [1]);
  assert.deepEqual(risingEdges([true], [true]), []);

  const buttons = (pressed: number[]) => Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) }));
  const tracker = createPadTracker();
  assert.deepEqual(tracker.step(0, buttons([PAD.cross])), [{ type: "play" }]);
  assert.deepEqual(tracker.step(0, buttons([PAD.cross])), [], "held × does not repeat");
  assert.deepEqual(tracker.step(0, buttons([])), []);
  assert.deepEqual(tracker.step(0, buttons([PAD.cross])), [{ type: "play" }]);
  assert.deepEqual(tracker.step(0, buttons([PAD.cross, PAD.triangle])), [{ type: "random" }]);
  assert.deepEqual(tracker.step(1, buttons([PAD.up])), [{ type: "preset", preset: "jump" }], "pads are tracked apart");
  assert.deepEqual(tracker.step(1, buttons([PAD.up, PAD.right])), [{ type: "preset", preset: "coin" }]);
  assert.deepEqual(tracker.step(1, buttons([PAD.down])), [{ type: "preset", preset: "explosion" }]);
  assert.deepEqual(tracker.step(1, buttons([PAD.left])), [{ type: "preset", preset: "powerup" }]);
  tracker.forget(1);
  assert.deepEqual(tracker.step(1, buttons([PAD.left])), [{ type: "preset", preset: "powerup" }]);
  assert.deepEqual(padActions([], buttons([PAD.circle, PAD.square]).map((b) => b.pressed)), []);
});
