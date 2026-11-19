import type { Track } from "../types";
import { fetchNativeTracks, isNativeApp } from "./nativeSource";

const FORMAT_RANK: Record<string, number> = {
  mp3: 0,
  m4a: 1,
  aac: 2,
  ogg: 3,
  opus: 4,
  wav: 5,
  flac: 6,
  mp4: 7,
  mkv: 8,
  webm: 9,
};

const VERSION_RANK: Record<string, number> = {
  完整版: 0,
  正篇: 1,
  体验版: 2,
  试听版: 3,
};

/**
 * Pick one sensible playback entry per logical segment. The detail sheet can
 * still show every format/version variant; playback and whole-work caching use
 * this reduced list so a 1 GB WAV is not queued behind every MP3.
 */
export function selectPlaybackTracks(tracks: Track[]): Track[] {
  const groups = new Map<string, { track: Track; order: number }>();

  tracks.forEach((track, index) => {
    const key = track.groupKey || track.title;
    const current = groups.get(key);
    if (!current) {
      groups.set(key, { track, order: index });
      return;
    }
    const versionRank = VERSION_RANK[track.version || "正篇"] ?? 1;
    const currentVersionRank = VERSION_RANK[current.track.version || "正篇"] ?? 1;
    const formatRank = FORMAT_RANK[track.format || ""] ?? 50;
    const currentFormatRank = FORMAT_RANK[current.track.format || ""] ?? 50;
    const better =
      versionRank < currentVersionRank ||
      (versionRank === currentVersionRank && formatRank < currentFormatRank);
    if (better) groups.set(key, { track, order: current.order });
  });

  return [...groups.values()]
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.track);
}

/**
 * Track metadata is fetched lazily per work. The URLs point at the official
 * asmr.one stream/download endpoints; YORU never proxies the audio itself.
 */
export async function fetchTracksForWork(workId: string): Promise<Track[]> {
  if (isNativeApp()) return fetchNativeTracks(workId);

  const response = await fetch(`/api/tracks/${encodeURIComponent(workId)}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    let message = "无法获取完整音轨";
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload?.message) message = payload.message;
    } catch {
      /* The fallback message is enough. */
    }
    throw new Error(message);
  }
  const payload = (await response.json()) as { tracks?: Track[] };
  return Array.isArray(payload.tracks) ? payload.tracks : [];
}
