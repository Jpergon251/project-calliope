import test from "node:test";
import assert from "node:assert/strict";
import {
  scaledVisualizerGain,
  smoothVisualizerValue,
  visualizerAmplitude,
  visualizerMode,
} from "../../lib/visualizerMath.js";

test("visualizer is off while paused, dim while muted, and active above 1% volume", () => {
  assert.equal(visualizerMode(false, false, 0.5), "off");
  assert.equal(visualizerMode(true, true, 0.5), "dimmed");
  assert.equal(visualizerMode(true, false, 0.01), "dimmed");
  assert.equal(visualizerMode(true, false, 0.011), "active");
});

test("visualizer keeps a visible low-volume baseline and grows progressively with volume", () => {
  const levels = [0, 0.01, 0.05, 0.1, 0.2, 0.5, 0.75, 1];
  const gains = levels.map(scaledVisualizerGain);
  assert.ok(gains[0] > 0);
  for (let index = 1; index < gains.length; index++) {
    assert.ok(gains[index] > gains[index - 1]);
  }
  assert.ok(gains[1] > 0);
  assert.ok(gains[2] > 0);
  assert.equal(gains.at(-1), 1);
});

test("volume affects only amplitude; the signal level is independent of the gain scale", () => {
  const musicalLevel = 0.7;
  const amplitudes = [0.01, 0.05, 0.1, 0.2, 0.5, 0.75, 1].map((volume) =>
    visualizerAmplitude(musicalLevel, volume),
  );
  assert.ok(amplitudes.every((value) => value > 0));
  for (let index = 1; index < amplitudes.length; index++) {
    assert.ok(amplitudes[index] > amplitudes[index - 1]);
  }
  assert.ok(visualizerAmplitude(musicalLevel, 0) > 0);
  assert.equal(musicalLevel, 0.7);
});

test("visualizer smoothing limits frame-to-frame vocal/transient jumps", () => {
  const oneFrame = smoothVisualizerValue(0, 1, 4.2, 1.7, 1 / 60);
  assert.ok(oneFrame > 0 && oneFrame < 0.1);
  let release = 1;
  for (let i = 0; i < 60; i++) {
    release = smoothVisualizerValue(release, 0, 4.2, 1.7, 1 / 60);
  }
  assert.ok(release < 0.25);
  assert.ok(release > 0);
});
