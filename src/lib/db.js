import { openDB } from "idb";

export const dbPromise = openDB(
  "music-player",
  1,
  {
    upgrade(db) {
      db.createObjectStore(
        "settings"
      );
    }
  }
);