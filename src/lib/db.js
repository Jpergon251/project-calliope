import { openDB } from "idb";

export const dbPromise = openDB(
  "music-player",
  10,
  {
    upgrade(db) {

      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings");
      }

      if (!db.objectStoreNames.contains("metadata")) {
        db.createObjectStore("metadata", {
          keyPath: "id"
        });
      }

      if (!db.objectStoreNames.contains("playlists")) {
        db.createObjectStore("playlists", {
          keyPath: "id"
        });
      }

      if (!db.objectStoreNames.contains("albums")) {
        db.createObjectStore("albums", {
          keyPath: "id"
        });
      }

      if (!db.objectStoreNames.contains("history")) {
        db.createObjectStore("history", {
          keyPath: "id"
        });
      }

      if (!db.objectStoreNames.contains("profiles")) {
        db.createObjectStore("profiles", {
          keyPath: "id"
        });
      }

      if (!db.objectStoreNames.contains("playback_stats")) {
        db.createObjectStore("playback_stats", {
          keyPath: "id"
        });
      }

      if (!db.objectStoreNames.contains("song_ratings")) {
        db.createObjectStore("song_ratings", {
          keyPath: "id"
        });
      }

    }
  }
);