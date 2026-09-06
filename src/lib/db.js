import { openDB } from "idb";

export const dbPromise = openDB(
  "music-player",
  12,
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

      if (!db.objectStoreNames.contains("recordings")) {
        const store = db.createObjectStore("recordings", { keyPath: "id" });
        store.createIndex("fileId", "fileId", { unique: false });
        store.createIndex("musicBrainzRecordingId", "musicBrainzRecordingId", { unique: false });
        store.createIndex("isrc", "isrc", { unique: false });
        store.createIndex("title", "title", { unique: false });
        store.createIndex("artist", "artist", { unique: false });
      }

      if (!db.objectStoreNames.contains("releases")) {
        const store = db.createObjectStore("releases", { keyPath: "id" });
        store.createIndex("musicBrainzReleaseId", "musicBrainzReleaseId", { unique: false });
        store.createIndex("releaseGroupId", "releaseGroupId", { unique: false });
        store.createIndex("type", "type", { unique: false });
        store.createIndex("artist", "artist", { unique: false });
        store.createIndex("title", "title", { unique: false });
      }

      if (!db.objectStoreNames.contains("releaseGroups")) {
        const store = db.createObjectStore("releaseGroups", { keyPath: "id" });
        store.createIndex("musicBrainzReleaseGroupId", "musicBrainzReleaseGroupId", { unique: false });
        store.createIndex("primaryType", "primaryType", { unique: false });
        store.createIndex("title", "title", { unique: false });
      }

      if (!db.objectStoreNames.contains("releaseTracks")) {
        const store = db.createObjectStore("releaseTracks", { keyPath: "id" });
        store.createIndex("recordingId", "recordingId", { unique: false });
        store.createIndex("releaseId", "releaseId", { unique: false });
        store.createIndex("releaseTrack", ["releaseId", "discNumber", "trackNumber"], { unique: false });
      }

      if (!db.objectStoreNames.contains("artists")) {
        const store = db.createObjectStore("artists", { keyPath: "id" });
        store.createIndex("name", "name", { unique: false });
        store.createIndex("musicBrainzArtistId", "musicBrainzArtistId", { unique: false });
      }

      if (!db.objectStoreNames.contains("covers")) {
        const store = db.createObjectStore("covers", { keyPath: "id" });
        store.createIndex("releaseId", "releaseId", { unique: false });
        store.createIndex("recordingId", "recordingId", { unique: false });
        store.createIndex("source", "source", { unique: false });
      }

    }
  }
);