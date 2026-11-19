import type { Track } from "../types";
import { fetchNativeTracks, isNativeApp } from "./nativeSource";

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
