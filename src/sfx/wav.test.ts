import assert from "node:assert/strict";
import test from "node:test";
import { generatePreset } from "./presets.ts";
import { renderSfx, SAMPLE_RATE } from "./synth.ts";
import { encodeWav, WAV_HEADER_BYTES } from "./wav.ts";

function ascii(bytes: Uint8Array, from: number, length: number): string {
  return String.fromCharCode(...bytes.slice(from, from + length));
}

test("the WAV header describes 16-bit PCM mono with the right sizes", () => {
  const samples = renderSfx(generatePreset("coin", 5));
  const wav = encodeWav(samples, SAMPLE_RATE);
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  assert.equal(wav.byteLength, WAV_HEADER_BYTES + samples.length * 2);
  assert.equal(ascii(wav, 0, 4), "RIFF");
  assert.equal(view.getUint32(4, true), wav.byteLength - 8);
  assert.equal(ascii(wav, 8, 4), "WAVE");
  assert.equal(ascii(wav, 12, 4), "fmt ");
  assert.equal(view.getUint32(16, true), 16);
  assert.equal(view.getUint16(20, true), 1, "PCM");
  assert.equal(view.getUint16(22, true), 1, "mono");
  assert.equal(view.getUint32(24, true), 44100);
  assert.equal(view.getUint32(28, true), 88200, "byte rate");
  assert.equal(view.getUint16(32, true), 2, "block align");
  assert.equal(view.getUint16(34, true), 16, "bits");
  assert.equal(ascii(wav, 36, 4), "data");
  assert.equal(view.getUint32(40, true), samples.length * 2);
  assert.equal(view.getUint32(40, true) / 2, samples.length, "frame count matches the rendered samples");
});

test("samples are clamped and scaled to int16", () => {
  const wav = encodeWav(new Float32Array([0, 1, -1, 2, -2, 0.5, Number.NaN]), 8000);
  const view = new DataView(wav.buffer);
  const read = (i: number) => view.getInt16(WAV_HEADER_BYTES + i * 2, true);
  assert.equal(read(0), 0);
  assert.equal(read(1), 32767);
  assert.equal(read(2), -32768);
  assert.equal(read(3), 32767);
  assert.equal(read(4), -32768);
  assert.equal(read(5), Math.round(0.5 * 32767));
  assert.equal(read(6), 0);
  assert.equal(view.getUint32(24, true), 8000);
});

test("an empty sound is still a valid 44-byte WAV", () => {
  const wav = encodeWav(new Float32Array(0), SAMPLE_RATE);
  assert.equal(wav.byteLength, 44);
  assert.equal(new DataView(wav.buffer).getUint32(40, true), 0);
  assert.equal(new DataView(wav.buffer).getUint32(4, true), 36);
});

test("the encoder is pure", () => {
  const samples = new Float32Array([0.1, -0.2, 0.3]);
  const copy = Float32Array.from(samples);
  assert.deepEqual(Array.from(encodeWav(samples, SAMPLE_RATE)), Array.from(encodeWav(samples, SAMPLE_RATE)));
  assert.deepEqual(Array.from(samples), Array.from(copy));
});
