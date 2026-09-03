import { openDB } from "idb";

export const dbPromise = openDB(
  "music-player",
  8,
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

    }
  }
);