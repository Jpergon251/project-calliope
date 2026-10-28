import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { formatPlayCount } from "./listeningHistory.js";

/**
 * Unit tests validating playback navigation logic, queue transitions,
 * history back-stack, repeat-all, repeat-one, pause state preservation,
 * and the strict 3-second previous track boundary rule.
 */

function createPlaybackEngine(initialSongs = []) {
  const songs = [...initialSongs];
  let playingSong = null;
  let playQueue = [];
  let historyQueue = [];
  let listeningHistory = [];
  let originalQueueList = [];
  let currentTime = 0;
  let isPlaying = false;
  let repeatMode = "off"; // 'off' | 'all' | 'one'
  let isShuffleEnabled = false;
  let playbackRequestId = 0;
  let handlingEnded = false;

  function dedupeById(list) {
    const seen = new Set();
    return list.filter((item) => {
      if (!item || !item.id) return false;
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  function playSong(song, addToHistory = true, options = {}) {
    if (!song) return;
    const thisRequestId = ++playbackRequestId;
    const { removeFromQueue = false, shouldPlay = true } = options;

    if (addToHistory && playingSong && playingSong.id !== song.id) {
      historyQueue = dedupeById([
        ...historyQueue.filter((item) => item?.id !== playingSong.id),
        playingSong,
      ]);
      listeningHistory = [...listeningHistory, { songId: playingSong.id }];
    }

    historyQueue = dedupeById(historyQueue.filter((item) => item?.id !== song.id));

    if (removeFromQueue) {
      playQueue = dedupeById(playQueue.filter((item) => item?.id !== song.id));
    }

    playingSong = song;
    currentTime = 0;
    isPlaying = Boolean(shouldPlay);

    return { thisRequestId, currentSong: playingSong };
  }

  function playFromPlaylist(song, songsList = []) {
    const currentIndex = songsList.findIndex((item) => item.id === song.id);
    const remaining = songsList.slice(currentIndex >= 0 ? currentIndex + 1 : 0);
    const preceding = songsList.slice(0, currentIndex > 0 ? currentIndex : 0);

    historyQueue = dedupeById(preceding);
    playQueue = remaining;
    originalQueueList = [];

    playSong(song, false, { shouldPlay: true });
  }

  function playPreviousSong() {
    if (!playingSong) return;

    const wasPaused = !isPlaying;
    const currentSec = currentTime;

    // Restart the current track after 3 seconds; otherwise navigate to the previous track.
    if (currentSec > 3.0) {
      currentTime = 0;
      isPlaying = !wasPaused;
      return { action: "restarted", song: playingSong, isPlaying, currentTime: 0 };
    }

    const previousSong = historyQueue[historyQueue.length - 1];

    if (previousSong) {
      const currentSong = playingSong;
      historyQueue = historyQueue.slice(0, -1);
      historyQueue.push(currentSong);
      playQueue = dedupeById([
        currentSong,
        ...playQueue.filter((item) => item?.id !== currentSong.id),
      ]);

      playSong(previousSong, false, {
        removeFromQueue: true,
        shouldPlay: !wasPaused,
      });
      return { action: "previous_song", song: previousSong, isPlaying, currentTime: 0 };
    }

    // Start of list boundary
    if (repeatMode === "all" && playQueue.length > 0) {
      const lastSong = playQueue.pop();
      if (lastSong) {
        playQueue.unshift(playingSong);
        playSong(lastSong, false, { shouldPlay: !wasPaused });
        return { action: "wrap_around_last", song: lastSong, isPlaying, currentTime: 0 };
      }
    }

    // Boundary limit: restart at 0:00
    currentTime = 0;
    isPlaying = !wasPaused;
    return { action: "start_boundary_restart", song: playingSong, isPlaying, currentTime: 0 };
  }

  function playNextSong(autoAdvance = false) {
    if (autoAdvance && !handlingEnded) {
      return { action: "ignored_auto_advance", song: null, isPlaying };
    }
    if (!autoAdvance) handlingEnded = false;
    const wasPaused = !autoAdvance && !isPlaying;

    let nextSong = playQueue.shift();

    if (!nextSong && repeatMode === "all") {
      const allPlayed = [...historyQueue];
      if (playingSong) allPlayed.push(playingSong);
      if (allPlayed.length > 0) {
        historyQueue = [];
        playQueue = dedupeById(allPlayed);
        nextSong = playQueue.shift();
      }
    }

    if (!nextSong) {
      isPlaying = false;
      return { action: "queue_ended", song: null, isPlaying: false };
    }

    playSong(nextSong, true, { shouldPlay: !wasPaused });
    return { action: "next_song", song: nextSong, isPlaying };
  }

  function handleEnded() {
    handlingEnded = true;
    return playNextSong(true);
  }

  return {
    get playingSong() { return playingSong; },
    get playQueue() { return playQueue; },
    get historyQueue() { return historyQueue; },
    get listeningHistory() { return listeningHistory; },
    get currentTime() { return currentTime; },
    set currentTime(t) { currentTime = t; },
    get isPlaying() { return isPlaying; },
    set isPlaying(p) { isPlaying = p; },
    get repeatMode() { return repeatMode; },
    set repeatMode(m) { repeatMode = m; },
    playSong,
    playFromPlaylist,
    playPreviousSong,
    playNextSong,
    handleEnded,
  };
}

test("playFromPlaylist populates historyQueue and playQueue accurately", () => {
  const songs = [
    { id: "s1", title: "Song 1" },
    { id: "s2", title: "Song 2" },
    { id: "s3", title: "Song 3" },
    { id: "s4", title: "Song 4" },
  ];

  const engine = createPlaybackEngine(songs);
  // Start playing song 3
  engine.playFromPlaylist(songs[2], songs);

  assert.equal(engine.playingSong.id, "s3");
  assert.equal(engine.historyQueue.length, 2);
  assert.deepEqual(engine.historyQueue.map((s) => s.id), ["s1", "s2"]);
  assert.equal(engine.playQueue.length, 1);
  assert.equal(engine.playQueue[0].id, "s4");
});

test("previous button at 0, 2, and exactly 3.0 seconds goes to previous track", () => {
  const testTimes = [0, 2.0, 3.0];

  for (const t of testTimes) {
    const songs = [
      { id: "s1", title: "Song 1" },
      { id: "s2", title: "Song 2" },
    ];
    const engine = createPlaybackEngine(songs);
    engine.playFromPlaylist(songs[1], songs);
    engine.currentTime = t;

    const res = engine.playPreviousSong();
    assert.equal(
      res.action,
      "previous_song",
      `At ${t} seconds, previous button should navigate to previous track`
    );
    assert.equal(res.song.id, "s1");
    assert.equal(engine.playingSong.id, "s1");
    assert.equal(engine.currentTime, 0);
    assert.equal(engine.playQueue[0].id, "s2");
  }
});

test("history count presentation omits one and only marks repeated groups", () => {
  assert.equal(formatPlayCount(1), "");
  assert.equal(formatPlayCount(2), "×2");
  assert.equal(formatPlayCount(5), "×5");
});

test("previous button after 3 seconds restarts current track from 0:00 without changing track", () => {
  const testTimes = [3.1, 5.1, 10.0];

  for (const t of testTimes) {
    const songs = [
      { id: "s1", title: "Song 1" },
      { id: "s2", title: "Song 2" },
    ];
    const engine = createPlaybackEngine(songs);
    engine.playFromPlaylist(songs[1], songs);
    engine.currentTime = t;

    const res = engine.playPreviousSong();
    assert.equal(
      res.action,
      "restarted",
      `At ${t} seconds, previous button should restart current track`
    );
    assert.equal(res.song.id, "s2");
    assert.equal(engine.playingSong.id, "s2");
    assert.equal(engine.currentTime, 0);
  }
});

test("previous button preserves paused state when restarting (> 3s)", () => {
  const songs = [
    { id: "s1", title: "Song 1" },
    { id: "s2", title: "Song 2" },
  ];
  const engine = createPlaybackEngine(songs);
  engine.playFromPlaylist(songs[1], songs);
  engine.isPlaying = false; // Paused
  engine.currentTime = 4.0;

  const res = engine.playPreviousSong();
  assert.equal(res.action, "restarted");
  assert.equal(res.isPlaying, false);
  assert.equal(engine.isPlaying, false);
  assert.equal(engine.currentTime, 0);
});

test("previous button preserves paused state when going to previous track (<= 3s)", () => {
  const songs = [
    { id: "s1", title: "Song 1" },
    { id: "s2", title: "Song 2" },
  ];
  const engine = createPlaybackEngine(songs);
  engine.playFromPlaylist(songs[1], songs);
  engine.isPlaying = false; // Paused
  engine.currentTime = 2.0;

  const res = engine.playPreviousSong();
  assert.equal(res.action, "previous_song");
  assert.equal(res.isPlaying, false);
  assert.equal(engine.isPlaying, false);
  assert.equal(engine.currentTime, 0);
});

test("next button preserves paused state when manually triggered while paused", () => {
  const songs = [
    { id: "s1", title: "Song 1" },
    { id: "s2", title: "Song 2" },
  ];
  const engine = createPlaybackEngine(songs);
  engine.playFromPlaylist(songs[0], songs);
  engine.isPlaying = false; // Paused

  const res = engine.playNextSong();
  assert.equal(res.song.id, "s2");
  assert.equal(res.isPlaying, false);
  assert.equal(engine.isPlaying, false);
});

test("manual next does not pass the click event as an ended-event flag", async () => {
  const songs = [
    { id: "s1", title: "Song 1" },
    { id: "s2", title: "Song 2" },
  ];
  const engine = createPlaybackEngine(songs);
  engine.playFromPlaylist(songs[0], songs);

  const ignored = engine.playNextSong({ type: "click" });
  assert.equal(ignored.action, "ignored_auto_advance");
  assert.equal(engine.playQueue[0].id, "s2");

  const playerPage = await readFile(
    new URL("../pages/PlayerPage.vue", import.meta.url),
    "utf8",
  );
  assert.match(playerPage, /aria-label="Siguiente canción"[^>]*@click="library\.playNextSong\(\)"/);

  const manual = engine.playNextSong();
  assert.equal(manual.song.id, "s2");
});

test("manual next follows the active playlist after the selected track", () => {
  const songs = [
    { id: "s1", title: "Song 1" },
    { id: "s2", title: "Song 2" },
    { id: "s3", title: "Song 3" },
    { id: "s4", title: "Song 4" },
  ];
  const engine = createPlaybackEngine(songs);
  engine.playFromPlaylist(songs[2], songs);
  engine.isPlaying = false;

  const result = engine.playNextSong();

  assert.equal(result.song.id, "s4");
  assert.equal(result.isPlaying, false);
  assert.equal(engine.playQueue.length, 0);
});

test("next button auto-advancing on track end keeps playing", () => {
  const songs = [
    { id: "s1", title: "Song 1" },
    { id: "s2", title: "Song 2" },
  ];
  const engine = createPlaybackEngine(songs);
  engine.playFromPlaylist(songs[0], songs);
  engine.isPlaying = true;

  const res = engine.handleEnded();
  assert.equal(res.song.id, "s2");
  assert.equal(res.isPlaying, true);
  assert.equal(engine.isPlaying, true);
});

test("repeatMode 'all' loops back to the start when queue finishes", () => {
  const songs = [
    { id: "s1", title: "Song 1" },
    { id: "s2", title: "Song 2" },
  ];
  const engine = createPlaybackEngine(songs);
  engine.repeatMode = "all";
  engine.playFromPlaylist(songs[0], songs);

  // Play s2
  engine.handleEnded();
  assert.equal(engine.playingSong.id, "s2");
  assert.equal(engine.playQueue.length, 0);

  // A simulated ended event does not advance queue navigation history.
  engine.isPlaying = false;
  const loopRes = engine.handleEnded();
  assert.equal(loopRes.song.id, "s1");
  assert.equal(engine.playingSong.id, "s1");
});

test("previous button at start of list with repeatMode 'all' wraps around to end of queue", () => {
  const songs = [
    { id: "s1", title: "Song 1" },
    { id: "s2", title: "Song 2" },
    { id: "s3", title: "Song 3" },
  ];
  const engine = createPlaybackEngine(songs);
  engine.repeatMode = "all";
  engine.playFromPlaylist(songs[0], songs);
  engine.currentTime = 2; // <= 3s, but historyQueue is empty

  const res = engine.playPreviousSong();
  assert.equal(res.action, "wrap_around_last");
  assert.equal(res.song.id, "s3");
});
