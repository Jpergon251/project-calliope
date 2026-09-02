import {
  Fingerprinter
} from 'rusty-chromaprint-wasm';

// API Key del usuario registrada en AcoustID
const ACOUSTID_CLIENT = 'gCqZRLkoQU';
const MAX_FINGERPRINT_SECONDS = 120;
const MIN_MATCH_SCORE = 0.5;
const MUSICBRAINZ_API = 'https://musicbrainz.org/ws/2';

/**
 * Convierte muestras Float32 [-1, 1] a Int16 [-32768, 32767]
 */
function float32ToInt16(float32) {
  const samples = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    samples[i] = s < 0 ? s * 32768 : s * 32767;
  }
  return samples;
}

/**
 * Decodifica el archivo de audio usando la Web Audio API nativa del navegador
 */
async function decodeAudioFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();

  try {
    return await ctx.decodeAudioData(arrayBuffer);
  } finally {
    await ctx.close();
  }
}

/**
 * Mezcla todos los canales a mono y limita a maxSeconds
 */
function audioBufferToMono(audioBuffer, maxSeconds = MAX_FINGERPRINT_SECONDS) {
  const { numberOfChannels: channels, sampleRate, length } = audioBuffer;
  const maxSamples = Math.min(length, Math.floor(sampleRate * maxSeconds));

  if (channels === 1) {
    return audioBuffer.getChannelData(0).subarray(0, maxSamples);
  }

  const mono = new Float32Array(maxSamples);
  for (let ch = 0; ch < channels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < maxSamples; i++) {
      mono[i] += data[i] / channels;
    }
  }
  return mono;
}

/**
 * Genera la huella acústica AcoustID-compatible con Chromaprint WASM
 */
function createFingerprint(audioBuffer) {
  const sampleRate = audioBuffer.sampleRate;
    const mono = audioBufferToMono(audioBuffer, MAX_FINGERPRINT_SECONDS);
  const samples = float32ToInt16(mono);

  const fp = new Fingerprinter();
  fp.start(sampleRate, 1);

  const CHUNK = 4096;
  for (let offset = 0; offset < samples.length; offset += CHUNK) {
    fp.consume(samples.subarray(offset, Math.min(offset + CHUNK, samples.length)));
  }

  fp.finish();
  return {
    compressed: fp.getCompressedFingerprint(),
    duration: samples.length / sampleRate
  };
}

/**
 * Consulta AcoustID por POST
 */
async function lookupAcoustID(fingerprint, duration) {
  const body = new URLSearchParams({
    client: ACOUSTID_CLIENT,
    duration: String(Math.round(duration)),
    fingerprint,
    meta: 'recordings+releasegroups+releases'
  });

  const response = await fetch('https://api.acoustid.org/v2/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

    let data = null;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Error al leer la respuesta de AcoustID (HTTP ${response.status})`);
  }

  if (!response.ok || data.status !== 'ok') {
    throw new Error(
      data?.error?.message || `AcoustID respondió con HTTP ${response.status}`
    );
  }

  return data.results || [];
}

/**
 * Resuelve un AcoustID track id cuando el lookup por fingerprint no incluye
 * el array recordings en la respuesta.
 */
async function lookupAcoustIDTrack(trackId) {
  const body = new URLSearchParams({
    client: ACOUSTID_CLIENT,
    trackid: trackId,
    meta: 'recordingids'
  });
  const response = await fetch('https://api.acoustid.org/v2/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Error al leer la respuesta de AcoustID (HTTP ${response.status})`);
  }

  if (!response.ok || data.status !== 'ok') {
    throw new Error(
      data?.error?.message || `AcoustID respondió con HTTP ${response.status}`
    );
  }

  return Array.isArray(data.results) ? data.results : [];
}

async function resolveRecordingResults(results) {
  const resolved = [];

  for (const result of Array.isArray(results) ? results : []) {
    if (Array.isArray(result.recordings) && result.recordings.length) {
      resolved.push(result);
      continue;
    }

    if (!result.id) continue;
    const trackResults = await lookupAcoustIDTrack(result.id);
    const recordingIds = trackResults
      .flatMap(trackResult => Array.isArray(trackResult.recordings)
        ? trackResult.recordings
        : [])
      .map(recording => recording?.id)
      .filter(Boolean);

    if (recordingIds.length) {
      resolved.push({
        ...result,
        recordings: [...new Set(recordingIds)].map(id => ({ id }))
      });
    }
  }

  return resolved;
}

/**
 * Elige el resultado con mayor puntuación que tenga grabación asociada
 */
function chooseBestResult(results) {
  const candidates = (Array.isArray(results) ? results : []).flatMap(result => {
    const score = Number(result?.score);
    return (Array.isArray(result?.recordings) ? result.recordings : [])
      .filter(recording => recording?.id && Number.isFinite(score))
      .map(recording => ({ result, recording, score }));
  });

  candidates.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    const metadata = recording => Number(Boolean(recording.title))
      + Number(Boolean(recording.artists?.length))
      + Number(Boolean(recording.releasegroups?.length));
    return metadata(right.recording) - metadata(left.recording);
  });

  const best = candidates[0];
  return best && best.score >= MIN_MATCH_SCORE ? best : null;
}

function artistCreditNames(artistCredit) {
  if (!Array.isArray(artistCredit)) return '';
  return artistCredit
    .map(credit => credit?.name || credit?.artist?.name || '')
    .filter(Boolean)
    .join(', ');
}

function artistNames(artists) {
  if (!Array.isArray(artists)) return '';
  return artists.map(artist => artist?.name || '').filter(Boolean).join(', ');
}

function genreNames(...sources) {
  return [...new Set(sources
    .flatMap(source => Array.isArray(source) ? source : [])
    .map(genre => typeof genre === 'string' ? genre : genre?.name)
    .filter(Boolean))];
}

async function lookupMusicBrainzRecording(recordingId) {
  const params = new URLSearchParams({
    inc: 'artist-credits+releases+release-groups+media+genres',
    fmt: 'json'
  });
  const response = await fetch(
    `${MUSICBRAINZ_API}/recording/${encodeURIComponent(recordingId)}?${params}`,
    { headers: { Accept: 'application/json' } }
  );

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`MusicBrainz respondió con HTTP ${response.status}.`);
  return response.json();
}

function releaseGroupId(release) {
  return release?.['release-group']?.id || release?.release_group?.id || '';
}

function chooseRelease(recording, acoustidRecording) {
  const releases = Array.isArray(recording?.releases) ? recording.releases : [];
  const preferredGroups = new Set(
    (acoustidRecording?.releasegroups || []).map(group => group?.id).filter(Boolean)
  );

  return [...releases].sort((left, right) => {
    const preferredDifference = Number(preferredGroups.has(releaseGroupId(right)))
      - Number(preferredGroups.has(releaseGroupId(left)));
    if (preferredDifference) return preferredDifference;
    const mediaDifference = Number(Array.isArray(right.media) && right.media.length)
      - Number(Array.isArray(left.media) && left.media.length);
    if (mediaDifference) return mediaDifference;
    return Number(left.status !== 'official') - Number(right.status !== 'official');
  })[0] || null;
}

function getTrackData(release, recordingId, title) {
  const media = Array.isArray(release?.media) ? release.media : [];
  for (const medium of media) {
    const tracks = Array.isArray(medium.tracks) ? medium.tracks : [];
    const track = tracks.find(item => item.recording?.id === recordingId)
      || tracks.find(item => item.title === title);
    if (track) {
      return {
        track: track.position ? String(track.position) : '',
        trackTotal: medium['track-count'] ? String(medium['track-count']) : '',
        disk: medium.position ? String(medium.position) : '',
        diskTotal: release['media-count']
          ? String(release['media-count'])
          : String(media.length)
      };
    }
  }
  return { track: '', trackTotal: '', disk: '', diskTotal: '' };
}

function getCover(release, recording) {
  const groupId = releaseGroupId(release)
    || recording?.releasegroups?.find(group => group?.id)?.id;
  if (groupId) return `https://coverartarchive.org/release-group/${groupId}/front-500`;
  return release?.id ? `https://coverartarchive.org/release/${release.id}/front-500` : '';
}

function mapMetadata(acoustidResult, acoustidRecording, musicBrainzRecording) {
  const recording = musicBrainzRecording || {};
  const title = recording.title || acoustidRecording.title || '';
  const artist = artistCreditNames(recording['artist-credit'])
    || artistNames(acoustidRecording.artists);
  const release = chooseRelease(recording, acoustidRecording);
  const releaseGroup = release?.['release-group'];
  const genres = genreNames(
    recording.genres,
    release?.genres,
    releaseGroup?.genres,
    acoustidRecording.genres
  );
  return {
    title,
    artist,
    albumArtist: artistCreditNames(release?.['artist-credit']) || artist,
    album: releaseGroup?.title
      || acoustidRecording.releasegroups?.find(group => group?.title)?.title
      || release?.title
      || '',
    genre: genres,
    year: release?.date?.year
      ? String(release.date.year)
      : (release?.date?.slice?.(0, 4) || ''),
    ...getTrackData(release, recording.id || acoustidRecording.id, title),
    cover: getCover(release, acoustidRecording),
    confidence: acoustidResult.score,
    musicBrainzRecordingId: acoustidRecording.id,
    acoustid: acoustidResult.result.id || ''
  };
}

/**
 * Identifica un archivo de audio (SOLO LECTURA) y devuelve sus metadatos.
 * @param {File} file
 * @returns {Promise<Object|null>}
 */
export async function identifyAudio(file) {
  if (!(file instanceof File)) {
    throw new Error('El archivo proporcionado no es válido.');
  }

  console.log('[Calliope] Analizando:', file.name);

  // 1. Decodificar audio
  const audioBuffer = await decodeAudioFile(file);
  console.log(
    `[Calliope] Audio: ${audioBuffer.duration.toFixed(2)}s @ ${audioBuffer.sampleRate}Hz`
  );

  // 2. Generar huella acústica (Chromaprint WASM)
  const fingerprint = createFingerprint(audioBuffer);
  console.log('[Calliope] Fingerprint:', fingerprint.compressed.slice(0, 40) + '...');

  // 3. Consultar AcoustID
  const results = await lookupAcoustID(fingerprint.compressed, audioBuffer.duration);
  console.log('[Calliope] Resultados AcoustID:', results);

  // 4. Elegir mejor coincidencia
  const best = chooseBestResult(await resolveRecordingResults(results));
  if (!best) return null;

  // AcoustID identifies the recording; MusicBrainz supplies release/media details.
  const musicBrainzRecording = await lookupMusicBrainzRecording(best.recording.id);
  return mapMetadata(best, best.recording, musicBrainzRecording);
}