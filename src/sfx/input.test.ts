import assert from "node:assert/strict";
import test from "node:test";
import { createPadTracker, isTypingTarget, keyAction, PAD, padActions, pollPad, risingEdges, shortcutAllowed, type PadMemory } from "./input.ts";

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

const buttons = (pressed: number[]) => Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) }));
const pad = (pressed: number[], index = 0, id = "Mock Pad") => ({ index, id, buttons: buttons(pressed) });

test("gamepad edge detection fires once per press, never on the first poll", () => {
  assert.deepEqual(risingEdges([], [true, false, true]), [0, 2]);
  assert.deepEqual(risingEdges([true, false, true], [true, true, false]), [1]);
  assert.deepEqual(risingEdges([true], [true]), []);

  const tracker = createPadTracker();
  assert.deepEqual(tracker.step(pad([PAD.cross])), [], "× held on the first poll only seeds");
  assert.deepEqual(tracker.step(pad([PAD.cross])), [], "held × does not repeat");
  assert.deepEqual(tracker.step(pad([])), []);
  assert.deepEqual(tracker.step(pad([PAD.cross])), [{ type: "play" }]);
  assert.deepEqual(tracker.step(pad([PAD.cross, PAD.triangle])), [{ type: "random" }]);
  assert.deepEqual(tracker.step(pad([], 1, "Pad 2")), [], "a second pad seeds on its own first poll");
  assert.deepEqual(tracker.step(pad([PAD.up], 1, "Pad 2")), [{ type: "preset", preset: "jump" }], "pads are tracked apart");
  assert.deepEqual(tracker.step(pad([PAD.up, PAD.right], 1, "Pad 2")), [{ type: "preset", preset: "coin" }]);
  assert.deepEqual(tracker.step(pad([PAD.down], 1, "Pad 2")), [{ type: "preset", preset: "explosion" }]);
  assert.deepEqual(tracker.step(pad([PAD.left], 1, "Pad 2")), [{ type: "preset", preset: "powerup" }]);
  tracker.forget(1);
  assert.deepEqual(tracker.step(pad([PAD.left], 1, "Pad 2")), [], "after forget the first poll seeds again");
  assert.deepEqual(padActions([], buttons([PAD.circle, PAD.square]).map((b) => b.pressed)), []);
});

test("pollPad: holding × on the first poll does nothing; release then press fires once", () => {
  let memory: PadMemory | null = null;
  const fired: string[] = [];
  for (const frame of [pad([PAD.cross]), pad([PAD.cross]), pad([PAD.cross]), pad([]), pad([PAD.cross]), pad([PAD.cross])]) {
    const result = pollPad(frame, memory);
    memory = result.memory;
    fired.push(...result.actions.map((action) => action.type));
  }
  assert.deepEqual(fired, ["play"]);
});

test("pollPad: after a disconnect, reconnect, or a different pad id the first poll only initializes", () => {
  let memory = pollPad(pad([]), null).memory;
  assert.deepEqual(pollPad(pad([PAD.triangle]), memory).actions, [{ type: "random" }], "a normal press still fires");
  memory = pollPad(null, memory).memory;
  assert.equal(memory, null, "no pad clears the memory");
  const first = pollPad(pad([PAD.cross, PAD.up]), memory);
  assert.deepEqual(first.actions, [], "held buttons at reconnect do nothing");
  assert.deepEqual(pollPad(pad([PAD.cross, PAD.up]), first.memory).actions, []);
  const released = pollPad(pad([]), first.memory);
  assert.deepEqual(pollPad(pad([PAD.cross]), released.memory).actions, [{ type: "play" }]);
  assert.deepEqual(pollPad(pad([PAD.cross], 0, "Other Pad"), released.memory).actions, [], "a different pad id counts as new");

  const tracker = createPadTracker();
  tracker.step(pad([]));
  tracker.retain([]);
  assert.deepEqual(tracker.step(pad([PAD.cross])), [], "a pad missing from one poll seeds again when it returns");
});
