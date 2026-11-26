import { normalizeComparable } from "../models/musicEntities.js";

function releaseCoverValue(release) {
  const direct = release?.cover || release?.coverUrl;
  if (direct) return direct;

  const alternatives = release?.coverAlternatives || release?.artworks || [];
  return (
    alternatives
      .map((item) => (typeof item === "string" ? item : item?.url))
      .find(Boolean) || null
  );
}

function releaseDisplayScore(release) {
  return (
    Number(Boolean(releaseCoverValue(release))) * 100 +
    Number(release.source === "musicbrainz") * 20 +
    Number(Boolean(release.year)) * 5 +
    Number(release.trackCount || 0) * 0.01
  );
}

function mergeReleaseDisplayData(current, duplicate) {
  const primaryArtists = current.primaryArtists?.length
    ? current.primaryArtists
    : duplicate.primaryArtists?.length
      ? duplicate.primaryArtists
      : current.artists ||
        duplicate.artists ||
        current.artist ||
        duplicate.artist;
  const uniqueArtists = [
    ...new Map(
      (Array.isArray(primaryArtists) ? primaryArtists : [primaryArtists])
        .map((artist) =>
          typeof artist === "string" ? { name: artist } : artist,
        )
        .filter((artist) => artist?.name)
        .map((artist) => [
          artist.id
            ? `id:${artist.id}`
            : `name:${normalizeComparable(artist.name)}`,
          artist,
        ]),
    ).values(),
  ];

  return {
    ...current,
    primaryArtists: uniqueArtists,
    artists: uniqueArtists.map((artist) => artist.name),
    artist:
      uniqueArtists.map((artist) => artist.name).join(", ") ||
      current.artist ||
      duplicate.artist ||
      "",
    albumArtist: current.albumArtist || duplicate.albumArtist || "",
    relatedReleaseIds: [
      ...new Set(
        [
          ...(current.relatedReleaseIds || [current.id]),
          ...(duplicate.relatedReleaseIds || [duplicate.id]),
        ].filter(Boolean),
      ),
    ],
  };
}

export function uniqueReleaseCards(releaseList) {
  const grouped = new Map();

  for (const release of releaseList || []) {
    if (!release?.id) continue;

    const title = normalizeComparable(release.title || release.name);
    const type = release.type || "unknown";
    const key = title ? `${title}|${type}` : `id:${release.id}`;
    const previous = grouped.get(key);

    if (!previous) {
      grouped.set(
        key,
        mergeReleaseDisplayData(
          {...release, relatedReleaseIds: [...new Set(release.relatedReleaseIds || [release.id]), ]},
          {},
        ),
      );
      continue;
    }

    const preferred =
      releaseDisplayScore(release) > releaseDisplayScore(previous)
        ? release
        : previous;
    const other = preferred === release ? previous : release;
    grouped.set(key, mergeReleaseDisplayData(preferred, other));
  }

  return [...grouped.values()];
}

export function uniqueAlbumCards(albumList) {
  const grouped = new Map();

  for (const album of albumList || []) {
    if (!album) continue;
    const title = normalizeComparable(album.name || album.title);
    if (!title) continue;

    const previous = grouped.get(title);
    if (!previous) {grouped.set(title, mergeReleaseDisplayData(album, {})); continue;}

    const preferred =
      releaseDisplayScore(album) > releaseDisplayScore(previous)
        ? album
        : previous;
    const other = preferred === album ? previous : album;
    grouped.set(title, mergeReleaseDisplayData(preferred, other));
  }

  return [...grouped.values()];
}
