import { normalizeComparable, resolveReleaseType } from "../models/musicEntities.js";

const TYPE_PRIORITY = {
  album: 1,
  ep: 2,
  single: 3,
  compilation: 4,
  soundtrack: 5,
  live: 6,
  other: 8,
  unknown: 9,
};

function releaseScore(release, song) {
  const type = resolveReleaseType(release);
  let score = TYPE_PRIORITY[type] || 9;
  const title = normalizeComparable(release.title || "");
  const songTitle = normalizeComparable(song?.title || "");
  if (title.includes("deluxe") || title.includes("remaster") || title.includes("anniversary")) score += 2;
  if (songTitle && title === songTitle && type === "single") score += 1;
  return score;
}

export function selectPrimaryRelease(song, releases = []) {
  const candidates = releases.filter((release) => song?.releaseIds?.includes(release.id));
  if (!candidates.length) return null;
  const manuallySelected = candidates.find((release) => release.id === song?.primaryReleaseId);
  if (manuallySelected) return manuallySelected;
  return [...candidates].sort((a, b) => releaseScore(a, song) - releaseScore(b, song))[0];
}

export function getCoverForSong(song, context = {}, releases = []) {
  if (!song) return null;
  const releaseId = context.releaseId || (context.type === "song" || context.type === "library"
    ? song.primaryReleaseId
    : null);
  const release = releaseId && releases.find((item) => item.id === releaseId);
  return release?.cover || release?.coverUrl || (context.type === "song" ? song.cover : null) || null;
}

export function applyReleaseContext(song, releaseId, releases = [], releaseTracks = []) {
  if (!song) return song;
  const release = releases.find((item) => item.id === releaseId);
  if (!release) return song;
  const track = releaseTracks.find((item) =>
    item.recordingId === (song.recordingId || song.id) && item.releaseId === release.id,
  );
  return {
    ...song,
    contextReleaseId: release.id,
    primaryReleaseId: release.id,
    releaseType: release.type || song.releaseType || "unknown",
    album: release.title || song.album || "",
    albumId: release.id,
    albumArtist: release.albumArtist || release.artist || song.albumArtist || "",
    year: release.year || song.year || "",
    cover: release.cover || release.coverUrl || song.cover || null,
    track: track?.trackNumber || song.track || null,
    trackTotal: track?.trackTotal || release.trackTotal || song.trackTotal || null,
    disk: track?.discNumber || song.disk || null,
    diskTotal: track?.discTotal || release.discTotal || song.diskTotal || null,
  };
}

export function buildReleaseRelations(recordings = [], releases = [], releaseTracks = []) {
  const releasesById = new Map(releases.map((release) => [release.id, release]));
  return recordings.map((recording) => {
    const relatedReleases = (recording.releaseIds || [])
      .map((id) => releasesById.get(id))
      .filter(Boolean);
    const primary = selectPrimaryRelease(recording, relatedReleases);
    const tracks = releaseTracks.filter((track) => track.recordingId === recording.id);
    return {
      ...recording,
      releases: relatedReleases,
      primaryRelease: primary,
      primaryReleaseId: primary?.id || recording.primaryReleaseId || null,
      releaseTracks: tracks,
      album: primary?.title || recording.album || "",
      albumArtist: primary?.albumArtist || recording.albumArtist || "",
      year: primary?.year || recording.year || "",
      cover: getCoverForSong({ ...recording, primaryReleaseId: primary?.id }, { type: "library" }, releases),
      track: tracks.find((track) => track.releaseId === primary?.id)?.trackNumber || recording.track || null,
      disk: tracks.find((track) => track.releaseId === primary?.id)?.discNumber || recording.disk || null,
    };
  });
}
