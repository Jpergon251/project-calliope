import test from "node:test";
import assert from "node:assert/strict";
import { appendListeningHistoryGroup, formatPlayCount } from "./listeningHistory.js";

let id = 0;
const createId = () => `group-${++id}`;
const song = (itemId) => ({ type: "song", itemId, title: itemId });
const record = (history, itemId, timestamp) =>
  appendListeningHistoryGroup(history, song(itemId), timestamp, createId);

function grouped(sequence) {
  id = 0;
  let history = [];
  sequence.forEach((itemId, index) => {
    history = record(history, itemId, index + 1);
  });
  return history;
}

test("three consecutive plays of A create one persistent group with count 3", () => {
  const history = grouped(["A", "A", "A"]);
  assert.equal(history.length, 1);
  assert.equal(history[0].itemId, "A");
  assert.equal(history[0].playCount, 3);
});

test("A, A, B, A produces independent newest-first groups and preserves prior group", () => {
  const history = grouped(["A", "A", "B", "A"]);
  assert.deepEqual(history.map(({ itemId, playCount }) => [itemId, playCount]), [
    ["A", 1], ["B", 1], ["A", 2],
  ]);
});

test("A, B, A, B makes four independent groups", () => {
  const history = grouped(["A", "B", "A", "B"]);
  assert.deepEqual(history.map(({ itemId, playCount }) => [itemId, playCount]), [
    ["B", 1], ["A", 1], ["B", 1], ["A", 1],
  ]);
});

test("single play hides count; consecutive repeats display only ×2 and above", () => {
  const once = grouped(["A"])[0];
  const twice = grouped(["A", "A"])[0];
  const separated = grouped(["A", "B", "A"]);
  const repeatSeparated = grouped(["A", "A", "B", "A", "A"]);
  assert.equal(once.playCount, 1);
  assert.equal(formatPlayCount(once.playCount), "");
  assert.equal(formatPlayCount(twice.playCount), "×2");
  assert.deepEqual(separated.map((entry) => formatPlayCount(entry.playCount)), ["", "", ""]);
  assert.deepEqual(repeatSeparated.map(({ itemId, playCount }) => [itemId, formatPlayCount(playCount)]), [
    ["A", "×2"], ["B", ""], ["A", "×2"],
  ]);
});

test("group count survives persistence round-trip and legacy records default to one", () => {
  const current = grouped(["A", "A"])[0];
  const storedAndLoaded = JSON.parse(JSON.stringify(current));
  const legacy = { ...song("legacy"), id: "old-id", timestamp: 5 };
  assert.equal(storedAndLoaded.playCount, 2);
  assert.equal(Number(legacy.playCount) || 1, 1);
});

test("repeated play updates only newest group timestamp and keeps ordering monotonic", () => {
  const groups = record(record([], "A", 40), "A", 10);
  assert.equal(groups[0].timestamp, 41);
  assert.equal(groups[0].playCount, 2);
});

test("only stable song item IDs group; equal titles with different IDs do not", () => {
  const history = [
    { type: "song", itemId: "file-one", title: "Same title", playCount: 1 },
  ];
  const next = appendListeningHistoryGroup(
    history,
    { type: "song", itemId: "file-two", title: "Same title" },
    2,
    createId,
  );
  assert.equal(next.length, 2);
  assert.equal(next[0].playCount, 1);
  assert.equal(next[1].playCount, 1);
});
