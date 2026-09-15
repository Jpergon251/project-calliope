const MAX_CANDIDATE_RECORDINGS = 6;
const MIN_RECORDING_SIMILARITY = 0.3;
const MIN_PREFERRED_RELEASES = 3;
const MAX_RELEASES = 5;

const PROVIDER_WEIGHTS = {
  acoustid: 1,
  audd: 1,
  musicbrainz_isrc: 0.99,
  musicbrainz: 0.92,
  optional: 0.95,
  itunes: 0.8,
  lrclib: 0.25,
};

function clean(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

export function normalizeComparable(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeArtist(value) {
  return normalizeComparable(value)
    .replace(/\b(feat|ft|featuring)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function artistTextSimilarity(left, right) {
  const normalizedLeft = normalizeArtist(left);
  const normalizedRight = normalizeArtist(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;

  const split = (value) => value
    .split(/\s*(?:,|&|\b(?:and|y|con|feat\.?|ft\.?|featuring)\b)\s*/i)
    .map((item) => normalizeArtist(item))
    .filter(Boolean);
  const leftArtists = new Set(split(normalizedLeft));
  const rightArtists = new Set(split(normalizedRight));
  const shared = [...leftArtists].filter((artist) => rightArtists.has(artist));

  if (shared.length && (shared.length === leftArtists.size || shared.length === rightArtists.size)) {
    return 0.92;
  }

  return textSimilarity(normalizedLeft, normalizedRight);
}

function normalizeTitle(value) {
  return normalizeComparable(value)
    .replace(/\b(?:feat|ft|featuring)\b.*$/g, "")
    .replace(/\b(?:remix|version|live|edit|radio edit|acoustic|extended|remastered)\b.*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function comparableTitle(value) {
  const raw = clean(value)
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .replace(/\s*\[[^\]]*\]\s*$/g, "")
    .trim()
    .toLowerCase();
  return normalizeTitle(raw) || raw;
}

function titleSimilarity(left, right) {
  return Math.max(
    textSimilarity(left, right),
    textSimilarity(normalizeTitle(left), normalizeTitle(right)),
    textSimilarity(comparableTitle(left), comparableTitle(right)),
  );
}

function releaseTextKey(release) {
  return [
    normalizeComparable(release?.title),
    normalizeArtist(release?.artist || release?.albumArtist),
    normalizeComparable(release?.type),
    clean(release?.year || release?.releaseDate).slice(0, 4),
  ].join("|");
}

function levenshteinDistance(left, right) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current.push(Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      ));
    }
    previous = current;
  }

  return previous[right.length];
}

export function textSimilarity(left, right) {
  const normalizedLeft = normalizeComparable(left);
  const normalizedRight = normalizeComparable(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;
  return Math.max(0, 1 - levenshteinDistance(normalizedLeft, normalizedRight) / Math.max(normalizedLeft.length, normalizedRight.length));
}

export function durationSimilarity(left, right) {
  const leftSeconds = Number(left);
  const rightSeconds = Number(right);
  if (!Number.isFinite(leftSeconds) || !Number.isFinite(rightSeconds) || leftSeconds <= 0 || rightSeconds <= 0) return 0;
  const difference = Math.abs(leftSeconds - rightSeconds);
  if (difference <= 1) return 1;
  if (difference <= 2) return 0.97;
  if (difference <= 4) return 0.9;
  if (difference <= 8) return 0.75;
  if (difference <= 15) return 0.5;
  return 0;
}

function artistNames(candidate) {
  const structured = Array.isArray(candidate?.artists) ? candidate.artists : [];
  const credits = Array.isArray(candidate?.artistCredits) ? candidate.artistCredits : [];
  const names = [
    ...structured.map((artist) => typeof artist === "string" ? artist : artist?.name),
    ...credits.map((credit) => typeof credit === "string" ? credit : credit?.name || credit?.artist?.name),
    candidate?.artist,
  ].filter(Boolean);
  return [...new Set(names.map(normalizeArtist).filter(Boolean))];
}

function artistIds(candidate) {
  const values = [
    ...(Array.isArray(candidate?.artists) ? candidate.artists : []),
    ...(Array.isArray(candidate?.artistCredits) ? candidate.artistCredits : []),
  ];
  return new Set(values.map((artist) => typeof artist === "string" ? "" : artist?.id || artist?.artistId || artist?.musicBrainzId).filter(Boolean));
}

function mergeArtistData(current, incoming) {
  const structured = [
    ...(Array.isArray(current?.artistCredits) ? current.artistCredits : []),
    ...(Array.isArray(incoming?.artistCredits) ? incoming.artistCredits : []),
    ...(Array.isArray(current?.artists) ? current.artists : []),
    ...(Array.isArray(incoming?.artists) ? incoming.artists : []),
  ];
  const seen = new Set();
  const artists = structured.filter((artist) => {
    const name = typeof artist === "string" ? artist : artist?.name;
    const key = normalizeArtist(name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { artists, artistCredits: artists };
}

function artistSimilarity(candidate, context) {
  const candidateIds = artistIds(candidate);
  const referenceIds = artistIds(context);
  if ([...candidateIds].some((id) => referenceIds.has(id))) return 1;
  const candidateArtists = artistNames(candidate);
  const referenceArtists = artistNames(context);
  if (!candidateArtists.length || !referenceArtists.length) return 0;
  return Math.max(...candidateArtists.flatMap((candidateArtist) => referenceArtists.map((referenceArtist) => artistTextSimilarity(candidateArtist, referenceArtist))));
}

function providerWeight(candidate) {
  return PROVIDER_WEIGHTS[candidate?.provider || candidate?.source] || 0.5;
}

function exactEvidence(candidate, context) {
  let score = 0;
  if (context?.isrc && candidate?.isrc && context.isrc === candidate.isrc) score += 0.45;
  if (context?.musicBrainzRecordingId && candidate?.recordingId && context.musicBrainzRecordingId === candidate.recordingId) score += 0.45;
  if (context?.acoustid && candidate?.acoustid && context.acoustid === candidate.acoustid) score += 0.35;
  return Math.min(1, score);
}

function candidateIsPlausible(candidate, context) {
  const titleScore = titleSimilarity(candidate?.title, context.title);
  const artistScore = artistSimilarity(candidate, context);
  const durationScore = durationSimilarity(candidate?.duration, context.duration);
  const hasExactEvidence = exactEvidence(candidate, context) > 0;
  const hasCandidateArtist = artistNames(candidate).length > 0;
  if (titleScore < 0.58) return false;
  const titleAndDurationMatch = Number(candidate?.duration) > 0
    && Number(context?.duration) > 0
    && titleScore >= 0.92
    && durationScore >= 0.9
    && artistScore >= 0.5;
  if (hasCandidateArtist && artistNames(context).length && artistScore < 0.7 && !hasExactEvidence && !titleAndDurationMatch) return false;
  return true;
}

export function calculateRecordingSimilarity(candidate, context = {}) {
  const titleSimilarityScore = titleSimilarity(candidate?.title, context.title);
  const artistScore = artistSimilarity(candidate, context);
  const durationScore = durationSimilarity(candidate?.duration, context.duration);
  const exactScore = exactEvidence(candidate, context);
  const albumScore = textSimilarity(candidate?.album, context.album);

  const similarity = Math.min(1, exactScore
    + artistScore * 0.28
    + titleSimilarityScore * 0.25
    + durationScore * 0.12
    + albumScore * 0.05
    + providerWeight(candidate) * 0.08);
  const evidenceScore = Math.min(1, similarity + Math.min(0.2, Math.max(0, (candidate?.providers?.length || 1) - 1) * 0.05));

  return {
    artistSimilarity: artistScore,
    titleSimilarity: titleSimilarityScore,
    durationSimilarity: durationScore,
    similarity,
    confidence: evidenceScore,
    evidenceScore,
  };
}

function recordingIdentityKey(candidate) {
  if (candidate?.recordingId) return `recording:${candidate.recordingId}`;
  if (candidate?.isrc) return `isrc:${candidate.isrc}`;
  if (candidate?.acoustid) return `acoustid:${candidate.acoustid}`;
  return `text:${normalizeArtist(candidate?.artist)}|${normalizeComparable(candidate?.title)}|${Math.round(Number(candidate?.duration) || 0)}`;
}

export function deduplicateRecordingCandidates(candidates = [], context = {}) {
  const grouped = new Map();

  for (const candidate of candidates) {
    const key = recordingIdentityKey(candidate);
    const scored = { ...candidate, ...calculateRecordingSimilarity(candidate, context) };
    const current = grouped.get(key);

    if (!current) {
      grouped.set(key, {
        ...scored,
        ...mergeArtistData({}, candidate),
        providers: [...new Set(candidate.providers || [candidate.provider].filter(Boolean))],
      });
      continue;
    }

    current.providers = [...new Set([
      ...(current.providers || []),
      ...(candidate.providers || [candidate.provider]),
    ].filter(Boolean))];
    current.confidence = Math.max(current.confidence, scored.confidence);
    current.evidenceScore = Math.max(current.evidenceScore, scored.evidenceScore);
    Object.assign(current, mergeArtistData(current, candidate));
    if (scored.similarity > current.similarity) Object.assign(current, scored);
  }

  return [...grouped.values()];
}

export function rankRecordingCandidates(candidates = [], context = {}, options = {}) {
  const merged = deduplicateRecordingCandidates(candidates, context)
    .filter((candidate) => candidateIsPlausible(candidate, context))
    .filter((candidate) => candidate.similarity >= MIN_RECORDING_SIMILARITY)
    .sort((left, right) => right.similarity - left.similarity || right.evidenceScore - left.evidenceScore);
  return Number.isFinite(options.limit)
    ? merged.slice(0, options.limit)
    : merged.slice(0, MAX_CANDIDATE_RECORDINGS);
}

function releaseIdentityKey(release) {
  if (release?.barcode) return `barcode:${normalizeComparable(release.barcode)}`;
  if (release?.catalogNumber) return `catalog:${normalizeComparable(release.catalogNumber)}|${normalizeArtist(release.artist || release.albumArtist)}`;
  if (release?.musicBrainzReleaseId && !String(release.musicBrainzReleaseId).startsWith("itunes:")) return `release:${release.musicBrainzReleaseId}`;
  if (release?.id && !String(release.id).startsWith("itunes:") && !String(release.id).startsWith("local:")) return `release:${release.id}`;
  if (release?.releaseGroupId) return `group:${release.releaseGroupId}|${normalizeComparable(release.title)}|${release.type}`;
  return `text:${releaseTextKey(release)}`;
}

function releasesRepresentSameEdition(left, right) {
  const leftId = String(left?.id || left?.musicBrainzReleaseId || "");
  const rightId = String(right?.id || right?.musicBrainzReleaseId || "");
  const leftIsSynthetic = !leftId || leftId.startsWith("itunes:") || leftId.startsWith("release_") || leftId.startsWith("local:");
  const rightIsSynthetic = !rightId || rightId.startsWith("itunes:") || rightId.startsWith("release_") || rightId.startsWith("local:");
  if (!leftIsSynthetic && !rightIsSynthetic && leftId !== rightId) return false;
  const leftType = normalizeComparable(left?.type);
  const rightType = normalizeComparable(right?.type);
  if (leftType && rightType && leftType !== rightType) return false;
  const isSpecial = (t) => /\b(deluxe|special|edici[oó]n|remaster|bonus|anniversary|expanded)\b/i.test(t || "");
  if (isSpecial(left?.title) !== isSpecial(right?.title)) return false;
  const leftTitle = normalizeComparable(left?.title);
  const rightTitle = normalizeComparable(right?.title);
  const leftArtist = normalizeArtist(left?.artist || left?.albumArtist);
  const rightArtist = normalizeArtist(right?.artist || right?.albumArtist);
  if (!leftTitle || leftTitle !== rightTitle || leftArtist !== rightArtist) return false;
  if (left?.releaseGroupId && right?.releaseGroupId && left.releaseGroupId !== right.releaseGroupId) return false;
  const leftYear = clean(left?.year || left?.releaseDate).slice(0, 4);
  const rightYear = clean(right?.year || right?.releaseDate).slice(0, 4);
  return !leftYear || !rightYear || leftYear === rightYear;
}

function isSyntheticCoverUrl(value) {
  return /(?:^|\/)coverartarchive\.org\//i.test(String(value || ""));
}

export function calculateReleaseScore(release, recording = {}) {
  const titleScore = titleSimilarity(release?.title, recording?.album || recording?.title);
  const artistScore = artistSimilarity(release, recording);
  const exactRecording = release?.recordingIds?.includes(recording?.recordingId) || release?.recordingId === recording?.recordingId ? 1 : 0;
  const sourceScore = providerWeight(release);
  const trackScore = Number(Boolean(release?.trackNumber || release?.tracks?.length));
  return Math.min(1, exactRecording * 0.4 + artistScore * 0.2 + titleScore * 0.12 + sourceScore * 0.12 + trackScore * 0.08 + Number(Boolean(release?.releaseGroupId)) * 0.08);
}

export function deduplicateReleases(releases = []) {
  const grouped = new Map();
  for (const release of releases) {
    const key = releaseIdentityKey(release);
    const current = grouped.get(key) || [...grouped.values()].find((item) => releasesRepresentSameEdition(item, release));
    if (!current) {
      grouped.set(key, {
        ...release,
        providers: [...new Set(release.providers || [release.provider].filter(Boolean))],
        artwork: [
          ...(release.artwork || []),
          ...(release.cover ? [{ source: release.source || release.provider || "release", url: release.cover }] : []),
          ...(release.coverUrl ? [{ source: release.source || release.provider || "release", url: release.coverUrl }] : []),
        ],
      });
      continue;
    }
    current.providers = [...new Set([...(current.providers || []), ...(release.providers || [release.provider])].filter(Boolean))];
    if (release.cover && (!current.cover || (isSyntheticCoverUrl(current.cover) && !isSyntheticCoverUrl(release.cover)))) {
      current.cover = release.cover;
    }
    if (release.coverUrl && (!current.coverUrl || (isSyntheticCoverUrl(current.coverUrl) && !isSyntheticCoverUrl(release.coverUrl)))) {
      current.coverUrl = release.coverUrl;
    }
    current.artwork = [...new Map([
      ...(current.artwork || []),
      ...(release.artwork || []),
      ...(release.cover ? [{ source: release.source || release.provider || "release", url: release.cover }] : []),
      ...(release.coverUrl ? [{ source: release.source || release.provider || "release", url: release.coverUrl }] : []),
    ].map((item) => [item.url, item])).values()];
  }
  return [...grouped.values()];
}

export function rankReleases(releases = [], recording = {}, options = {}) {
  const limit = options.limit === Infinity
    ? Infinity
    : Number.isInteger(options.limit) && options.limit > 0
      ? options.limit
      : MAX_RELEASES;
  return deduplicateReleases(releases)
    .map((release) => ({ ...release, similarity: calculateReleaseScore(release, recording), confidence: calculateReleaseScore(release, recording) }))
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, limit);
}

export const IDENTIFICATION_LIMITS = {
  MAX_CANDIDATE_RECORDINGS,
  MIN_RECORDING_SIMILARITY,
  MIN_PREFERRED_RELEASES,
  MAX_RELEASES,
};
