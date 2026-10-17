import test from "node:test";
import assert from "node:assert/strict";
import {
  PERCEPTUAL_EXPONENT,
  volumeToGain,
  volumeToDb,
  dbToGain,
  gainToDb,
  dbToVolume,
  gainToVolume,
  formatDb,
  getVolumeIconType,
} from "./volume.js";

test("volume perceptual curve exponent is 3.0 (cubic taper for natural progression)", () => {
  assert.equal(PERCEPTUAL_EXPONENT, 3.0);
});

test("volume 0% produces exact silence (gain 0.0, -Infinity dB)", () => {
  assert.equal(volumeToGain(0), 0.0);
  assert.equal(volumeToDb(0), -Infinity);
  assert.equal(gainToVolume(0), 0.0);
  assert.equal(dbToVolume(-Infinity), 0.0);
  assert.equal(formatDb(-Infinity), "-∞ dB");
  assert.equal(formatDb(-Infinity, { isMuted: true }), "Silenciado");
});

test("volume 50% produces a moderate, comfortable listening level (gain 0.125, -18.1 dB)", () => {
  const gain50 = volumeToGain(0.5);
  const db50 = volumeToDb(0.5);
  assert.equal(Math.round(gain50 * 1000) / 1000, 0.125);
  assert.equal(db50, -18.1);
});

test("volume 100% produces exact unity gain without clipping (gain 1.0, 0.0 dB)", () => {
  assert.equal(volumeToGain(1), 1.0);
  assert.equal(volumeToDb(1), 0.0);
  assert.equal(gainToVolume(1), 1.0);
  assert.equal(dbToVolume(0), 1.0);
  assert.equal(formatDb(0), "0 dB");
});

test("mathematical check of volume across 0% to 100% in 10% steps", () => {
  const expectedTable = [
    { v: 0.0, gain: 0.0, db: -Infinity },
    { v: 0.1, gain: 0.001, db: -60.0 },
    { v: 0.2, gain: 0.008, db: -41.9 },
    { v: 0.3, gain: 0.027, db: -31.4 },
    { v: 0.4, gain: 0.064, db: -23.9 },
    { v: 0.5, gain: 0.125, db: -18.1 },
    { v: 0.6, gain: 0.216, db: -13.3 },
    { v: 0.7, gain: 0.343, db: -9.3 },
    { v: 0.8, gain: 0.512, db: -5.8 },
    { v: 0.9, gain: 0.729, db: -2.7 },
    { v: 1.0, gain: 1.0, db: 0.0 },
  ];

  for (const item of expectedTable) {
    const calculatedGain = volumeToGain(item.v);
    const calculatedDb = volumeToDb(item.v);

    assert(
      Math.abs(calculatedGain - item.gain) < 0.001,
      `At ${item.v * 100}%, expected gain ${item.gain}, got ${calculatedGain}`
    );

    if (item.db === -Infinity) {
      assert.equal(calculatedDb, -Infinity);
    } else {
      assert(
        Math.abs(calculatedDb - item.db) <= 0.1,
        `At ${item.v * 100}%, expected db ${item.db}, got ${calculatedDb}`
      );
    }
  }
});

test("volume progression between 40%, 50% and 60% is smooth and progressive without jumps", () => {
  const db40 = volumeToDb(0.4); // -23.9 dB
  const db50 = volumeToDb(0.5); // -18.1 dB
  const db60 = volumeToDb(0.6); // -13.3 dB

  const step40to50 = db50 - db40; // ~+5.8 dB
  const step50to60 = db60 - db50; // ~+4.8 dB

  assert(
    step40to50 > 4.5 && step40to50 < 7.0,
    `Step 40%->50% should be ~5.8 dB, got ${step40to50} dB`
  );
  assert(
    step50to60 > 3.5 && step50to60 < 6.0,
    `Step 50%->60% should be ~4.8 dB, got ${step50to60} dB`
  );
  assert(
    Math.abs(step40to50 - step50to60) < 2.0,
    `Delta between 40-50 and 50-60 should be progressive, got diff ${Math.abs(step40to50 - step50to60)} dB`
  );
});

test("volume conversions are symmetrical inverses across range", () => {
  const steps = [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9];
  for (const step of steps) {
    const gain = volumeToGain(step);
    const roundTrippedVolume = gainToVolume(gain);
    assert(
      Math.abs(roundTrippedVolume - step) < 0.001,
      `gainToVolume(volumeToGain(${step})) should be ~${step}, got ${roundTrippedVolume}`
    );

    const db = volumeToDb(step);
    const roundTrippedFromDb = dbToVolume(db);
    assert(
      Math.abs(roundTrippedFromDb - step) < 0.005,
      `dbToVolume(volumeToDb(${step})) should be ~${step}, got ${roundTrippedFromDb}`
    );
  }
});

test("getVolumeIconType returns appropriate icon state", () => {
  assert.equal(getVolumeIconType(0, false), "mute");
  assert.equal(getVolumeIconType(0.5, true), "mute");
  assert.equal(getVolumeIconType(0.15, false), "low");
  assert.equal(getVolumeIconType(0.5, false), "medium");
  assert.equal(getVolumeIconType(0.85, false), "high");
});
