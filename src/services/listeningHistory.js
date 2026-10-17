export function appendListeningHistoryGroup(history, entry, timestamp, createId) {
  const records = Array.isArray(history) ? history : [];
  const itemId = String(entry.itemId || entry.id || "");
  const latest = records[0];
  const orderedTimestamp = Math.max(Number(timestamp) || 0, (Number(latest?.timestamp) || 0) + 1);

  if (
    entry.type === "song" &&
    latest?.type === "song" &&
    String(latest.itemId) === itemId
  ) {
    const updated = {
      ...latest,
      timestamp: orderedTimestamp,
      playCount: Math.max(1, Number(latest.playCount) || 1) + 1,
    };
    return [updated, ...records.slice(1)];
  }

  return [
    {
      ...entry,
      id: createId(),
      itemId,
      timestamp: orderedTimestamp,
      playCount: 1,
    },
    ...records,
  ];
}

export function formatPlayCount(playCount) {
  const count = Math.floor(Number(playCount) || 1);
  return count > 1 ? `×${count}` : "";
}
