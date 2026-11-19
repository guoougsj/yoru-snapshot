import { Capacitor, registerPlugin } from "@capacitor/core";
import type { Track } from "../types";

export interface CachedTrack {
  key: string;
  workId: string;
  trackId: string;
  title: string;
  /** Converted WebView URL for playback. */
  path: string;
  /** Absolute path inside the app's private files directory. */
  filePath?: string;
  size: number;
  cachedAt: string;
}

interface AudioCachePlugin {
  download(options: {
    url: string;
    workId: string;
    fileName: string;
    headers?: Record<string, string>;
  }): Promise<{ path: string; size: number }>;
  remove(options: { path: string }): Promise<void>;
  clear(): Promise<void>;
  exitApp(): Promise<void>;
  keepAwake(options: { enabled: boolean }): Promise<void>;
  addListener(
    eventName: "progress",
    listener: (event: {
      url: string;
      bytes: number;
      contentLength: number;
    }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

const AudioCache = registerPlugin<AudioCachePlugin>("AudioCache");
const INDEX_KEY = "yoru.track-cache-v1";

export function cacheKey(workId: string, trackId: string): string {
  return `${workId}::${trackId}`;
}

export function isCacheSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("AudioCache");
}

export async function exitApp(): Promise<void> {
  if (!isCacheSupported()) return;
  try {
    await AudioCache.exitApp();
  } catch {
    /* The system will close the app from the launcher if needed. */
  }
}

export async function keepScreenAwake(enabled: boolean): Promise<void> {
  if (!isCacheSupported()) return;
  try {
    await AudioCache.keepAwake({ enabled });
  } catch {
    /* Keeping the screen on is a comfort feature, not a hard requirement. */
  }
}

export function readCacheIndex(): Record<string, CachedTrack> {
  try {
    const raw = JSON.parse(localStorage.getItem(INDEX_KEY) ?? "{}") as Record<
      string,
      CachedTrack
    >;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function writeCacheIndex(index: Record<string, CachedTrack>) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    /* The downloaded file still exists; only the index is lost. */
  }
}

export function cachedSource(entry: CachedTrack): string {
  return entry.path.startsWith("http") ? entry.path : Capacitor.convertFileSrc(entry.path);
}

function safeName(value: string): string {
  return (
    value
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 90) || "track"
  );
}

function extensionOf(track: Track): string {
  if (track.format) return `.${track.format}`;
  const url = (track.downloadUrl || track.streamUrl).split("?")[0];
  const match = url.match(/\.([a-z0-9]{2,5})$/i);
  return match ? `.${match[1].toLowerCase()}` : ".mp3";
}

export async function cacheTrack(
  workId: string,
  track: Track,
  onProgress?: (ratio: number) => void,
): Promise<CachedTrack> {
  if (!isCacheSupported()) {
    throw new Error("离线缓存仅在 Android 客户端可用");
  }
  if (!track.downloadUrl) {
    throw new Error("这条音轨没有提供下载地址");
  }

  const key = cacheKey(workId, track.id);
  const existing = readCacheIndex()[key];
  if (existing) return existing;

  let listener: { remove: () => Promise<void> } | null = null;
  let result: { path: string; size: number };

  try {
    listener = await AudioCache.addListener("progress", (event) => {
      if (event.url !== track.downloadUrl) return;
      const total = event.contentLength > 0 ? event.contentLength : track.size || 0;
      if (total > 0) {
        onProgress?.(Math.min(0.99, event.bytes / total));
      }
    });

    result = await AudioCache.download({
      url: track.downloadUrl,
      workId,
      fileName: `${safeName(track.id)}${extensionOf(track)}`,
      headers: {
        Origin: "https://asmr.one",
        Referer: "https://asmr.one/",
      },
    });
  } finally {
    try {
      await listener?.remove();
    } catch {
      /* The download result matters more than listener cleanup. */
    }
  }

  const entry: CachedTrack = {
    key,
    workId,
    trackId: track.id,
    title: track.title,
    path: Capacitor.convertFileSrc(result.path),
    filePath: result.path,
    size: result.size || track.size,
    cachedAt: new Date().toISOString(),
  };
  writeCacheIndex({ ...readCacheIndex(), [key]: entry });
  onProgress?.(1);
  return entry;
}

export async function removeCachedTrack(entry: CachedTrack): Promise<void> {
  try {
    if (entry.filePath) await AudioCache.remove({ path: entry.filePath });
  } catch {
    /* The index should be cleared even if the file was already gone. */
  }
  const next = { ...readCacheIndex() };
  delete next[entry.key];
  writeCacheIndex(next);
}

export async function clearCache(): Promise<void> {
  try {
    await AudioCache.clear();
  } catch {
    /* Nothing was cached yet. */
  }
  writeCacheIndex({});
}
