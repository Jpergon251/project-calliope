// audioIdentification.js
// ============================================================================
// CALLIOPE AUDIO IDENTIFICATION ENGINE
// ============================================================================
// Estrategia:
//   File
//    ├─ Local metadata
//    ├─ Filename analysis
//    ├─ Web Audio decoding
//    ├─ Chromaprint / AcoustID
//    ├─ MusicBrainz ISRC
//    ├─ MusicBrainz text search
//    ├─ iTunes
//    ├─ LRCLIB
//    └─ Optional acoustic provider / proxy
//
// Después:
//
//   Todas las fuentes
//       ↓
//   candidatos normalizados
//       ↓
//   agrupación de identidades
//       ↓
//   consenso campo por campo
//       ↓
//   enriquecimiento MusicBrainz
//       ↓
//   resolución de géneros
//       ↓
//   metadata final
//
// IMPORTANTE:
// - Una fuente que falla NO detiene las demás.
// - Un género válido NO necesita consenso para sobrevivir.
// - "Music", "Unknown", etc. se eliminan.
// - "A Bocaitos - Single" se normaliza a "A Bocaitos".
// ============================================================================

import { parseBlob } from "music-metadata";
import { Fingerprinter } from "rusty-chromaprint-wasm";
import {
  createRecording,
  createRelease,
  createReleaseGroup,
  createReleaseTrack,
  normalizeArtistCredits,
  cleanGenres,
  resolveReleaseType,
  normalizeComparable,
} from "../models/musicEntities.js";
import {
  deduplicateRecordingCandidates,
  deduplicateReleases,
  rankRecordingCandidates,
  rankReleases,
  IDENTIFICATION_LIMITS,
} from "./identificationRanking.js";

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const ENV = import.meta.env || {};

const CONFIG = {
  acoustid: {
    client: ENV.VITE_ACOUSTID_CLIENT,
    endpoint: "https://api.acoustid.org/v2/lookup",
  },

  musicbrainz: {
    endpoint: "https://musicbrainz.org/ws/2",
    userAgent:
      ENV.VITE_MUSICBRAINZ_USER_AGENT || "Calliope/2.1.0 (local music player)",
    minInterval: 1100,
    timeout: 15000,
    retries: 0,
    retryDelay: 1500,
  },

  itunes: {
    endpoint: "https://itunes.apple.com/search",
    timeout: 12000,
  },

  deezer: {
    endpoint: "https://api.deezer.com",
    proxyEndpoint: ENV.VITE_DEEZER_PROXY_URL || "",
    timeout: 12000,
  },

  lrclib: {
    endpoint: "https://lrclib.net",
    timeout: 12000,
  },

  optionalProvider: {
    enabled:
      String(
        ENV.VITE_AUDIO_IDENTIFICATION_PROXY_ENABLED || "",
      ).toLowerCase() === "true",

    endpoint: ENV.VITE_AUDIO_IDENTIFICATION_PROXY_URL || "",

    timeout: 20000,
  },

  audio: {
    sampleRate: 48000,
    channels: 1,
    maxSecondsForFingerprint: 120,
  },

  identification: {
    minConfidence: 0.7,
    strongConfidence: 0.85,
    ambiguityMargin: 0.06,

    minTitleSimilarity: 0.7,
    minArtistSimilarity: 0.65,

    durationExcellent: 0.97,
    durationGood: 0.9,
    durationAcceptable: 0.75,
  },

  diagnostics: {
    enabled: true,
  },
};

const MIN_FINGERPRINT_MATCH_SCORE = 0.5;

// ============================================================================
// PESOS DE FUENTES
// ============================================================================

const PROVIDER_WEIGHTS = {
  acoustid: 1.0,
  musicbrainz_isrc: 0.98,
  musicbrainz: 0.9,
  optional: 0.95,
  itunes: 0.8,
  deezer: 0.82,
  lrclib: 0.25,
};

// ============================================================================
// GENRES
// ============================================================================

const GENERIC_GENRES = new Set([
  "music",
  "musica",
  "música",
  "unknown",
  "unknown genre",
  "unk",
  "other",
  "others",
  "otro",
  "otros",
  "misc",
  "miscellaneous",
  "various",
  "various music",
  "audio",
  "sound",
  "song",
  "songs",
  "genre",
  "general",
  "general music",
  "popular",
  "popular music",
  "undefined",
  "null",
]);

const GENRE_NOISE = new Set([
  "favorite",
  "favorites",
  "favourite",
  "favourites",
  "seen live",
  "awesome",
  "love",
  "albums i own",
  "spotify",
  "youtube",
]);

const GENRE_ALIASES = new Map([
  ["latin pop", "latin pop"],
  ["pop latino", "latin pop"],
  ["pop latina", "latin pop"],
  ["latino pop", "latin pop"],
  ["spanish pop", "spanish pop"],
  ["pop espanol", "spanish pop"],
  ["pop español", "spanish pop"],
  ["pop en espanol", "spanish pop"],
  ["pop en español", "spanish pop"],
  ["electropop", "electropop"],
  ["electro pop", "electropop"],
]);

const GENRE_DISPLAY_NAMES = {
  "latin pop": "Latin Pop",
  "spanish pop": "Spanish Pop",
  electropop: "Electropop",
};

const GENRE_PARENT_KEYS = new Map([
  ["latin pop", "pop"],
  ["spanish pop", "pop"],
  ["electropop", "pop"],
]);

// ============================================================================
// UTILIDADES
// ============================================================================

function clamp(value, min = 0, max = 1) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return min;
  }

  return Math.min(max, Math.max(min, number));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function isMusicBrainzId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    safeString(value),
  );
}

function normalizeText(value) {
  return safeString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[()[\]{}]/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeIsrc(value) {
  return safeString(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeArtist(value) {
  return normalizeText(value)
    .replace(/\b(feat|ft|featuring)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTrackTitle(value) {
  return normalizeText(value)
    .replace(/\s*\((?:feat\.?|ft\.?|featuring|con)\b[^)]*\)/gi, "")
    .replace(/\s*\[(?:feat\.?|ft\.?|featuring|con)\b[^\]]*\]/gi, "")
    .replace(/\s+(?:feat\.?|ft\.?|featuring|con)\s+.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function comparableTrackTitle(value) {
  const withoutEditionSuffix = safeString(value)
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .replace(/\s*\[[^\]]*\]\s*$/g, "")
    .trim();
  const normalized = normalizeTrackTitle(withoutEditionSuffix);
  return normalized || withoutEditionSuffix.toLocaleLowerCase();
}

function trackTitleSimilarity(left, right) {
  return Math.max(
    similarity(left, right),
    similarity(comparableTrackTitle(left), comparableTrackTitle(right)),
  );
}

function similarity(a, b) {
  const aa = normalizeText(a);
  const bb = normalizeText(b);

  if (!aa || !bb) {
    return 0;
  }

  if (aa === bb) {
    return 1;
  }

  const distance = levenshteinDistance(aa, bb);
  const maxLength = Math.max(aa.length, bb.length);

  if (!maxLength) {
    return 1;
  }

  return clamp(1 - distance / maxLength);
}

function artistSimilarity(a, b) {
  const aa = normalizeArtist(a);
  const bb = normalizeArtist(b);

  if (!aa || !bb) {
    return 0;
  }

  if (aa === bb) {
    return 1;
  }

  const splitArtists = (value) =>
    value
      .split(/\s*(?:,|&|\b(?:and|y|con|feat\.?|ft\.?|featuring)\b)\s*/i)
      .map((item) => normalizeArtist(item))
      .filter(Boolean);
  const leftArtists = new Set(splitArtists(aa));
  const rightArtists = new Set(splitArtists(bb));
  const sharedArtists = [...leftArtists].filter((artist) =>
    rightArtists.has(artist),
  );

  if (
    sharedArtists.length &&
    (sharedArtists.length === leftArtists.size ||
      sharedArtists.length === rightArtists.size)
  ) {
    return 0.92;
  }

  return similarity(aa, bb);
}

function levenshteinDistance(a, b) {
  if (a === b) {
    return 0;
  }

  if (!a.length) {
    return b.length;
  }

  if (!b.length) {
    return a.length;
  }

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];

    for (let j = 1; j <= b.length; j += 1) {
      const insertion = current[j - 1] + 1;
      const deletion = previous[j] + 1;
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);

      current.push(Math.min(insertion, deletion, substitution));
    }

    previous = current;
  }

  return previous[b.length];
}

function durationSimilarity(a, b) {
  const aa = Number(a);
  const bb = Number(b);

  if (!Number.isFinite(aa) || !Number.isFinite(bb) || aa <= 0 || bb <= 0) {
    return 0;
  }

  const difference = Math.abs(aa - bb);

  if (difference <= 1) {
    return 1;
  }

  if (difference <= 2) {
    return 0.97;
  }

  if (difference <= 4) {
    return 0.9;
  }

  if (difference <= 8) {
    return 0.75;
  }

  if (difference <= 15) {
    return 0.5;
  }

  return 0;
}

function parseYear(value) {
  const match = safeString(value).match(/\b(19|20)\d{2}\b/);

  return match ? match[0] : "";
}

function cleanText(value) {
  return safeString(value).replace(/\s+/g, " ").trim();
}

// ============================================================================
// GENRES & RELEASE TYPE
// ============================================================================

function normalizeGenreName(value) {
  return cleanText(value)
    .replace(/^["']+|["']+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalGenre(value) {
  const normalized = normalizeText(value);

  return GENRE_ALIASES.get(normalized) || normalized;
}

function displayGenreName(value) {
  const normalized = normalizeGenreName(value);
  const canonical = canonicalGenre(normalized);

  return GENRE_DISPLAY_NAMES[canonical] || normalized;
}

function isUsefulGenre(value) {
  const genre = normalizeGenreName(value);

  if (!genre) {
    return false;
  }

  const canonical = canonicalGenre(genre);

  if (!canonical) {
    return false;
  }

  if (GENERIC_GENRES.has(canonical)) {
    return false;
  }

  if (GENRE_NOISE.has(canonical)) {
    return false;
  }

  // Evitar etiquetas que son claramente años.
  if (/^\d{4}s?$/.test(canonical)) {
    return false;
  }

  if (genre.length > 80) {
    return false;
  }

  return true;
}

// ============================================================================
// RELEASE TYPE DETECTION
// ============================================================================

function detectReleaseType(entity) {
  if (!entity) {
    return "unknown";
  }

  const primaryType = safeString(
    entity?.["primary-type"] || entity?.["release-group"]?.["primary-type"],
  ).toLowerCase();

  if (primaryType === "single") return "single";
  if (primaryType === "album") return "album";
  if (primaryType === "ep") return "ep";
  if (primaryType === "compilation") return "compilation";
  if (primaryType === "live") return "live";

  const secondaryTypes = Array.isArray(entity?.["secondary-types"])
    ? entity["secondary-types"]
    : Array.isArray(entity?.["release-group"]?.["secondary-types"])
      ? entity["release-group"]["secondary-types"]
      : [];

  for (const type of secondaryTypes) {
    const normalized = safeString(type).toLowerCase();
    if (normalized === "compilation") return "compilation";
    if (normalized === "soundtrack") return "soundtrack";
    if (normalized === "live") return "live";
    if (normalized === "mixtape" || normalized === "mixtape/street")
      return "mixtape";
  }

  if (primaryType) return primaryType;
  return "unknown";
}

function extractGenres(entity) {
  if (!entity) {
    return [];
  }

  const genres = [];

  if (Array.isArray(entity.genres)) {
    for (const item of entity.genres) {
      const value = typeof item === "string" ? item : item?.name;

      if (isUsefulGenre(value)) {
        genres.push(normalizeGenreName(value));
      }
    }
  }

  return uniqueGenres(genres);
}

function extractTags(entity) {
  if (!entity || !Array.isArray(entity.tags)) {
    return [];
  }

  const tags = [];

  for (const item of entity.tags) {
    const value = typeof item === "string" ? item : item?.name;

    if (isUsefulGenre(value)) {
      tags.push(normalizeGenreName(value));
    }
  }

  return uniqueGenres(tags);
}

function uniqueGenres(values) {
  const result = [];
  const seen = new Set();

  for (const value of values || []) {
    const genre = normalizeGenreName(value);

    if (!isUsefulGenre(genre)) {
      continue;
    }

    const key = canonicalGenre(genre);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(genre);
  }

  return result;
}

// ============================================================================
// ALBUM TITLE SANITIZATION
// ============================================================================

function sanitizeAlbumName(
  albumName,
  trackTitle = "",
  releaseType = "unknown",
) {
  let value = cleanText(albumName);

  if (!value) {
    return "";
  }

  const track = cleanText(trackTitle);

  // Patrones para sufijos de single/sencillo
  const singlePattern =
    /\s*(?:[-–—:|]\s*)?\(?\[?(?:single|sencillo)\]?\)?\s*$/i;

  const hasSingleSuffix = singlePattern.test(value);

  // Si es un single (por type o por sufijo), intentar limpiar
  if ((releaseType === "single" || hasSingleSuffix) && value) {
    const stripped = value.replace(singlePattern, "").trim();

    // Si el nombre sin sufijo coincide mucho con la pista, usar la pista como álbum
    if (stripped && track && similarity(stripped, track) >= 0.94) {
      return track;
    }

    // Si el nombre completo coincide mucho con la pista, también usar la pista
    if (track && similarity(value, track) >= 0.94) {
      return track;
    }

    // Usar el nombre sin sufijo si existe
    if (stripped) {
      return stripped;
    }
  }

  return value;
}

// ============================================================================
// DIAGNÓSTICOS
// ============================================================================

function createDiagnostics() {
  return {
    engine: "Calliope Audio Identification Engine",
    version: "2.1.0",
    startedAt: new Date().toISOString(),
    finishedAt: null,

    attempts: [],

    evidence: {
      localMetadata: null,
      filename: null,
      fingerprint: null,
      genreResolution: null,
      fieldConsensus: null,
    },

    candidateCount: 0,
    identityCount: 0,
    winner: null,

    errors: [],
    warnings: [],
  };
}

function beginAttempt(diagnostics, provider, details = {}) {
  const attempt = {
    provider,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
    resultCount: 0,
    ...details,
  };

  diagnostics.attempts.push(attempt);

  return attempt;
}

function finishAttempt(attempt, status, resultCount = 0, details = {}) {
  const finishedAt = Date.now();

  attempt.status = status;
  attempt.finishedAt = new Date().toISOString();
  attempt.durationMs = finishedAt - new Date(attempt.startedAt).getTime();
  attempt.resultCount = resultCount;

  Object.assign(attempt, details);

  return attempt;
}

async function runProvider(diagnostics, provider, executor) {
  const attempt = beginAttempt(diagnostics, provider);

  try {
    const result = await executor();

    const resultCount = Array.isArray(result)
      ? result.length
      : Array.isArray(result?.results)
        ? result.results.length
        : result
          ? 1
          : 0;

    finishAttempt(
      attempt,
      resultCount > 0 ? "success" : "no_match",
      resultCount,
    );

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : safeString(error);

    finishAttempt(attempt, "error", 0, {
      error: message,
      httpStatus: error?.status || null,
      retryCount: error?.retryCount || 0,
    });

    diagnostics.errors.push({
      provider,
      message,
    });
    console.warn(`[Calliope] Provider ${provider} failed:`, message);

    return null;
  }
}

// ============================================================================
// FETCH
// ============================================================================

async function fetchWithTimeout(url, options = {}, timeout = 12000) {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    const text = await response.text();

    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const error = new Error(
        `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
      );

      error.status = response.status;
      error.data = data;
      error.retryAfter = response.headers.get("retry-after");

      throw error;
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchJsonWithRetry(
  url,
  options = {},
  {
    timeout = 12000,
    retries = 1,
    retryDelay = 1000,
    retryStatuses = [408, 429, 500, 502, 503, 504],
  } = {},
) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchWithTimeout(url, options, timeout);
    } catch (error) {
      lastError = error;
      error.retryCount = attempt;

      if (attempt >= retries || !retryStatuses.includes(error?.status)) {
        throw error;
      }

      let delay = retryDelay * 2 ** attempt;

      const retryAfterHeader = error?.retryAfter || error?.data?.retryAfter;
      const retryAfterSeconds = Number(retryAfterHeader);
      const retryAfterDate = Number.isNaN(retryAfterSeconds)
        ? Date.parse(retryAfterHeader)
        : NaN;
      const retryAfter = Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds
        : Number.isFinite(retryAfterDate)
          ? Math.max(0, (retryAfterDate - Date.now()) / 1000)
          : NaN;

      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        delay = retryAfter * 1000;
      }

      const jitter = Math.round(Math.random() * 250);

      await sleep(delay + jitter);
    }
  }

  throw lastError;
}

// ============================================================================
// MUSICBRAINZ QUEUE
// ============================================================================

let lastMusicBrainzRequest = 0;
let musicBrainzQueue = Promise.resolve();
let musicBrainzUnavailableUntil = 0;

function enqueueMusicBrainz(task) {
  const run = musicBrainzQueue.then(async () => {
    const now = Date.now();
    const elapsed = now - lastMusicBrainzRequest;

    if (elapsed < CONFIG.musicbrainz.minInterval) {
      await sleep(CONFIG.musicbrainz.minInterval - elapsed);
    }

    lastMusicBrainzRequest = Date.now();

    return task();
  });

  musicBrainzQueue = run.catch(() => {});

  return run;
}

async function musicBrainzRequest(path, params = {}) {
  if (Date.now() < musicBrainzUnavailableUntil) {
    return null;
  }

  const url = new URL(`${CONFIG.musicbrainz.endpoint}${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  return enqueueMusicBrainz(() =>
    fetchJsonWithRetry(
      url.toString(),
      {
        headers: {
          Accept: "application/json",
          "User-Agent": CONFIG.musicbrainz.userAgent,
        },
      },
      {
        timeout: CONFIG.musicbrainz.timeout,
        retries: CONFIG.musicbrainz.retries,
        retryDelay: CONFIG.musicbrainz.retryDelay,
      },
    ),
  ).catch((error) => {
    if (error?.status === 503) {
      const retryAfter = Number(error.retryAfter);
      const cooldown =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 30000;
      musicBrainzUnavailableUntil = Date.now() + Math.min(cooldown, 120000);
      console.warn(
        "[Calliope] MusicBrainz no disponible temporalmente; se continúa con los demás providers.",
      );
      return null;
    }
    throw error;
  });
}

// ============================================================================
// LOCAL METADATA
// ============================================================================

async function readLocalMetadata(file) {
  try {
    const metadata = await parseBlob(file);

    const common = metadata?.common || {};
    const format = metadata?.format || {};

    return {
      title: cleanText(common.title),
      artist: cleanText(common.artist || common.artists?.join(", ")),
      albumArtist: cleanText(common.albumartist || common.albumArtist),
      album: cleanText(common.album),
      year: common.year ? String(common.year) : "",
      track: common.track?.no ? String(common.track.no) : "",
      trackTotal: common.track?.of ? String(common.track.of) : "",
      disk: common.disk?.no ? String(common.disk.no) : "",
      diskTotal: common.disk?.of ? String(common.disk.of) : "",
      genre: uniqueGenres(
        Array.isArray(common.genre)
          ? common.genre
          : common.genre
            ? [common.genre]
            : [],
      ),
      isrc:
        normalizeIsrc(
          Array.isArray(common.isrc) ? common.isrc[0] : common.isrc,
        ) || "",
      musicBrainzRecordingId: isMusicBrainzId(common.musicbrainz_recordingid)
        ? safeString(common.musicbrainz_recordingid)
        : "",
      musicBrainzReleaseId: isMusicBrainzId(common.musicbrainz_releaseid)
        ? safeString(common.musicbrainz_releaseid)
        : "",
      musicBrainzReleaseGroupId: isMusicBrainzId(
        common.musicbrainz_releasegroupid,
      )
        ? safeString(common.musicbrainz_releasegroupid)
        : "",
      acoustid: safeString(common.acoustid_id),
      duration: Number.isFinite(format.duration) ? format.duration : 0,
    };
  } catch {
    return {
      title: "",
      artist: "",
      albumArtist: "",
      album: "",
      year: "",
      track: "",
      trackTotal: "",
      disk: "",
      diskTotal: "",
      genre: [],
      isrc: "",
      musicBrainzRecordingId: "",
      musicBrainzReleaseId: "",
      musicBrainzReleaseGroupId: "",
      acoustid: "",
      duration: 0,
    };
  }
}

// ============================================================================
// FILENAME
// ============================================================================

function parseFilename(fileName) {
  let value = safeString(fileName);

  value = value.replace(/\.[^.]+$/, "");

  value = value.replace(/^\s*\d{1,3}\s*[-._)]\s*/, "").trim();

  let artist = "";
  let title = value;

  const separators = [" - ", " – ", " — "];

  for (const separator of separators) {
    const parts = value.split(separator);

    if (parts.length >= 2) {
      artist = cleanText(parts[0]);
      title = cleanText(parts.slice(1).join(separator));

      break;
    }
  }

  return {
    artist,
    title,
  };
}

// ============================================================================
// AUDIO / FINGERPRINT
// ============================================================================

async function decodeAudio(file) {
  const arrayBuffer = await file.arrayBuffer();

  const AudioContextClass =
    typeof window !== "undefined"
      ? window.AudioContext || window.webkitAudioContext
      : globalThis.AudioContext || globalThis.webkitAudioContext;

  if (!AudioContextClass) {
    throw new Error("Web Audio API no disponible");
  }

  const context = new AudioContextClass();

  try {
    return await context.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    await context.close().catch(() => {});
  }
}

function audioBufferToMonoInt16(audioBuffer, maxSeconds) {
  const sampleRate = audioBuffer.sampleRate;

  const maxSamples = Math.floor(sampleRate * maxSeconds);

  const length = Math.min(audioBuffer.length, maxSamples);

  const mono = new Float32Array(length);

  const channels = audioBuffer.numberOfChannels;

  for (let channel = 0; channel < channels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);

    for (let i = 0; i < length; i += 1) {
      mono[i] += data[i] / channels;
    }
  }

  const pcm = new Int16Array(length);

  for (let i = 0; i < length; i += 1) {
    const sample = Math.max(-1, Math.min(1, mono[i]));

    pcm[i] =
      sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767);
  }

  return pcm;
}

async function generateFingerprint(file) {
  const audioBuffer = await decodeAudio(file);

  const pcm = audioBufferToMonoInt16(
    audioBuffer,
    CONFIG.audio.maxSecondsForFingerprint,
  );

  const fingerprinter = new Fingerprinter();

  // `pcm` ya está mezclado a mono; declarar el canal original aquí degrada
  // la huella y puede producir coincidencias erróneas en archivos estéreo.
  fingerprinter.start(audioBuffer.sampleRate, 1);

  fingerprinter.consume(pcm);

  fingerprinter.finish();
  const fingerprint = fingerprinter.getCompressedFingerprint();
  fingerprinter.free();

  return {
    fingerprint,
    duration: audioBuffer.duration,
    sampleRate: audioBuffer.sampleRate,
    channels: audioBuffer.numberOfChannels,
  };
}

// ============================================================================
// ACOUSTID
// ============================================================================

async function queryAcoustID(fingerprint, duration) {
  if (!fingerprint || !CONFIG.acoustid.client) {
    return [];
  }

  const url = new URL(CONFIG.acoustid.endpoint);

  url.searchParams.set("client", CONFIG.acoustid.client);

  url.searchParams.set("meta", "recordings+releasegroups+releases+compress");

  url.searchParams.set("duration", String(Math.round(duration || 0)));

  url.searchParams.set("fingerprint", fingerprint);

  const data = await fetchJsonWithRetry(
    url.toString(),
    {},
    {
      timeout: 15000,
      retries: 1,
    },
  );

  const results = Array.isArray(data?.results) ? data.results : [];

  const candidates = [];

  for (const result of results) {
    const score = clamp(result?.score);

    const recordings = Array.isArray(result?.recordings)
      ? result.recordings
      : [];

    for (const recording of recordings) {
      candidates.push(
        makeCandidate({
          provider: "acoustid",
          sourceType: "fingerprint",
          providerScore: score,

          title: recording?.title,

          artist: extractArtistCredit(recording),

          artists: extractArtistCredits(recording),

          artistCredits: extractArtistCredits(recording),

          album:
            recording?.releases?.[0]?.title ||
            recording?.releasegroups?.[0]?.title ||
            "",

          duration: duration,

          recordingId: safeString(recording?.id),

          releaseId: safeString(recording?.releases?.[0]?.id),

          releaseGroupId: safeString(recording?.releasegroups?.[0]?.id),

          isrc: normalizeIsrc(recording?.isrcs?.[0]),

          genres: extractGenres(recording),

          tags: extractTags(recording),

          raw: {
            acoustid: result,
            recording,
          },
        }),
      );
    }
  }

  return candidates;
}

function buildFieldChoices(candidates = [], winner = null) {
  const matching = candidates.filter((candidate) => {
    if (!winner || candidate === winner) return true;
    const titleScore = trackTitleSimilarity(candidate.title, winner.title);
    const artistScore = artistSimilarity(candidate.artist, winner.artist);
    const durationScore = durationSimilarity(
      candidate.duration,
      winner.duration,
    );
    return (
      titleScore >= 0.82 &&
      artistScore >= 0.7 &&
      (durationScore >= 0.5 || !candidate.duration || !winner.duration)
    );
  });
  const choicesFor = (field, normalize = normalizeText) => {
    const map = new Map();
    for (const candidate of matching) {
      const value = field === "genres" ? candidate.genres : candidate[field];
      const values = Array.isArray(value) ? value : [value];
      for (const item of values.filter(Boolean)) {
        const key = normalize(item);
        if (!key) continue;
        const current = map.get(key) || {
          value: item,
          sources: [],
          providers: [],
        };
        current.sources.push(candidate.provider);
        current.providers.push(candidate.provider);
        map.set(key, current);
      }
    }
    return [...map.values()].map((item) => ({
      ...item,
      sources: [...new Set(item.sources)],
      providers: [...new Set(item.providers)],
    }));
  };
  return {
    title: choicesFor("title"),
    artists: choicesFor("artist", normalizeArtist),
    albumArtists: choicesFor("albumArtist", normalizeArtist),
    genres: choicesFor("genres", canonicalGenre),
    cover: choicesFor("cover", (value) => String(value).trim()),
  };
}

// ============================================================================
// MUSICBRAINZ - ARTIST
// ============================================================================

function extractArtistNames(entity) {
  return extractArtistCredits(entity).map((credit) => credit.name);
}

function extractArtistCredit(entity) {
  return extractArtistCredits(entity)
    .map((credit) => credit.name)
    .join(", ")
    .trim();
}

function extractArtistCredits(entity) {
  if (!Array.isArray(entity?.["artist-credit"])) {
    return [];
  }

  return normalizeArtistCredits(entity["artist-credit"])
    .map((credit) => ({
      id: credit.artistId || "",
      name: cleanText(credit.name),
      role: credit.role || "main",
      joinphrase: credit.joinphrase || "",
    }))
    .filter((credit) => credit.name);
}

function artistListFromMetadata(artist, entity) {
  const structuredNames = extractArtistNames(entity);

  return structuredNames.length ? structuredNames : artist ? [artist] : [];
}

// ============================================================================
// MUSICBRAINZ - ISRC
// ============================================================================

async function queryMusicBrainzISRC(isrc) {
  const normalized = normalizeIsrc(isrc);

  if (!normalized) {
    return [];
  }

  const data = await musicBrainzRequest(
    `/isrc/${encodeURIComponent(normalized)}`,
    {
      inc: "artist-credits+releases+release-groups+genres+tags+isrcs",
      fmt: "json",
    },
  );

  const recordings = Array.isArray(data?.recordings) ? data.recordings : [];

  return recordings.map((recording) =>
    makeCandidate({
      provider: "musicbrainz_isrc",
      sourceType: "isrc",
      providerScore: 1,

      title: recording?.title,

      artist: extractArtistCredit(recording),

      artists: extractArtistCredits(recording),

      artistCredits: extractArtistCredits(recording),

      album:
        recording?.releases?.[0]?.title ||
        recording?.["release-group"]?.title ||
        "",

      recordingId: safeString(recording?.id),

      releaseId: safeString(recording?.releases?.[0]?.id),

      releaseGroupId: safeString(recording?.["release-group"]?.id),

      isrc: normalized,

      genres: extractGenres(recording),

      tags: extractTags(recording),

      raw: recording,
    }),
  );
}

// ============================================================================
// MUSICBRAINZ - TEXT
// ============================================================================

function escapeLucene(value) {
  return safeString(value).replace(/([+\-!(){}\[\]^"~*?:\\/])/g, "\\$1");
}

async function musicBrainzSearch(query) {
  if (!query) {
    return [];
  }

  const data = await musicBrainzRequest("/recording", {
    query,
    limit: "25",
    inc: "artist-credits+releases+release-groups+genres+tags+isrcs",
    fmt: "json",
  });

  return Array.isArray(data?.recordings) ? data.recordings : [];
}

function searchTextVariants(local, filename) {
  const titleValues = [local.title, filename.title].filter(Boolean);
  const artistValues = [
    local.artist,
    local.albumArtist,
    filename.artist,
  ].filter(Boolean);
  const stripSecondaryTitle = (value) =>
    safeString(value)
      .replace(
        /\s*\((?:feat\.?|ft\.?|featuring|remix|version|live|edit|radio edit|acoustic|extended)[^)]*\)/gi,
        "",
      )
      .replace(
        /\s*\[(?:feat\.?|ft\.?|featuring|remix|version|live|edit|radio edit|acoustic|extended)[^\]]*\]/gi,
        "",
      )
      .replace(
        /\s+-\s+(?:remix|live|edit|radio edit|acoustic|extended|remastered)\b.*$/i,
        "",
      )
      .replace(/\s+/g, " ")
      .trim();
  const titles = [
    ...new Set(
      [
        ...titleValues,
        ...titleValues.map(stripSecondaryTitle),
        ...titleValues.map(normalizeComparable),
      ].filter(Boolean),
    ),
  ];
  const artists = [
    ...new Set(
      [...artistValues, ...artistValues.map(normalizeComparable)].filter(
        Boolean,
      ),
    ),
  ];
  return { titles, artists };
}

async function queryMusicBrainzText(local, filename) {
  const { titles, artists } = searchTextVariants(local, filename);
  const queries = [];
  for (const title of titles) {
    for (const artist of artists.slice(0, 3)) {
      queries.push(
        `recording:"${escapeLucene(title)}" AND artist:"${escapeLucene(artist)}"`,
      );
    }
    queries.push(`recording:"${escapeLucene(title)}"`);
  }
  if (artists.length && titles.length) {
    queries.push(
      `artist:"${escapeLucene(artists[0])}" AND recording:"${escapeLucene(titles[0].split(" ").slice(0, 2).join(" "))}"`,
    );
  }

  const results = [];
  const seen = new Set();

  for (const query of queries) {
    const recordings = await musicBrainzSearch(query);

    for (const recording of recordings) {
      const id = safeString(recording?.id);

      if (id && seen.has(id)) {
        continue;
      }

      if (id) {
        seen.add(id);
      }

      results.push(
        makeCandidate({
          provider: "musicbrainz",
          sourceType: "text",

          providerScore: clamp(Number(recording?.score || 0) / 100),

          title: recording?.title,

          artist: extractArtistCredit(recording),

          artists: extractArtistCredits(recording),

          artistCredits: extractArtistCredits(recording),

          album:
            recording?.releases?.[0]?.title ||
            recording?.["release-group"]?.title ||
            "",

          recordingId: id,

          releaseId: safeString(recording?.releases?.[0]?.id),

          releaseGroupId: safeString(recording?.["release-group"]?.id),

          isrc: normalizeIsrc(recording?.isrcs?.[0]),

          genres: extractGenres(recording),

          tags: extractTags(recording),

          raw: recording,
        }),
      );
    }
  }

  return results;
}

// ============================================================================
// ITUNES
// ============================================================================

async function queryITunes(local, filename) {
  const { titles, artists } = searchTextVariants(local, filename);
  const queries = [
    ...titles.flatMap((title) =>
      artists.slice(0, 2).map((artist) => `${artist} ${title}`),
    ),
    ...titles,
  ];

  const results = [];
  const seen = new Set();

  for (const term of queries) {
    const url = new URL(CONFIG.itunes.endpoint);

    url.searchParams.set("term", term);

    url.searchParams.set("country", "ES");

    url.searchParams.set("attribute", "songTerm");

    url.searchParams.set("media", "music");

    url.searchParams.set("entity", "song");

    url.searchParams.set("limit", "50");

    const data = await fetchJsonWithRetry(
      url.toString(),
      {},
      {
        timeout: CONFIG.itunes.timeout,
        retries: 1,
      },
    );

    for (const item of data?.results || []) {
      const key = [
        normalizeArtist(item?.artistName),
        normalizeText(item?.trackName),
        normalizeText(item?.collectionName),
      ].join("|");

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      const candidate = makeCandidate({
        provider: "itunes",
        sourceType: "text",
        providerScore: 0.8,

        title: item?.trackName,

        artist: item?.artistName,

        album: item?.collectionName,

        releaseType: inferITunesReleaseType(item?.collectionName),

        albumArtist: item?.artistName,

        duration: Number(item?.trackTimeMillis || 0) / 1000,

        year: parseYear(item?.releaseDate),

        track: item?.trackNumber ? String(item.trackNumber) : "",

        trackTotal: item?.trackCount ? String(item.trackCount) : "",

        genre: item?.primaryGenreName,

        cover: normalizeArtworkUrl(item?.artworkUrl100),

        raw: item,
      });

      results.push(candidate);
    }
  }

  return results;
}

async function queryDeezer(local, filename) {
  const { titles, artists } = searchTextVariants(local, filename);
  const title = titles[0];
  const artist = artists[0];

  if (!title) {
    return [];
  }

  const endpoint = getDeezerEndpoint("/search");
  if (!endpoint) {
    return [];
  }

  const query = artist
    ? `artist:"${artist}" track:"${title}"`
    : `track:"${title}"`;
  const url = new URL(
    endpoint,
    typeof window !== "undefined" ? window.location.origin : undefined,
  );
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "10");

  const data = await fetchDeezerJson(url.toString());
  const matches = Array.isArray(data?.data) ? data.data : [];
  const results = [];
  const seenAlbums = new Set();

  for (const item of matches) {
    const candidate = makeCandidate({
      provider: "deezer",
      sourceType: "text",
      providerScore: 0.85,
      title: item?.title,
      artist: item?.artist?.name,
      album: item?.album?.title,
      albumArtist: item?.artist?.name,
      duration: Number(item?.duration || 0),
      cover:
        item?.album?.cover_xl || item?.album?.cover_big || item?.album?.cover,
      isrc: item?.isrc,
      raw: item,
    });

    if (!candidate.title || seenAlbums.has(item?.album?.id)) {
      continue;
    }

    seenAlbums.add(item?.album?.id);

    if (item?.album?.id) {
      try {
        const album = await fetchDeezerJson(
          getDeezerEndpoint(`/album/${encodeURIComponent(item.album.id)}`),
        );
        candidate.genres = uniqueGenres(
          album?.genres?.data?.map((genre) => genre?.name).filter(Boolean) ||
            [],
        );
      } catch {
        // Artwork remains useful even when the album genre endpoint fails.
      }
    }

    results.push(candidate);
  }

  return results;
}

async function fetchDeezerJson(url) {
  if (!url) return null;
  return fetchJsonWithRetry(
    url,
    {},
    { timeout: CONFIG.deezer.timeout, retries: 0 },
  );
}

function getDeezerEndpoint(path) {
  if (CONFIG.deezer.proxyEndpoint) {
    return `${CONFIG.deezer.proxyEndpoint.replace(/\/$/, "")}${path}`;
  }

  if (
    typeof window !== "undefined" &&
    /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
  ) {
    return `/api/deezer${path}`;
  }

  return "";
}

function inferITunesReleaseType(collectionName) {
  const title = normalizeText(collectionName);
  if (/(^|\s)(ep)(\s|$)/.test(title)) return "ep";
  if (/(^|\s)(single|sencillo)(\s|$)/.test(title)) return "single";
  return "album";
}

// ============================================================================
// LRCLIB
// ============================================================================

async function queryLRCLIB(local, filename) {
  const { titles, artists } = searchTextVariants(local, filename);
  if (!titles.length) {
    return [];
  }

  const responses = await Promise.all(
    titles.slice(0, 5).map(async (title) => {
      const url = new URL(`${CONFIG.lrclib.endpoint}/api/search`);
      url.searchParams.set("track_name", title);
      if (artists[0]) url.searchParams.set("artist_name", artists[0]);
      if (local.album) url.searchParams.set("album_name", local.album);
      return fetchJsonWithRetry(
        url.toString(),
        {},
        { timeout: CONFIG.lrclib.timeout, retries: 0 },
      );
    }),
  );

  const results = responses.flatMap((data) =>
    Array.isArray(data) ? data : [],
  );
  const seen = new Set();
  return results
    .map((item) =>
      makeCandidate({
        provider: "lrclib",
        sourceType: "text",
        providerScore: 0.55,

        title: item?.trackName,

        artist: item?.artistName,

        album: item?.albumName,

        duration: Number(item?.duration || 0),

        raw: item,
      }),
    )
    .filter((candidate) => {
      const key = `${normalizeText(candidate.title)}|${normalizeArtist(candidate.artist)}|${candidate.duration}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// ============================================================================
// PROVIDER OPCIONAL
// ============================================================================

async function queryOptionalProvider(file, local, filename) {
  if (!CONFIG.optionalProvider.enabled || !CONFIG.optionalProvider.endpoint) {
    return [];
  }

  const formData = new FormData();

  formData.append("file", file, file.name);

  if (local.title) {
    formData.append("title", local.title);
  }

  if (local.artist) {
    formData.append("artist", local.artist);
  }

  if (filename.title) {
    formData.append("filenameTitle", filename.title);
  }

  const data = await fetchJsonWithRetry(
    CONFIG.optionalProvider.endpoint,
    {
      method: "POST",
      body: formData,
    },
    {
      timeout: CONFIG.optionalProvider.timeout,
      retries: 1,
    },
  );

  const results = Array.isArray(data)
    ? data
    : Array.isArray(data?.results)
      ? data.results
      : data
        ? [data]
        : [];

  return results.map((item) =>
    makeCandidate({
      provider: "optional",
      sourceType: "fingerprint",
      providerScore: clamp(Number(item?.score ?? item?.confidence ?? 0.9)),

      title: item?.title || item?.track,

      artist: item?.artist || item?.artistName,

      album: item?.album || item?.albumName,

      albumArtist: item?.albumArtist,

      year: parseYear(item?.year || item?.releaseDate),

      duration: Number(item?.duration || 0),

      genre: item?.genre,

      genres: item?.genres,

      cover: item?.cover || item?.coverArt,

      isrc: normalizeIsrc(item?.isrc),

      recordingId: item?.musicBrainzRecordingId || item?.recordingId,

      releaseId: item?.musicBrainzReleaseId || item?.releaseId,

      releaseGroupId: item?.musicBrainzReleaseGroupId || item?.releaseGroupId,

      raw: item,
    }),
  );
}

// ============================================================================
// CANDIDATOS
// ============================================================================

function makeCandidate(data = {}) {
  const genres = [
    ...(Array.isArray(data.genres) ? data.genres : []),

    ...(data.genre ? [data.genre] : []),
  ];

  return {
    provider: data.provider || "unknown",

    providers: [
      ...new Set(data.providers || (data.provider ? [data.provider] : [])),
    ],

    sourceType: data.sourceType || "text",

    providerScore: clamp(data.providerScore ?? 0),

    title: cleanText(data.title),

    artist: cleanText(data.artist),

    artists: Array.isArray(data.artists) ? data.artists : [],

    artistCredits: Array.isArray(data.artistCredits) ? data.artistCredits : [],

    albumArtist: cleanText(data.albumArtist),

    album: cleanText(data.album),

    year: parseYear(data.year),

    track: safeString(data.track),

    trackTotal: safeString(data.trackTotal),

    disk: safeString(data.disk),

    diskTotal: safeString(data.diskTotal),

    duration: Number.isFinite(Number(data.duration))
      ? Number(data.duration)
      : 0,

    cover: safeString(data.cover),

    genres: uniqueGenres(genres),

    tags: uniqueGenres(Array.isArray(data.tags) ? data.tags : []),

    recordingId: safeString(data.recordingId),

    releaseId: safeString(data.releaseId),

    releaseGroupId: safeString(data.releaseGroupId),

    isrc: normalizeIsrc(data.isrc),

    acoustid: safeString(data.acoustid),

    raw: data.raw || null,
  };
}

// ============================================================================
// SCORE DE CANDIDATO
// ============================================================================

function scoreCandidate(candidate, context) {
  const referenceTitle = context.local.title || context.filename.title;

  const referenceArtist =
    context.local.artist ||
    context.local.albumArtist ||
    context.filename.artist;

  const referenceAlbum = context.local.album;

  const titleScore = referenceTitle
    ? similarity(candidate.title, referenceTitle)
    : 0;

  const artistScore = referenceArtist
    ? artistSimilarity(candidate.artist, referenceArtist)
    : 0;

  const albumScore =
    referenceAlbum && candidate.album
      ? similarity(candidate.album, referenceAlbum)
      : 0;

  const durationScore = durationSimilarity(
    candidate.duration,
    context.duration,
  );

  const providerWeight = PROVIDER_WEIGHTS[candidate.provider] || 0.5;

  let score =
    titleScore * 0.3 +
    artistScore * 0.28 +
    durationScore * 0.17 +
    albumScore * 0.08 +
    candidate.providerScore * 0.17;

  if (
    context.local.isrc &&
    candidate.isrc &&
    context.local.isrc === candidate.isrc
  ) {
    score += 0.15;
  }

  if (
    context.local.musicBrainzRecordingId &&
    candidate.recordingId &&
    context.local.musicBrainzRecordingId === candidate.recordingId
  ) {
    score += 0.15;
  }

  if (titleScore >= 0.98 && artistScore >= 0.95) {
    score += 0.04;
  }

  if (durationScore >= 0.97) {
    score += 0.04;
  }

  score *= 0.72 + providerWeight * 0.28;

  return clamp(score);
}

// ============================================================================
// COMPATIBILIDAD ENTRE CANDIDATOS
// ============================================================================

function candidatesCompatible(a, b) {
  if (a.recordingId && b.recordingId && a.recordingId === b.recordingId) {
    return true;
  }

  if (a.recordingId && b.recordingId && a.recordingId !== b.recordingId) {
    return false;
  }

  if (a.isrc && b.isrc && a.isrc === b.isrc) {
    return true;
  }

  if (a.isrc && b.isrc && a.isrc !== b.isrc) {
    return false;
  }

  if (a.acoustid && b.acoustid && a.acoustid !== b.acoustid) {
    return false;
  }

  const titleScore = similarity(a.title, b.title);

  const artistScore = artistSimilarity(a.artist, b.artist);

  if (titleScore < 0.92 || artistScore < 0.86) {
    return false;
  }

  const durationScore = durationSimilarity(a.duration, b.duration);

  if (a.duration > 0 && b.duration > 0 && durationScore < 0.65) {
    return false;
  }

  return true;
}

// ============================================================================
// AGRUPACIÓN DE IDENTIDADES
// ============================================================================

function clusterCandidates(candidates) {
  const clusters = [];

  for (const candidate of candidates) {
    let target = null;

    for (const cluster of clusters) {
      if (
        cluster.some((existing) => candidatesCompatible(existing, candidate))
      ) {
        target = cluster;
        break;
      }
    }

    if (target) {
      target.push(candidate);
    } else {
      clusters.push([candidate]);
    }
  }

  return clusters;
}

function candidatesSuitableForEnrichment(identity, candidate, context = {}) {
  if (
    identity.recordingId &&
    candidate.recordingId &&
    identity.recordingId === candidate.recordingId
  ) {
    return true;
  }

  if (identity.isrc && candidate.isrc && identity.isrc === candidate.isrc) {
    return true;
  }

  const titleScore = trackTitleSimilarity(identity.title, candidate.title);
  const artistScore = artistSimilarity(identity.artist, candidate.artist);
  const localArtist = context.local?.artist || context.local?.albumArtist;
  const localArtistScore = localArtist
    ? artistSimilarity(candidate.artist, localArtist)
    : 1;
  const durationScore = durationSimilarity(
    identity.duration || context.duration,
    candidate.duration,
  );

  const titleAndDurationMatch = titleScore >= 0.92 && durationScore >= 0.9;
  if (
    titleScore < 0.86 ||
    localArtistScore < 0.6 ||
    (artistScore < 0.7 && !titleAndDurationMatch)
  ) {
    return false;
  }

  if (identity.duration > 0 && candidate.duration > 0) {
    return durationSimilarity(identity.duration, candidate.duration) >= 0.5;
  }

  return true;
}

function mergeCompatibleCandidates(identity, allCandidates, context = {}) {
  const merged = [...(identity.candidates || [])];

  for (const candidate of allCandidates || []) {
    if (merged.includes(candidate)) {
      continue;
    }

    if (candidatesSuitableForEnrichment(identity, candidate, context)) {
      merged.push(candidate);
    }
  }

  return merged;
}

function candidateMatchesLocalRecording(candidate, context) {
  const referenceTitle = context.local.title || context.filename.title;
  const referenceArtist =
    context.local.artist ||
    context.local.albumArtist ||
    context.filename.artist;
  const titleScore = trackTitleSimilarity(candidate.title, referenceTitle);
  const artistScore = referenceArtist
    ? artistSimilarity(candidate.artist, referenceArtist)
    : 1;
  const durationScore = durationSimilarity(
    candidate.duration,
    context.duration,
  );

  return (
    titleScore >= 0.86 &&
    artistScore >= 0.6 &&
    (durationScore >= 0.5 || !candidate.duration || !context.duration)
  );
}

// ============================================================================
// CONSENSO DE CAMPOS
// ============================================================================

function fieldCandidateWeight(candidate, field, context) {
  const providerWeight = PROVIDER_WEIGHTS[candidate.provider] || 0.5;

  const providerScore = clamp(candidate.providerScore);

  let weight = providerWeight * (0.6 + providerScore * 0.4);

  const value = candidate[field];

  if (!value) {
    return 0;
  }

  if (field === "title" && (context.local.title || context.filename.title)) {
    weight *=
      0.7 +
      0.3 * similarity(value, context.local.title || context.filename.title);
  }

  if (
    field === "artist" &&
    (context.local.artist ||
      context.local.albumArtist ||
      context.filename.artist)
  ) {
    weight *=
      0.7 +
      0.3 *
        artistSimilarity(
          value,
          context.local.artist ||
            context.local.albumArtist ||
            context.filename.artist,
        );
  }

  return weight;
}

function chooseConsensusValue(
  candidates,
  field,
  context,
  normalizer = normalizeText,
) {
  const groups = new Map();

  for (const candidate of candidates) {
    const value = cleanText(candidate[field]);

    if (!value) {
      continue;
    }

    const key = normalizer(value);

    if (!key) {
      continue;
    }

    if (!groups.has(key)) {
      groups.set(key, {
        value,
        weight: 0,
        providers: new Set(),
        candidates: [],
      });
    }

    const group = groups.get(key);

    group.weight += fieldCandidateWeight(candidate, field, context);

    group.providers.add(candidate.provider);

    group.candidates.push(candidate);
  }

  const sorted = [...groups.values()].sort((a, b) => b.weight - a.weight);

  if (!sorted.length) {
    return {
      value: "",
      score: 0,
      providers: [],
      alternatives: [],
    };
  }

  const winner = sorted[0];

  return {
    value: winner.value,
    score: clamp(winner.weight / 2),
    providers: [...winner.providers],
    alternatives: sorted.slice(1).map((item) => ({
      value: item.value,
      score: clamp(item.weight / 2),
      providers: [...item.providers],
    })),
  };
}

function chooseNumericConsensus(candidates, field, context) {
  const groups = new Map();

  for (const candidate of candidates) {
    const value = safeString(candidate[field]);

    if (!value) {
      continue;
    }

    const key = field === "year" ? parseYear(value) : value;

    if (!key) {
      continue;
    }

    if (!groups.has(key)) {
      groups.set(key, {
        value: key,
        weight: 0,
        providers: new Set(),
      });
    }

    const group = groups.get(key);

    group.weight += fieldCandidateWeight(candidate, field, context);

    group.providers.add(candidate.provider);
  }

  const sorted = [...groups.values()].sort((a, b) => b.weight - a.weight);

  if (!sorted.length) {
    return {
      value: "",
      score: 0,
      providers: [],
    };
  }

  return {
    value: sorted[0].value,
    score: clamp(sorted[0].weight / 2),
    providers: [...sorted[0].providers],
  };
}

// ============================================================================
// CONSENSO DE IDENTIDAD
// ============================================================================

function buildClusterIdentity(members, context) {
  const sorted = [...members].sort(
    (a, b) => scoreCandidate(b, context) - scoreCandidate(a, context),
  );

  const best = sorted[0];

  const providers = [
    ...new Set(
      members
        .flatMap((candidate) => candidate.providers || [candidate.provider])
        .filter(Boolean),
    ),
  ];

  const consensus = {
    title: chooseConsensusValue(members, "title", context),

    artist: chooseConsensusValue(members, "artist", context, normalizeArtist),

    album: chooseConsensusValue(members, "album", context),

    albumArtist: chooseConsensusValue(
      members,
      "albumArtist",
      context,
      normalizeArtist,
    ),

    year: chooseNumericConsensus(members, "year", context),

    track: chooseNumericConsensus(members, "track", context),

    trackTotal: chooseNumericConsensus(members, "trackTotal", context),

    disk: chooseNumericConsensus(members, "disk", context),

    diskTotal: chooseNumericConsensus(members, "diskTotal", context),
  };

  const bestScore = Math.max(
    ...members.map((candidate) => scoreCandidate(candidate, context)),
  );

  const diversityBonus = Math.min(
    0.16,
    Math.max(0, providers.length - 1) * 0.055,
  );

  const sameRecordingCount = best.recordingId
    ? members.filter((candidate) => candidate.recordingId === best.recordingId)
        .length
    : 0;

  const sameIsrcCount = best.isrc
    ? members.filter((candidate) => candidate.isrc === best.isrc).length
    : 0;

  const exactIdBonus =
    (sameRecordingCount >= 2 ? 0.06 : 0) + (sameIsrcCount >= 2 ? 0.06 : 0);

  const titleArtistBonus =
    consensus.title.score >= 0.75 && consensus.artist.score >= 0.75 ? 0.05 : 0;

  const confidence = clamp(
    bestScore + diversityBonus + exactIdBonus + titleArtistBonus,
    0,
    0.995,
  );

  return {
    identityKey: buildIdentityKey(best),

    provider: best.provider,

    providers,

    providerCount: providers.length,

    sourceType: best.sourceType,

    title: consensus.title.value || best.title,

    artist: consensus.artist.value || best.artist,

    album: consensus.album.value || best.album,

    albumArtist: consensus.albumArtist.value || best.albumArtist,

    artists: best.artists || [],

    artistCredits: best.artistCredits || best.artists || [],

    year: consensus.year.value || best.year,

    track: consensus.track.value || best.track,

    trackTotal: consensus.trackTotal.value || best.trackTotal,

    disk: consensus.disk.value || best.disk,

    diskTotal: consensus.diskTotal.value || best.diskTotal,

    duration: best.duration,

    cover: chooseBestCover(members, consensus.album.value || best.album),

    recordingId: chooseBestId(members, "recordingId"),

    releaseId: chooseBestId(members, "releaseId"),

    releaseGroupId: chooseBestId(members, "releaseGroupId"),

    isrc: chooseBestId(members, "isrc"),

    confidence,

    similarity: best.similarity ?? bestScore,

    evidenceScore: best.evidenceScore ?? confidence,

    consensus,

    candidates: members,

    evidence: {
      title: consensus.title.score,

      artist: consensus.artist.score,

      album: consensus.album.score,

      year: consensus.year.score,

      track: consensus.track.score,

      providers,
    },
  };
}

function buildIdentityKey(candidate) {
  if (candidate.recordingId) {
    return `mbid:${candidate.recordingId}`;
  }

  if (candidate.isrc) {
    return `isrc:${candidate.isrc}`;
  }

  return [
    normalizeArtist(candidate.artist),
    normalizeText(candidate.title),
  ].join("|");
}

function chooseBestId(candidates, field) {
  const values = new Map();

  for (const candidate of candidates) {
    const value = safeString(candidate[field]);

    if (!value) {
      continue;
    }

    const providerWeight = PROVIDER_WEIGHTS[candidate.provider] || 0.5;

    const score = providerWeight * (0.6 + clamp(candidate.providerScore) * 0.4);

    const key = value.toLowerCase();

    if (!values.has(key)) {
      values.set(key, {
        value,
        score: 0,
      });
    }

    values.get(key).score += score;
  }

  const sorted = [...values.values()].sort((a, b) => b.score - a.score);

  return sorted[0]?.value || "";
}

function chooseBestCover(candidates, referenceAlbum = "") {
  const ranked = (candidates || [])
    .filter((candidate) => candidate.cover)
    .map((candidate) => {
      const providerWeight = PROVIDER_WEIGHTS[candidate.provider] || 0.5;
      const providerScore = clamp(candidate.providerScore);
      const albumScore =
        referenceAlbum && candidate.album
          ? similarity(candidate.album, referenceAlbum)
          : 0.5;

      return {
        candidate,
        score:
          providerWeight *
          (0.6 + providerScore * 0.4) *
          (0.65 + albumScore * 0.35),
      };
    })
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.candidate.cover || "";
}

// ============================================================================
// GENRE RESOLUTION
// ============================================================================

/**
 * Resuelve géneros con un sistema robusto que:
 * - Prioriza fuentes confiables (MusicBrainz, iTunes, AcoustID)
 * - NO descarta géneros válidos de fuentes fiables
 * - Permite máximo 5 géneros
 * - Retorna información de proveniencia
 */
function resolveGenresImproved({
  recording,
  release,
  releaseGroup,
  candidates,
  local,
}) {
  const genreMap = new Map();

  // Agregar evidencia de género desde cada fuente con sus pesos
  const addEvidence = (genres, source, weight) => {
    for (const genre of genres || []) {
      if (!isUsefulGenre(genre)) continue;

      const key = canonicalGenre(genre);
      if (!genreMap.has(key)) {
        genreMap.set(key, {
          genre: displayGenreName(genre),
          weight: 0,
          sources: new Set(),
        });
      }

      const entry = genreMap.get(key);
      entry.weight += weight;
      entry.sources.add(source);
    }
  };

  // PRIORIDAD 1: MusicBrainz recording (máxima prioridad)
  addEvidence(extractGenres(recording), "musicbrainz-recording", 1.0);
  addEvidence(extractTags(recording), "musicbrainz-recording-tags", 0.5);

  // PRIORIDAD 2: MusicBrainz release
  addEvidence(extractGenres(release), "musicbrainz-release", 0.95);
  addEvidence(extractTags(release), "musicbrainz-release-tags", 0.45);

  // PRIORIDAD 3: MusicBrainz release-group
  addEvidence(extractGenres(releaseGroup), "musicbrainz-release-group", 0.9);
  addEvidence(
    extractTags(releaseGroup),
    "musicbrainz-release-group-tags",
    0.45,
  );

  // PRIORIDAD 4: Otros candidatos (fuentes textuales)
  for (const candidate of candidates || []) {
    const baseWeight = PROVIDER_WEIGHTS[candidate.provider] || 0.35;
    const providerConfidence = clamp(candidate.providerScore);
    const adjustedWeight = baseWeight * (0.5 + providerConfidence * 0.5);

    addEvidence(candidate.genres, candidate.provider, adjustedWeight);
    addEvidence(
      candidate.tags,
      `${candidate.provider}-tags`,
      adjustedWeight * 0.4,
    );
  }

  // PRIORIDAD 5: Metadata local (último respaldo)
  addEvidence(local?.genre || [], "local", 0.3);

  // Ordenar por peso y aplicar reglas de selección
  const all = [...genreMap.values()].sort((a, b) => b.weight - a.weight);

  const selected = [];
  const discarded = [];

  // Define sources que son "confiables" para propósitos de selección
  const RELIABLE_SOURCES = new Set([
    "musicbrainz-recording",
    "musicbrainz-release",
    "musicbrainz-release-group",
    "itunes",
    "acoustid",
    "musicbrainz_isrc",
    "deezer",
    "optional",
  ]);

  for (const item of all) {
    const parentKey = GENRE_PARENT_KEYS.get(canonicalGenre(item.genre));

    if (parentKey && genreMap.has(parentKey)) {
      const parent = genreMap.get(parentKey);

      if (item.weight >= parent.weight * 0.75) {
        const selectedParentIndex = selected.findIndex(
          (selectedItem) => canonicalGenre(selectedItem.genre) === parentKey,
        );

        if (selectedParentIndex >= 0) {
          selected.splice(selectedParentIndex, 1);
        }

        discarded.push({
          genre: parent.genre,
          sources: [...parent.sources],
          weight: parent.weight,
          reason: "covered-by-specific-genre",
        });
        genreMap.delete(parentKey);
      }
    }

    if (!genreMap.has(canonicalGenre(item.genre))) {
      continue;
    }

    const hasReliableSource = [...item.sources].some((s) =>
      RELIABLE_SOURCES.has(s),
    );

    // REGLA 1: Verificar que sea un género útil
    if (!isUsefulGenre(item.genre)) {
      discarded.push({
        genre: item.genre,
        sources: [...item.sources],
        weight: item.weight,
        reason: "generic-or-invalid",
      });
      continue;
    }

    // REGLA 2: Exigir al menos una fuente confiable
    if (!hasReliableSource) {
      discarded.push({
        genre: item.genre,
        sources: [...item.sources],
        weight: item.weight,
        reason: "no-reliable-source",
      });
      continue;
    }

    // REGLA 3: Aplicar umbral bajo SOLO si es necesario
    // Un género de una fuente confiable tiene threshold muy bajo (0.35)
    // Géneros de múltiples fuentes son casi siempre aceptados (0.25)
    const sourceCount = item.sources.size;
    const minThreshold = sourceCount >= 2 ? 0.25 : 0.35;

    if (item.weight < minThreshold) {
      discarded.push({
        genre: item.genre,
        sources: [...item.sources],
        weight: item.weight,
        reason: "low-weight",
      });
      continue;
    }

    selected.push(item);

    // Máximo 5 géneros útiles
    if (selected.length >= 5) break;
  }

  const genres = selected.map((item) => item.genre);
  const genreSources = {};
  for (const item of selected) {
    genreSources[item.genre] = [...item.sources];
  }

  return {
    genres,
    genreSources,
    selected: selected.map((item) => ({
      genre: item.genre,
      sources: [...item.sources],
      weight: item.weight,
    })),
    discarded,
  };
}

async function lookupMusicBrainzRecording(recordingId) {
  if (!recordingId) {
    return null;
  }

  return musicBrainzRequest(`/recording/${encodeURIComponent(recordingId)}`, {
    inc: "artist-credits+releases+release-groups+media+genres+tags+isrcs",
    fmt: "json",
  });
}

function choosePreferredRelease(
  recording,
  preferredReleaseId,
  preferredGroupId,
  preferredTitle = "",
) {
  const releases = Array.isArray(recording?.releases) ? recording.releases : [];

  if (!releases.length) {
    return null;
  }

  const releaseTitleKey = (value) =>
    safeString(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase()
      .replace(/[()[\]{}]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const requestedTitle = releaseTitleKey(preferredTitle);

  return [...releases].sort((left, right) => {
    const leftGroupId = left?.["release-group"]?.id || "";
    const rightGroupId = right?.["release-group"]?.id || "";
    const leftTitle = releaseTitleKey(left?.title);
    const rightTitle = releaseTitleKey(right?.title);
    const leftTitleMatch = requestedTitle && leftTitle === requestedTitle;
    const rightTitleMatch = requestedTitle && rightTitle === requestedTitle;

    if (leftTitleMatch !== rightTitleMatch) {
      return Number(rightTitleMatch) - Number(leftTitleMatch);
    }

    const preferredDifference =
      Number(right?.id === preferredReleaseId) -
      Number(left?.id === preferredReleaseId);

    if (preferredDifference) {
      return preferredDifference;
    }

    const groupDifference =
      Number(rightGroupId === preferredGroupId) -
      Number(leftGroupId === preferredGroupId);

    if (groupDifference) {
      return groupDifference;
    }

    const typePriority = {
      album: 1,
      ep: 2,
      single: 3,
      compilation: 4,
      soundtrack: 5,
      live: 6,
      mixtape: 7,
      other: 8,
      unknown: 9,
    };
    const typeDifference =
      (typePriority[resolveReleaseType(left)] || 9) -
      (typePriority[resolveReleaseType(right)] || 9);
    if (typeDifference) return typeDifference;

    const mediaDifference =
      Number(Array.isArray(right?.media) && right.media.length) -
      Number(Array.isArray(left?.media) && left.media.length);

    if (mediaDifference) {
      return mediaDifference;
    }

    return (
      Number(left?.status !== "official") - Number(right?.status !== "official")
    );
  })[0];
}

async function lookupMusicBrainzRelease(releaseId) {
  if (!releaseId) {
    return null;
  }

  return musicBrainzRequest(`/release/${encodeURIComponent(releaseId)}`, {
    inc: "artist-credits+media+release-groups+genres+tags",
    fmt: "json",
  });
}

async function lookupMusicBrainzReleaseGroup(releaseGroupId) {
  if (!releaseGroupId) {
    return null;
  }

  return musicBrainzRequest(
    `/release-group/${encodeURIComponent(releaseGroupId)}`,
    {
      inc: "genres+tags+releases",
      fmt: "json",
    },
  );
}

// ============================================================================
// COVER ART
// ============================================================================

function normalizeArtworkUrl(value) {
  const url = safeString(value);

  if (!url) {
    return "";
  }

  return url
    .replace(/100x100bb/g, "600x600bb")
    .replace(/100x100-75/g, "600x600-75");
}

async function getCoverFromMusicBrainz(releaseId, releaseGroupId) {
  const endpoints = [
    releaseId &&
      `https://coverartarchive.org/release/${encodeURIComponent(releaseId)}`,
    releaseGroupId &&
      `https://coverartarchive.org/release-group/${encodeURIComponent(releaseGroupId)}`,
  ].filter(Boolean);

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) continue;
      const payload = await response.json();
      const image =
        (payload.images || []).find((item) => item.front) ||
        payload.images?.[0];
      const imageUrl = image?.thumbnails?.large || image?.image;
      if (imageUrl) return imageUrl;
    } catch {
      // El artwork es opcional; continuar con las portadas de otros proveedores.
    }
  }
  return "";
}

function releaseGroupFromEntity(entity) {
  const group = entity?.["release-group"] || entity?.releaseGroup || entity;
  if (!group?.id && !group?.title) return null;
  const groupCover = group.id
    ? `https://coverartarchive.org/release-group/${encodeURIComponent(group.id)}/front-500`
    : null;
  return createReleaseGroup({
    id: group.id,
    title: group.title,
    primaryType: resolveReleaseType({ primaryType: group["primary-type"] }),
    secondaryTypes: group["secondary-types"] || [],
    artists: extractArtistNames(group),
    musicBrainzReleaseGroupId: group.id,
    firstReleaseDate: group["first-release-date"],
    cover: groupCover,
  });
}

function releaseFromEntity(entity, recordingId, fallback = {}) {
  const releaseId = safeString(entity?.id || fallback.id);
  if (!releaseId && !entity?.title && !fallback.title) return null;
  const group = entity?.["release-group"] || fallback["release-group"] || {};
  const release = createRelease({
    id: releaseId || fallback.id,
    title: entity?.title || fallback.title,
    originalTitle: entity?.title || fallback.title,
    primaryType:
      entity?.["release-type"] ||
      fallback.releaseType ||
      fallback["release-type"] ||
      group["primary-type"],
    secondaryTypes:
      entity?.["release-types"] ||
      fallback["release-types"] ||
      group["secondary-types"],
    collectionType: fallback.collectionType,
    primaryArtists: extractArtistCredits(entity).length
      ? extractArtistCredits(entity)
      : fallback.primaryArtists || [],
    artists: extractArtistNames(entity).length
      ? extractArtistNames(entity)
      : (fallback.primaryArtists || fallback.artists || []).map?.((artist) =>
          typeof artist === "string" ? artist : artist.name,
        ),
    albumArtist: extractArtistCredit(entity) || fallback.albumArtist,
    releaseDate: entity?.date || fallback.releaseDate,
    country: entity?.country || fallback.country,
    label: entity?.label || fallback.label,
    catalogNumber: entity?.catalogNumber || fallback.catalogNumber,
    barcode: entity?.barcode || fallback.barcode,
    releaseGroupId: group.id || fallback.releaseGroupId,
    musicBrainzReleaseId: releaseId,
    musicBrainzReleaseGroupId: group.id || fallback.musicBrainzReleaseGroupId,
    cover: fallback.cover || null,
    coverUrl: fallback.cover,
    source: fallback.source || "musicbrainz",
    metadataSources: fallback.metadataSources,
    tracks: fallback.tracks,
    trackCount: fallback.trackCount,
    discCount: fallback.discCount,
    trackNumber: fallback.trackNumber,
    trackTotal: fallback.trackTotal,
    discNumber: fallback.discNumber,
    discTotal: fallback.discTotal,
  });
  const releaseGroupCover = "";
  release.coverAlternatives = [
    release.cover
      ? { url: release.cover, source: "musicbrainz-release" }
      : null,
    releaseGroupCover
      ? { url: releaseGroupCover, source: "musicbrainz-release-group" }
      : null,
    fallback.coverUrl
      ? { url: fallback.coverUrl, source: fallback.source || "provider" }
      : null,
  ]
    .filter(Boolean)
    .filter(
      (entry, index, entries) =>
        entries.findIndex((item) => item.url === entry.url) === index,
    );

  const media = Array.isArray(entity?.media) ? entity.media : [];
  for (const medium of media) {
    for (const track of medium?.tracks || []) {
      if (
        track?.recording?.id === recordingId ||
        track?.recording?.title === fallback.recordingTitle
      ) {
        if (!release.trackNumber)
          release.trackNumber = Number(track.position) || 0;
        if (!release.trackTotal)
          release.trackTotal = Number(medium.track_count) || 0;
        if (!release.discNumber)
          release.discNumber = Number(medium.position) || 0;
        if (!release.discTotal) release.discTotal = media.length;
        release.tracks.push(
          createReleaseTrack({
            recordingId,
            releaseId: release.id,
            discNumber: medium.position,
            trackNumber: track.position,
            trackTotal: medium.track_count,
            title: track.title || track.recording?.title,
            duration: Number(track.length || 0) / 1000,
          }).id,
        );
      }
    }
  }
  release.tracks = [...new Set(release.tracks)];
  return release;
}

function buildNormalizedIdentification({
  identity,
  recording,
  release,
  releaseGroup,
  candidates,
  local,
  genres,
  cover,
  discoveredReleases = [],
}) {
  const recordingId =
    [recording?.id, identity.recordingId, local?.musicBrainzRecordingId].find(
      isMusicBrainzId,
    ) || "";
  const artistCredits = normalizeArtistCredits(
    recording?.["artist-credit"],
    extractArtistCredit(recording) || identity.artist || local?.artist,
  );
  const artists = artistCredits.map((credit) => credit.name);
  const releaseMap = new Map();
  const groupMap = new Map();
  const releaseCandidates = (candidates || []).filter((candidate) => {
    const titleMatches =
      trackTitleSimilarity(candidate.title, identity.title) >= 0.65;
    const referenceArtist = local?.artist || local?.albumArtist;
    const artistMatches =
      !referenceArtist ||
      !candidate.artist ||
      artistSimilarity(candidate.artist, referenceArtist) >= 0.58;
    return titleMatches && artistMatches && Boolean(candidate.album);
  });

  const addGroup = (entity) => {
    const item = releaseGroupFromEntity(entity);
    if (item) groupMap.set(item.id, item);
  };
  const addRelease = (entity, fallback = {}) => {
    const item = releaseFromEntity(entity, recordingId, fallback);
    if (!item) return;
    releaseMap.set(item.id, item);
    if (item.releaseGroupId)
      addGroup(
        entity?.["release-group"] || {
          id: item.releaseGroupId,
          title: item.title,
        },
      );
  };

  for (const item of recording?.releases || []) addRelease(item);
  for (const item of discoveredReleases || []) {
    if (!item?.id) continue;
    releaseMap.set(item.id, item);
    if (item.releaseGroupId) {
      addGroup({ id: item.releaseGroupId, title: item.title });
    }
  }
  if (release) addRelease(release);
  for (const candidate of releaseCandidates) {
    const raw = candidate.raw || {};
    const providerId =
      raw.collectionId || raw.album?.id || raw.albumId || raw.id;
    const releaseTitle =
      raw.collectionName || raw.album?.title || candidate.album;
    const releaseType =
      candidate.provider === "itunes"
        ? inferITunesReleaseType(releaseTitle)
        : releaseTitle &&
            trackTitleSimilarity(releaseTitle, candidate.title) >= 0.92
          ? "single"
          : "album";

    addRelease(null, {
      id: `${candidate.provider}:${normalizeComparable(providerId || releaseTitle)}`,
      title: releaseTitle,
      collectionType: raw.collectionType,
      releaseType,
      releaseDate: raw.releaseDate || raw.release_date,
      primaryArtists: [
        raw.collectionArtistName ||
          raw.collectionArtist ||
          raw.artistName ||
          raw.artist?.name ||
          candidate.artist,
      ].filter(Boolean),
      artists: [
        raw.collectionArtistName ||
          raw.collectionArtist ||
          raw.artistName ||
          raw.artist?.name ||
          candidate.artist,
      ].filter(Boolean),
      albumArtist:
        raw.collectionArtistName ||
        raw.collectionArtist ||
        raw.artistName ||
        raw.artist?.name,
      cover: normalizeArtworkUrl(
        raw.artworkUrl100 ||
          raw.album?.cover_xl ||
          raw.album?.cover_big ||
          candidate.cover,
      ),
      source: candidate.provider,
      trackCount: raw.trackCount,
      recordingTitle: raw.trackName || candidate.title,
      trackNumber: raw.trackNumber,
      trackTotal: raw.trackCount,
      discNumber: raw.discNumber,
    });
  }
  if (!releaseMap.size && (release || identity.album || local?.album))
    addRelease(release, {
      title: release?.title || identity.album || local.album,
      cover,
    });

  const releaseIds = [...releaseMap.keys()];
  const releaseGroups = [...groupMap.values()].map((group) => ({
    ...group,
    releases: releaseIds.filter(
      (id) => releaseMap.get(id)?.releaseGroupId === group.id,
    ),
  }));
  const involvedByReleaseId = new Map();
  for (const item of releaseMap.values()) {
    const primaryArtists = item.primaryArtists?.length
      ? item.primaryArtists
      : [];
    const involved = new Map(
      primaryArtists.map((artist) => [
        artist.id
          ? `id:${artist.id}`
          : `name:${normalizeComparable(artist.name)}`,
        artist,
      ]),
    );
    for (const candidate of releaseCandidates) {
      const candidateReleaseTitle =
        candidate.raw?.collectionName ||
        candidate.raw?.album?.title ||
        candidate.album;
      if (
        normalizeComparable(candidateReleaseTitle) !==
        normalizeComparable(item.title)
      )
        continue;
      for (const artist of candidate.artistCredits?.length
        ? candidate.artistCredits
        : candidate.artists || []) {
        const entity = typeof artist === "string" ? { name: artist } : artist;
        const key = entity.id
          ? `id:${entity.id}`
          : `name:${normalizeComparable(entity.name)}`;
        if (entity.name && !involved.has(key)) involved.set(key, entity);
      }
    }
    involvedByReleaseId.set(item.id, [...involved.values()]);
  }
  for (const [id, involvedArtists] of involvedByReleaseId) {
    const release = releaseMap.get(id);
    release.involvedArtists = involvedArtists;
  }

  const normalizedReleases = rankReleases(
    [...releaseMap.values()],
    {
      recordingId,
      title: identity.title,
      album: identity.album,
      artist: identity.artist,
      artists,
    },
    { limit: Infinity },
  );
  const normalizedRecording = createRecording({
    id: recordingId || local?.fileId,
    fileId: local?.fileId,
    filename: local?.filename,
    title: recording?.title || identity.title || local?.title,
    artists,
    artistCredits,
    artist: artists.join(", ") || identity.artist || local?.artist,
    albumArtist: extractArtistCredit(recording),
    duration: identity.duration || local?.duration,
    releaseIds,
    releaseGroupIds: releaseGroups.map((group) => group.id),
    genres: cleanGenres(genres || local?.genre),
    isrc: recording?.isrcs?.[0] || identity.isrc || local?.isrc,
    musicBrainzRecordingId: recordingId,
    acoustid: findAcoustID(identity.candidates),
    localMetadata: local,
    identifiedMetadata: {
      recording,
      releases: normalizedReleases,
      releaseGroups,
    },
    identification: {
      artistCredits,
      recordingConfidence: identity.confidence,
      releaseConfidence: normalizedReleases.length ? identity.confidence : 0,
      releaseGroupConfidence: releaseGroups.length ? identity.confidence : 0,
      fieldConfidence: { genre: genres?.length ? 0.65 : 0 },
      coverConfidence: cover ? 0.98 : 0,
      overallConfidence: identity.confidence,
    },
  });

  return {
    recording: normalizedRecording,
    releases: normalizedReleases,
    releaseGroups,
    confidence: {
      recordingConfidence: identity.confidence,
      releaseConfidence: normalizedReleases.length ? identity.confidence : 0,
      releaseGroupConfidence: releaseGroups.length ? identity.confidence : 0,
      fieldConfidence: { genre: genres?.length ? 0.65 : 0 },
      coverConfidence: cover ? 0.98 : 0,
      overallConfidence: identity.confidence,
    },
    evidence: {
      title: ["musicbrainz", "identity"],
      artist: ["musicbrainz", "identity"],
      release: normalizedReleases.map((item) => item.source || "musicbrainz"),
      cover: cover ? ["musicbrainz-cover-art"] : [],
      genre: Object.values(genreResolutionSources(candidates, genres)).flat(),
      year: ["musicbrainz"],
    },
  };
}

function discoverNormalizedReleases(recordings, recordingContext) {
  const releaseMap = new Map();

  for (const sourceRecording of recordings || []) {
    for (const sourceRelease of sourceRecording?.releases || []) {
      const normalized = releaseFromEntity(sourceRelease, sourceRecording.id);
      if (!normalized?.id) continue;

      normalized.recordingId = sourceRecording.id;
      normalized.provider = "musicbrainz";
      normalized.sources = ["musicbrainz"];
      releaseMap.set(normalized.id, normalized);
    }
  }

  return rankReleases([...releaseMap.values()], recordingContext, {
    limit: Infinity,
  });
}

function recordingCandidateView(identity, recording, relatedReleases) {
  const artistCredits = recording
    ? extractArtistCredits(recording)
    : identity.artistCredits || [];
  const candidateCovers = (identity.candidates || [])
    .filter((candidate) => candidate.cover)
    .map((candidate) => ({
      url: candidate.cover,
      source: candidate.provider || "candidate",
      releaseTitle: candidate.album || identity.album || identity.title,
    }))
    .filter(
      (cover, index, covers) =>
        covers.findIndex((item) => item.url === cover.url) === index,
    );
  return {
    id: identity.recordingId || identity.identityKey,
    title: identity.title,
    artist: identity.artistCredits?.length
      ? identity.artistCredits.map((credit) => credit.name).join(", ")
      : identity.artist,
    artists: artistCredits.length
      ? artistCredits
      : identity.artist
        ? [{ id: "", name: identity.artist }]
        : [],
    artistCredits,
    cover: candidateCovers[0]?.url || identity.cover || "",
    coverAlternatives: candidateCovers,
    duration: identity.duration,
    similarity: identity.similarity ?? identity.confidence,
    confidence: identity.confidence,
    evidenceScore: identity.evidenceScore ?? identity.confidence,
    providers: identity.providers,
    recording,
    releases: relatedReleases,
  };
}

function genreResolutionSources(candidates, genres) {
  const sources = {};
  for (const genre of genres || []) {
    sources[genre] = [
      ...new Set(
        (candidates || [])
          .filter((candidate) => candidate.genres?.includes(genre))
          .map((candidate) => candidate.provider),
      ),
    ];
  }
  return sources;
}

// ============================================================================
// VALIDACIÓN
// ============================================================================

function validateIdentity(identity, context) {
  const problems = [];

  const title = identity.title;

  const artist = identity.artist;

  const referenceTitle = context.local.title || context.filename.title;

  const referenceArtist =
    context.local.artist ||
    context.local.albumArtist ||
    context.filename.artist;

  const titleScore = referenceTitle ? similarity(title, referenceTitle) : 1;

  const artistScore = referenceArtist
    ? artistSimilarity(artist, referenceArtist)
    : 1;

  const durationScore = durationSimilarity(identity.duration, context.duration);

  const hasStrongProvider = identity.providers.some((provider) =>
    ["acoustid", "musicbrainz_isrc", "musicbrainz", "optional"].includes(
      provider,
    ),
  );

  if (!title) {
    problems.push("missing-title");
  }

  if (!artist) {
    problems.push("missing-artist");
  }

  if (titleScore < CONFIG.identification.minTitleSimilarity) {
    problems.push("title-mismatch");
  }

  if (artistScore < CONFIG.identification.minArtistSimilarity) {
    problems.push("artist-mismatch");
  }

  const hasAcousticProvider = identity.providers.some((provider) =>
    ["acoustid", "optional"].includes(provider),
  );
  if (
    !hasAcousticProvider &&
    context.duration > 0 &&
    identity.duration > 0 &&
    durationScore < 0.35
  ) {
    problems.push("duration-mismatch");
  }

  const valid =
    problems.length === 0 &&
    (identity.confidence >= CONFIG.identification.minConfidence ||
      (hasStrongProvider && titleScore >= 0.65 && artistScore >= 0.65));

  return {
    valid,
    problems,
    titleScore,
    artistScore,
    durationScore,
    hasStrongProvider,
  };
}

function selectBestIdentity(identities, context) {
  const fingerprintIdentities = (identities || []).filter((identity) =>
    (identity.candidates || []).some(
      (candidate) =>
        ["acoustid", "optional"].includes(candidate.provider) &&
        Number(candidate.providerScore || 0) >= MIN_FINGERPRINT_MATCH_SCORE,
    ),
  );
  const pool = fingerprintIdentities.length
    ? fingerprintIdentities
    : identities;

  return (
    [...(pool || [])].sort((left, right) => {
      const leftValidation = validateIdentity(left, context);
      const rightValidation = validateIdentity(right, context);
      const leftStrong =
        leftValidation.artistScore >= 0.82 && leftValidation.titleScore >= 0.82;
      const rightStrong =
        rightValidation.artistScore >= 0.82 &&
        rightValidation.titleScore >= 0.82;

      if (leftStrong !== rightStrong)
        return Number(rightStrong) - Number(leftStrong);
      if (leftValidation.valid !== rightValidation.valid) {
        return Number(rightValidation.valid) - Number(leftValidation.valid);
      }

      const leftRank =
        leftValidation.artistScore * 0.45 +
        leftValidation.titleScore * 0.3 +
        left.confidence * 0.25;
      const rightRank =
        rightValidation.artistScore * 0.45 +
        rightValidation.titleScore * 0.3 +
        right.confidence * 0.25;
      return rightRank - leftRank;
    })[0] || null
  );
}

function hasReliableFingerprintEvidence(identity) {
  return (identity?.candidates || []).some(
    (candidate) =>
      ["acoustid", "optional"].includes(candidate.provider) &&
      Number(candidate.providerScore || 0) >= MIN_FINGERPRINT_MATCH_SCORE,
  );
}

function isStrongIdentity(identity) {
  return identity.providers.some((provider) =>
    [
      "acoustid",
      "musicbrainz_isrc",
      "musicbrainz",
      "itunes",
      "optional",
    ].includes(provider),
  );
}

function identitiesHaveDifferentEvidence(first, second) {
  if (first.recordingId && second.recordingId) {
    return first.recordingId !== second.recordingId;
  }

  if (first.isrc && second.isrc) {
    return first.isrc !== second.isrc;
  }

  return (
    similarity(first.title, second.title) < 0.94 ||
    artistSimilarity(first.artist, second.artist) < 0.82
  );
}

// ============================================================================
// METADATA FINAL
// ============================================================================

function buildMetadata({
  identity,
  recording,
  release,
  releaseGroup,
  local,
  genres,
  genreSources,
  cover,
  consensus,
}) {
  const title = cleanText(
    consensus?.title?.value ||
      recording?.title ||
      identity.title ||
      local?.title,
  );

  const artist = cleanText(
    consensus?.artist?.value ||
      extractArtistCredit(recording) ||
      identity.artist ||
      local?.artist,
  );

  const albumArtist = cleanText(
    consensus?.albumArtist?.value ||
      extractArtistCredit(release) ||
      extractArtistCredit(recording) ||
      identity.albumArtist ||
      artist ||
      local?.albumArtist,
  );

  // Detectar tipo de lanzamiento (single, album, ep, etc)
  const releaseType = detectReleaseType(release || releaseGroup);

  // El release enriquecido representa la publicación elegida para esta
  // grabación. Debe tener prioridad sobre el álbum obtenido de un candidato
  // textual, porque una misma pista puede existir en un álbum y en un single.
  // De lo contrario se mezclan los datos del álbum con los del sencillo.
  let album = cleanText(
    release?.title ||
      releaseGroup?.title ||
      consensus?.album?.value ||
      identity.album ||
      local?.album,
  );

  // Sanitizar nombre del álbum según su tipo
  album = sanitizeAlbumName(album, title, releaseType);

  let year = parseYear(
    consensus?.year?.value ||
      release?.date ||
      release?.["release-group"]?.["first-release-date"] ||
      identity.year ||
      local?.year,
  );

  if (!year) {
    year = identity.year || "";
  }

  const track =
    consensus?.track?.value ||
    identity.track ||
    findTrackNumber(recording, release) ||
    local?.track;

  const trackTotal =
    consensus?.trackTotal?.value ||
    identity.trackTotal ||
    findTrackTotal(release) ||
    local?.trackTotal;

  const disk =
    consensus?.disk?.value ||
    identity.disk ||
    findDiskNumber(recording, release) ||
    local?.disk;

  const diskTotal =
    consensus?.diskTotal?.value ||
    identity.diskTotal ||
    findDiskTotal(release) ||
    local?.diskTotal;

  // Construir información de proveniencia de metadatos
  const metadataSources = {
    title: title ? ["musicbrainz", "identity"] : [],
    artist: artist ? ["musicbrainz", "identity"] : [],
    album: album ? ["musicbrainz", "identity"] : [],
    albumArtist: albumArtist ? ["musicbrainz"] : [],
    genre:
      genres && genres.length > 0
        ? Object.keys(genreSources || {}).flatMap((g) => genreSources[g] || [])
        : [],
    year: year ? ["musicbrainz", "identity"] : [],
    track: track ? ["musicbrainz"] : [],
    trackTotal: trackTotal ? ["musicbrainz"] : [],
    disk: disk ? ["musicbrainz"] : [],
    diskTotal: diskTotal ? ["musicbrainz"] : [],
    cover: cover ? ["musicbrainz", "identity"] : [],
  };

  return {
    title,
    artist,
    artists: artistListFromMetadata(artist, recording),
    albumArtist,
    album,
    releaseType,

    genre: Array.isArray(genres) ? genres : [],

    year,
    track,
    trackTotal,
    disk,
    diskTotal,

    cover: cover || identity.cover || "",

    confidence: identity.confidence,

    musicBrainzRecordingId:
      [recording?.id, identity.recordingId].find(isMusicBrainzId) || "",

    musicBrainzReleaseId: safeString(release?.id || identity.releaseId),

    musicBrainzReleaseGroupId: safeString(
      releaseGroup?.id || identity.releaseGroupId,
    ),

    isrc: normalizeIsrc(recording?.isrcs?.[0] || identity.isrc),

    acoustid: findAcoustID(identity.candidates),

    identificationSource: identity.providers.join("+"),

    consensus: identity.consensus,

    metadataSources,
  };
}

function findTrackNumber(recording, release) {
  const media = recording?.media || release?.media || [];

  for (const medium of media) {
    for (const track of medium?.tracks || []) {
      if (
        track?.recording?.id === recording?.id ||
        track?.recording?.title === recording?.title
      ) {
        return safeString(track.position);
      }
    }
  }

  return "";
}

function findTrackTotal(release) {
  const media = Array.isArray(release?.media) ? release.media : [];

  const first = media[0];

  return first?.track_count ? String(first.track_count) : "";
}

function findDiskNumber(recording, release) {
  const media = recording?.media || release?.media || [];

  for (const medium of media) {
    for (const track of medium?.tracks || []) {
      if (track?.recording?.id === recording?.id) {
        return safeString(medium.position);
      }
    }
  }

  return "";
}

function findDiskTotal(release) {
  const media = Array.isArray(release?.media) ? release.media : [];

  return media.length ? String(media.length) : "";
}

function findAcoustID(candidates) {
  const candidate = candidates?.find((item) => item.provider === "acoustid");

  return safeString(
    candidate?.raw?.acoustid?.id || candidate?.raw?.acoustid?.recordingid || "",
  );
}

// ============================================================================
// IDENTIFICACIÓN PRINCIPAL
// ============================================================================

export async function identifyAudio(file) {
  if (!file) {
    return null;
  }

  const diagnostics = createDiagnostics();

  console.log("[Calliope] CALLIOPE AUDIO IDENTIFICATION");
  console.log("[Calliope] Archivo:", file);

  // --------------------------------------------------------------------------
  // 1. Metadata local
  // --------------------------------------------------------------------------

  const local = await readLocalMetadata(file);

  diagnostics.evidence.localMetadata = local;

  // --------------------------------------------------------------------------
  // 2. Filename
  // --------------------------------------------------------------------------

  const filename = parseFilename(file.name);

  diagnostics.evidence.filename = filename;

  const context = {
    local,
    filename,
    duration: local.duration || 0,
  };

  // --------------------------------------------------------------------------
  // 3. Fingerprint
  // --------------------------------------------------------------------------

  let fingerprintData = null;
  let acoustidCandidates = [];

  await runProvider(diagnostics, "chromaprint", async () => {
    fingerprintData = await generateFingerprint(file);

    diagnostics.evidence.fingerprint = {
      duration: fingerprintData.duration,
      sampleRate: fingerprintData.sampleRate,
      channels: fingerprintData.channels,
    };

    context.duration = fingerprintData.duration || context.duration;

    return fingerprintData ? [fingerprintData] : [];
  });

  // --------------------------------------------------------------------------
  // 4. AcoustID
  // --------------------------------------------------------------------------

  if (fingerprintData?.fingerprint) {
    await runProvider(diagnostics, "acoustid", async () => {
      acoustidCandidates = await queryAcoustID(
        fingerprintData.fingerprint,
        fingerprintData.duration,
      );

      return acoustidCandidates;
    });
  } else {
    const attempt = beginAttempt(diagnostics, "acoustid");

    finishAttempt(attempt, "skipped", 0, {
      reason: "fingerprint-unavailable",
    });
  }

  // --------------------------------------------------------------------------
  // 5. ISRC directo desde metadata local
  // --------------------------------------------------------------------------

  let isrcCandidates = [];

  if (local.isrc) {
    isrcCandidates =
      (await runProvider(diagnostics, "musicbrainz_isrc", async () =>
        queryMusicBrainzISRC(local.isrc),
      )) || [];
  } else {
    const attempt = beginAttempt(diagnostics, "musicbrainz_isrc");

    finishAttempt(attempt, "skipped", 0, {
      reason: "no-local-isrc",
    });
  }

  // --------------------------------------------------------------------------
  // 6. TODAS las fuentes textuales
  //
  // No paramos porque AcoustID haya encontrado algo.
  // Todas siguen aportando evidencia.
  // --------------------------------------------------------------------------

  const [
    musicBrainzCandidates,
    itunesCandidates,
    deezerCandidates,
    lrclibCandidates,
    optionalCandidates,
  ] = await Promise.all([
    runProvider(diagnostics, "musicbrainz", async () =>
      queryMusicBrainzText(local, filename),
    ),

    runProvider(diagnostics, "itunes", async () =>
      queryITunes(local, filename),
    ),

    runProvider(diagnostics, "deezer", async () =>
      queryDeezer(local, filename),
    ),

    runProvider(diagnostics, "lrclib", async () =>
      queryLRCLIB(local, filename),
    ),

    CONFIG.optionalProvider.enabled && CONFIG.optionalProvider.endpoint
      ? runProvider(diagnostics, "optional", async () =>
          queryOptionalProvider(file, local, filename),
        )
      : Promise.resolve([]),
  ]);

  // --------------------------------------------------------------------------
  // 7. Todos los candidatos
  // --------------------------------------------------------------------------

  const allCandidates = [
    ...acoustidCandidates,
    ...(isrcCandidates || []),
    ...(musicBrainzCandidates || []),
    ...(itunesCandidates || []),
    ...(deezerCandidates || []),
    ...(lrclibCandidates || []),
    ...(optionalCandidates || []),
  ];

  console.log("[Calliope] Acoustic providers:", {
    acoustid: acoustidCandidates.length,
  });

  for (const candidate of allCandidates) {
    candidate.rawScore = scoreCandidate(candidate, context);
  }

  diagnostics.candidateCount = allCandidates.length;
  diagnostics.evidence.allCandidates = allCandidates;

  const recordingContext = {
    title: local.title || filename.title,
    artist: local.artist || local.albumArtist || filename.artist,
    album: local.album,
    duration: context.duration,
    isrc: local.isrc,
    musicBrainzRecordingId: local.musicBrainzRecordingId,
    acoustid: local.acoustid,
  };
  const rankedRecordingCandidates = rankRecordingCandidates(
    allCandidates,
    recordingContext,
    { limit: Infinity },
  );

  diagnostics.evidence.rawCandidates = allCandidates;
  diagnostics.evidence.finalRecordingCandidates = rankedRecordingCandidates;
  diagnostics.evidence.recordingStages = {
    raw: allCandidates.length,
    afterDedupe: deduplicateRecordingCandidates(allCandidates, recordingContext)
      .length,
    afterSimilarity: rankedRecordingCandidates.length,
    final: Math.min(
      rankedRecordingCandidates.length,
      IDENTIFICATION_LIMITS.MAX_CANDIDATE_RECORDINGS,
    ),
  };
  diagnostics.evidence.recordingCandidateLimit =
    IDENTIFICATION_LIMITS.MAX_CANDIDATE_RECORDINGS;

  console.log(
    "[Calliope] Recording stages:",
    diagnostics.evidence.recordingStages,
  );

  console.log("[Calliope] Candidatos totales:", allCandidates.length);

  if (!allCandidates.length) {
    diagnostics.finishedAt = new Date().toISOString();

    return {
      status: "no_match",
      metadata: null,
      confidence: 0,
      identificationSource: "",
      musicBrainzRecordingId: "",
      diagnostics,
      candidates: [],
      recordingCandidates: [],
    };
  }

  // --------------------------------------------------------------------------
  // 8. Agrupación
  // --------------------------------------------------------------------------

  const clusters = clusterCandidates(rankedRecordingCandidates);

  diagnostics.identityCount = clusters.length;

  const identities = clusters
    .map((members) => buildClusterIdentity(members, context))
    .sort((a, b) => {
      const strongProviders = [
        "acoustid",
        "musicbrainz_isrc",
        "musicbrainz",
        "itunes",
        "deezer",
        "optional",
      ];
      const aHasStrongProvider = a.providers.some((provider) =>
        strongProviders.includes(provider),
      );
      const bHasStrongProvider = b.providers.some((provider) =>
        strongProviders.includes(provider),
      );

      if (aHasStrongProvider !== bHasStrongProvider) {
        return Number(bHasStrongProvider) - Number(aHasStrongProvider);
      }

      return b.confidence - a.confidence;
    });

  // --------------------------------------------------------------------------
  // 9. Diagnóstico de candidatos
  // --------------------------------------------------------------------------

  console.log("[Calliope] Identidades agrupadas:", identities.length);

  for (const identity of identities.slice(0, 10)) {
    console.log("[Calliope] Candidato:", {
      title: identity.title,
      artist: identity.artist,
      confidence: identity.confidence,
      providers: identity.providers,
    });
  }

  // --------------------------------------------------------------------------
  // 10. Elegir ganador
  // --------------------------------------------------------------------------

  let winner = selectBestIdentity(identities, context);

  if (!winner) {
    diagnostics.finishedAt = new Date().toISOString();

    return {
      status: "no_match",
      metadata: null,
      confidence: 0,
      identificationSource: "",
      musicBrainzRecordingId: "",
      diagnostics,
      candidates: [],
      recordingCandidates: identities.slice(
        0,
        IDENTIFICATION_LIMITS.MAX_CANDIDATE_RECORDINGS,
      ),
    };
  }

  const fingerprintAvailable = Boolean(fingerprintData?.fingerprint);
  const acousticCandidates = allCandidates.filter(
    (candidate) =>
      ["acoustid", "optional"].includes(candidate.provider) &&
      Number(candidate.providerScore || 0) >= MIN_FINGERPRINT_MATCH_SCORE,
  );
  const audioIdentities = identities.filter(hasReliableFingerprintEvidence);
  const hasAcousticIdentity =
    audioIdentities.length > 0 || acousticCandidates.length > 0;
  const winnerValidationBeforeFingerprintFallback = validateIdentity(
    winner,
    context,
  );
  if (
    fingerprintAvailable &&
    !hasAcousticIdentity &&
    !winnerValidationBeforeFingerprintFallback.valid
  ) {
    const reviewCandidates = rankedRecordingCandidates
      .slice(0, IDENTIFICATION_LIMITS.MAX_CANDIDATE_RECORDINGS)
      .map((candidate, index) => ({
        ...candidate,
        id: candidate.recordingId || candidate.isrc || `text:${index}`,
        identityKey: candidate.recordingId
          ? `recording:${candidate.recordingId}`
          : candidate.isrc
            ? `isrc:${candidate.isrc}`
            : `text:${index}:${candidate.title || "unknown"}`,
        providers: candidate.providers || [candidate.provider].filter(Boolean),
      }));
    diagnostics.warnings.push("no-reliable-fingerprint-match");
    diagnostics.finishedAt = new Date().toISOString();
    return {
      status: "ambiguous",
      metadata: null,
      confidence: winner.confidence,
      identificationSource: winner.providers.join("+"),
      musicBrainzRecordingId: "",
      diagnostics,
      candidates: reviewCandidates,
      recordingCandidates: reviewCandidates,
      fieldChoices: buildFieldChoices(reviewCandidates),
    };
  }

  const mergedWinnerCandidates = mergeCompatibleCandidates(
    winner,
    allCandidates,
    context,
  );

  const enrichmentCandidates = [
    ...new Set([
      ...mergedWinnerCandidates,
      ...allCandidates.filter((candidate) =>
        candidateMatchesLocalRecording(candidate, context),
      ),
    ]),
  ];

  if (enrichmentCandidates.length > winner.candidates.length) {
    winner = buildClusterIdentity(enrichmentCandidates, context);
    winner.enrichedFromProviders = [
      ...new Set(enrichmentCandidates.map((candidate) => candidate.provider)),
    ];
  }

  const validation = validateIdentity(winner, context);

  winner.validation = validation;

  // --------------------------------------------------------------------------
  // 11. Evidencia competida
  // --------------------------------------------------------------------------
  // Una diferencia pequeña entre candidatos no debe bloquear el editor:
  // el usuario necesita recibir una propuesta completa y poder revisarla.
  // Solo la validación de identidad decide si el resultado es utilizable.
  const second = identities.find(
    (identity) =>
      identity.identityKey !== winner.identityKey && isStrongIdentity(identity),
  );
  const competingEvidence =
    second &&
    winner.confidence - second.confidence <
      CONFIG.identification.ambiguityMargin &&
    identitiesHaveDifferentEvidence(winner, second);

  if (competingEvidence) {
    diagnostics.warnings.push("competing-candidates-reviewable");
    diagnostics.competingCandidates = identities.slice(0, 10);
    console.warn(
      "[Calliope] Evidencia competida; se devuelve propuesta revisable",
      {
        winner: winner.confidence,
        second: second.confidence,
      },
    );
  }

  if (!validation.valid) {
    console.warn("[Calliope] Candidato rechazado:", validation);

    diagnostics.finishedAt = new Date().toISOString();

    return {
      status: "no_match",
      metadata: null,
      confidence: winner.confidence,
      identificationSource: winner.providers.join("+"),
      musicBrainzRecordingId: winner.recordingId || "",
      diagnostics,
      candidates: identities.slice(0, 10),
      recordingCandidates: identities.slice(
        0,
        IDENTIFICATION_LIMITS.MAX_CANDIDATE_RECORDINGS,
      ),
    };
  }

  // --------------------------------------------------------------------------
  // 12. Enriquecimiento MusicBrainz
  // --------------------------------------------------------------------------

  let recording = null;
  let release = null;
  let releaseGroup = null;
  const recordingLookupById = new Map();

  if (winner.recordingId) {
    recording = await runProvider(
      diagnostics,
      "musicbrainz-recording-lookup",
      async () => lookupMusicBrainzRecording(winner.recordingId),
    );
    if (recording) recordingLookupById.set(winner.recordingId, recording);
  }

  if (!recording) {
    const fallbackCandidate = winner.candidates.find(
      (candidate) =>
        candidate.recordingId === winner.recordingId ||
        ["acoustid"].includes(candidate.provider),
    );

    recording =
      fallbackCandidate?.raw?.recording || fallbackCandidate?.raw || null;
  }

  const recordingIdentities = identities
    .slice(0, IDENTIFICATION_LIMITS.MAX_CANDIDATE_RECORDINGS)
    .filter(Boolean);

  for (const identity of recordingIdentities) {
    if (recordingLookupById.has(identity.recordingId)) continue;
    const candidateRecording = await runProvider(
      diagnostics,
      "musicbrainz-recording-discovery",
      async () => lookupMusicBrainzRecording(identity.recordingId),
    );
    if (candidateRecording)
      recordingLookupById.set(identity.recordingId, candidateRecording);
  }

  const discoveredRecordingEntries = recordingIdentities.map((identity) => {
    const candidateRecording =
      recordingLookupById.get(identity.recordingId) || null;
    const relatedReleases = discoverNormalizedReleases(
      candidateRecording ? [candidateRecording] : [],
      {
        recordingId: identity.recordingId,
        title: identity.title,
        album: identity.album,
        artist: identity.artist,
        artists: candidateRecording
          ? extractArtistNames(candidateRecording)
          : [identity.artist],
      },
    );
    return recordingCandidateView(
      identity,
      candidateRecording,
      relatedReleases,
    );
  });

  const winnerDiscoveredReleases =
    discoveredRecordingEntries.find(
      (entry) => entry.id === (winner.recordingId || winner.identityKey),
    )?.releases || [];

  diagnostics.evidence.rawReleases = discoveredRecordingEntries.flatMap(
    (entry) => entry.releases || [],
  );
  diagnostics.evidence.finalReleases = winnerDiscoveredReleases;
  diagnostics.evidence.releaseStages = {
    raw: diagnostics.evidence.rawReleases.length,
    afterDedupe: deduplicateReleases(diagnostics.evidence.rawReleases).length,
    final: winnerDiscoveredReleases.length,
  };
  console.log(
    "[Calliope] Release discovery for:",
    `${winner.title} — ${winner.artist}`,
  );
  console.log("[Calliope] Final releases:", winnerDiscoveredReleases.length);

  const preferredRelease = choosePreferredRelease(
    recording,
    winner.releaseId,
    winner.releaseGroupId,
    local.album,
  );

  const releaseId =
    preferredRelease?.id ||
    winner.releaseId ||
    recording?.releases?.[0]?.id ||
    "";

  const releaseFallback =
    preferredRelease ||
    recording?.releases?.find((item) => item?.id === releaseId) ||
    null;

  if (releaseId) {
    release = await runProvider(
      diagnostics,
      "musicbrainz-release-lookup",
      async () => lookupMusicBrainzRelease(releaseId),
    );
  }

  release = release || releaseFallback;

  const releaseGroupId =
    release?.["release-group"]?.id ||
    preferredRelease?.["release-group"]?.id ||
    winner.releaseGroupId ||
    recording?.["release-group"]?.id ||
    recording?.releasegroups?.[0]?.id ||
    release?.["release-group"]?.id ||
    "";

  const releaseGroupFallback =
    release?.["release-group"] ||
    recording?.["release-group"] ||
    recording?.releasegroups?.[0] ||
    null;

  if (releaseGroupId) {
    releaseGroup = await runProvider(
      diagnostics,
      "musicbrainz-release-group-lookup",
      async () => lookupMusicBrainzReleaseGroup(releaseGroupId),
    );
  }

  releaseGroup = releaseGroup || releaseGroupFallback;

  // --------------------------------------------------------------------------
  // 13. Géneros
  // --------------------------------------------------------------------------

  const genreResolution = resolveGenresImproved({
    recording,
    release,
    releaseGroup,
    candidates: enrichmentCandidates,
    local,
  });

  diagnostics.evidence.genreResolution = genreResolution;

  console.log("[Calliope] Géneros seleccionados:", genreResolution.selected);

  console.log("[Calliope] Géneros descartados:", genreResolution.discarded);

  // --------------------------------------------------------------------------
  // 14. Cover
  // --------------------------------------------------------------------------

  const mbCover = await getCoverFromMusicBrainz(
    release?.id || winner.releaseId,
    releaseGroup?.id || winner.releaseGroupId,
  );

  // La portada del release exacto tiene prioridad absoluta. Los proveedores
  // textuales suelen devolver la portada del álbum padre incluso cuando la
  // grabación también tiene un single con otra portada.
  const releaseCandidateCover = chooseBestCover(
    enrichmentCandidates,
    release?.title || winner.album,
  );
  const cover = mbCover || releaseCandidateCover || "";

  if (release && cover) {
    release.cover = cover;
    release.coverUrl = cover;
    release.coverAlternatives = [
      { url: cover, source: mbCover ? "musicbrainz-cover-art" : "provider" },
    ];
  }

  // --------------------------------------------------------------------------
  // 15. Metadata final
  // --------------------------------------------------------------------------

  const metadata = buildMetadata({
    identity: winner,
    recording,
    release,
    releaseGroup,
    local,
    genres: genreResolution.genres,
    genreSources: genreResolution.genreSources,
    cover,
    consensus: winner.consensus,
  });

  const normalized = buildNormalizedIdentification({
    identity: winner,
    recording,
    release,
    releaseGroup,
    candidates: enrichmentCandidates,
    local,
    genres: genreResolution.genres,
    cover,
    discoveredReleases: winnerDiscoveredReleases,
  });

  diagnostics.evidence.fieldConsensus = winner.consensus;

  diagnostics.winner = {
    identityKey: winner.identityKey,
    title: winner.title,
    artist: winner.artist,
    confidence: winner.confidence,
    providers: winner.providers,
    validation,
  };

  diagnostics.finishedAt = new Date().toISOString();

  console.log("[Calliope] IDENTIFICACIÓN CONSENSUADA");

  console.log("[Calliope] Título:", metadata.title);

  console.log("[Calliope] Artista:", metadata.artist);

  console.log("[Calliope] Confianza:", winner.confidence);

  console.log("[Calliope] Fuentes:", winner.providers);

  console.log("[Calliope] Géneros:", metadata.genre);

  console.log("[Calliope] CANCIÓN IDENTIFICADA");

  console.log("[Calliope] Resultado final:", metadata);

  return {
    status: "match",

    metadata,

    recording: normalized.recording,

    releases: normalized.releases,

    releaseGroups: normalized.releaseGroups,

    evidence: normalized.evidence,

    confidenceByEntity: normalized.confidence,

    confidence: winner.confidence,

    identificationSource: winner.providers.join("+"),

    musicBrainzRecordingId: metadata.musicBrainzRecordingId,

    diagnostics,

    candidates: identities.slice(
      0,
      IDENTIFICATION_LIMITS.MAX_CANDIDATE_RECORDINGS,
    ),

    recordingCandidates: discoveredRecordingEntries,

    selectedRecording:
      discoveredRecordingEntries.find(
        (candidate) =>
          candidate.id === (winner.recordingId || winner.identityKey),
      ) || null,

    allCandidates,
    fieldChoices: buildFieldChoices(enrichmentCandidates, winner),
  };
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  identifyAudio,
};
