/**
 * Helper to suggest and apply artist separation manually.
 * Reversible and safe: does NOT automatically mutate other metadata.
 */

export function suggestArtistSplit(input) {
  if (Array.isArray(input)) {
    if (input.length > 1) {
      return input
        .map((item) => (typeof item === "string" ? item : item?.name || ""))
        .filter(Boolean);
    }
    input = input[0];
  }
  const text = String(
    typeof input === "string" ? input : input?.name || "",
  ).trim();
  if (!text) return [];

  const separators = /\s*(?:&|\b(?:and|y|con|feat\.?|ft\.?|featuring)\b|,)\s*/i;
  const parts = text
    .split(separators)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [text];
}

export function separateArtists(currentEntity, newArtistNames) {
  const artists = (
    Array.isArray(newArtistNames) ? newArtistNames : [newArtistNames]
  )
    .map((name) => String(name || "").trim())
    .filter(Boolean);

  const displayArtist = artists.join(", ");
  const artistCredits = artists.map((name) => ({
    name,
    role: "main",
    joinphrase: "",
  }));

  return {
    ...currentEntity,
    artists,
    artistCredits,
    artist: displayArtist,
  };
}
