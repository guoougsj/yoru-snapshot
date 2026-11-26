import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, RefreshCw, Shuffle, Sparkles } from "lucide-react";
import liveSeedRaw from "../data/live-seed.json";
import {
  ASMR_DAILY_NAME,
  fetchAsmrDailyLibrary,
  readActiveSourceId,
  readAsmrDailyCachedLibrary,
  readAsmrDailyToken,
  readAsmrDailyUser,
  saveActiveSourceId,
  type LibrarySourceId,
} from "./lib/asmrDaily";
import { fetchNativeLibrary, isNativeApp } from "./lib/nativeSource";
import { presetSnapshot, readDataSource } from "./lib/netSettings";
import { originalCoverUrl } from "./lib/covers";
import { fetchTracksForWork, selectPlaybackTracks } from "./lib/tracks";
import {
  cacheKey,
  cacheTrack,
  cachedSource,
  exitApp,
  isCacheSupported,
  keepScreenAwake,
  readCacheIndex,
  removeCachedTrack,
  type CachedTrack,
} from "./lib/audioCache";
import {
  addNativeListener,
  getNativeState,
  isBackgroundAudioSupported,
  nextNative,
  pauseNative,
  playNative,
  previousNative,
  seekNative,
  selectNative,
  setNativeRepeat,
  setNativeVolume,
  stopNative,
  type NativePlaybackState,
  type NativeTrack,
} from "./lib/backgroundAudio";
import type { LibraryData, Playlist, TagCategory, Toast, Track, Work } from "./types";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { Hero } from "./components/Hero";
import { PlaylistCard } from "./components/PlaylistCard";
import { WorkCard } from "./components/WorkCard";
import { PlayerBar } from "./components/PlayerBar";
import { AgeGate } from "./components/AgeGate";
import { Toasts } from "./components/Toasts";
import {
  activeCueIndex,
  buildDemoSubtitles,
  fetchSubtitleContent,
  parseSubtitleText,
  readSubtitleStore,
  subtitleKey,
  writeSubtitleStore,
  type StoredSubtitles,
} from "./lib/subtitles";

const QueueDrawer = lazy(() =>
  import("./components/QueueDrawer").then((module) => ({ default: module.QueueDrawer })),
);
const DetailSheet = lazy(() =>
  import("./components/DetailSheet").then((module) => ({ default: module.DetailSheet })),
);
const NowPlayingPage = lazy(() =>
  import("./components/NowPlayingPage").then((module) => ({
    default: module.NowPlayingPage,
  })),
);

const webSeed = liveSeedRaw as unknown as LibraryData;
const bundledNativeSeed = liveSeedRaw as unknown as LibraryData;

/**
 * Native builds start from data captured earlier, not a fresh request.
 * Mark it as a snapshot so the header never claims "实时" until a sync succeeds.
 */
function asSnapshot(data: LibraryData, note: string): LibraryData {
  return {
    ...data,
    source: { ...data.source, mode: "curated-snapshot", note },
  };
}

function readNativeSeed(): LibraryData {
  try {
    const stored = JSON.parse(
      localStorage.getItem("yoru.native-library") ?? "null",
    ) as LibraryData | null;
    const storedAt = Date.parse(stored?.source?.fetchedAt || "") || 0;
    const bundledAt = Date.parse(bundledNativeSeed.source?.fetchedAt || "") || 0;
    const useStored =
      Boolean(stored) &&
      Array.isArray(stored?.works) &&
      stored!.works.length >= 8 &&
      (stored!.works.length >= bundledNativeSeed.works.length || storedAt > bundledAt);
    if (useStored) {
      return asSnapshot(
        stored!,
        "上次成功同步的 asmr.one 作品缓存；启动后会尝试在线刷新。试听音频为 YORU 本地环境音。",
      );
    }
  } catch {
    /* Corrupt or unavailable storage falls back to the bundled live capture. */
  }
  return asSnapshot(
    bundledNativeSeed,
    "安装包内置的 asmr.one 作品快照（构建时实时抓取）；启动后会尝试在线刷新。完整音轨通过官方接口播放。",
  );
}

const initialDailySeed =
  readActiveSourceId() === "asmr-daily" ? readAsmrDailyCachedLibrary() : null;
const initialSourceId: LibrarySourceId = initialDailySeed ? "asmr-daily" : "asmr-one";
const seed = initialDailySeed ?? (isNativeApp() ? readNativeSeed() : webSeed);
const PAGE_SIZE = 20;

type View = "home" | "favorites";

function readFavorites(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem("yoru.favorites") ?? "[]");
    return Array.isArray(saved) ? saved.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

interface PlaybackState {
  currentId?: string;
  queueIds?: string[];
  volume?: number;
  repeat?: boolean;
  trackIndex?: number;
}

interface PlaybackScope {
  workId: string;
  tracks: Track[];
  label: string;
  singleWork: boolean;
}

function readPlaybackState(): PlaybackState {
  try {
    const raw = JSON.parse(
      localStorage.getItem("yoru.playback-v1") ?? "{}",
    ) as PlaybackState;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

const savedPlayback = readPlaybackState();

function initialVolume(value: unknown): number {
  const volume = Number(value);
  return Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0.7;
}

function App() {
  const [library, setLibrary] = useState<LibraryData>(seed);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("all");
  const [view, setView] = useState<View>("home");
  const [page, setPage] = useState(1);
  const [activeSourceId, setActiveSourceId] = useState<LibrarySourceId>(initialSourceId);
  const [asmrDailyToken, setAsmrDailyToken] = useState("");
  const [asmrDailyUser, setAsmrDailyUser] = useState("");
  const [asmrDailySessionReady, setAsmrDailySessionReady] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(readFavorites);
  const [currentId, setCurrentId] = useState(() => {
    const saved = savedPlayback.currentId;
    return saved && seed.works.some((work) => work.id === saved)
      ? saved
      : seed.works[0].id;
  });
  const [queueIds, setQueueIds] = useState<string[]>(() => {
    const saved = Array.isArray(savedPlayback.queueIds)
      ? savedPlayback.queueIds.filter((id) => seed.works.some((work) => work.id === id))
      : [];
    return saved.length ? saved : seed.playlists[0].workIds;
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => initialVolume(savedPlayback.volume));
  const [lastVolume, setLastVolume] = useState(() => {
    const value = initialVolume(savedPlayback.volume);
    return value > 0 ? value : 0.7;
  });
  const [repeat, setRepeat] = useState(() => Boolean(savedPlayback.repeat));
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [queueOpen, setQueueOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [demoSubtitlesEnabled, setDemoSubtitlesEnabled] = useState(false);
  const [subtitleStore, setSubtitleStore] = useState<Record<string, StoredSubtitles>>(
    () => readSubtitleStore(),
  );
  const [officialSubtitles, setOfficialSubtitles] = useState<
    Record<string, StoredSubtitles>
  >({});
  const officialSubtitleAttempts = useRef(new Set<string>());
  const [syncing, setSyncing] = useState(false);
  const [sourceRevision, setSourceRevision] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [workTracks, setWorkTracks] = useState<Record<string, Track[]>>({});
  const [trackLoading, setTrackLoading] = useState<Record<string, boolean>>({});
  const [trackErrors, setTrackErrors] = useState<Record<string, string>>({});
  const [trackIndex, setTrackIndex] = useState(0);
  const [playScope, setPlayScope] = useState<PlaybackScope | null>(null);
  const [fallbackPreview, setFallbackPreview] = useState(false);
  const [cacheIndex, setCacheIndex] = useState<Record<string, CachedTrack>>(() =>
    readCacheIndex(),
  );
  const [trackCacheProgress, setTrackCacheProgress] = useState<Record<string, number>>({});
  const [workCacheProgress, setWorkCacheProgress] = useState<
    Record<string, { done: number; total: number; title?: string }>
  >({});
  const [ageConfirmed, setAgeConfirmed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("yoru.age-ok") === "1";
    } catch {
      return false;
    }
  });

  const audioRef = useRef<HTMLAudioElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const asmrDailySessionRevision = useRef(0);
  const advanceRef = useRef<(direction: number) => void>(() => {});
  const toastId = useRef(0);
  const tracksRef = useRef<Record<string, Track[]>>({});
  const loadingRef = useRef(new Set<string>());
  const currentTracksRef = useRef<Track[]>([]);
  const playScopeRef = useRef<PlaybackScope | null>(null);
  const trackIndexRef = useRef(0);
  const pendingTrackIndexRef = useRef<number | null>(null);
  const initialTrackIndexRef = useRef<number | null>(
    Number.isInteger(savedPlayback.trackIndex) ? savedPlayback.trackIndex ?? 0 : null,
  );
  const currentTrackRef = useRef<Track | null>(null);
  const fallbackPreviewRef = useRef(false);
  const currentWorkRef = useRef<Work | null>(null);
  const wasOnlineRef = useRef(online);
  const repeatRef = useRef(repeat);
  repeatRef.current = repeat;

  tracksRef.current = workTracks;
  fallbackPreviewRef.current = fallbackPreview;

  useEffect(() => {
    let cancelled = false;
    const revision = asmrDailySessionRevision.current;
    void (async () => {
      try {
        const token = await readAsmrDailyToken();
        const user = token ? await readAsmrDailyUser() : "";
        if (cancelled || revision !== asmrDailySessionRevision.current) return;
        setAsmrDailyToken(token);
        setAsmrDailyUser(user);
      } finally {
        if (!cancelled && revision === asmrDailySessionRevision.current) {
          setAsmrDailySessionReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentWork = useMemo(
    () => library.works.find((work) => work.id === currentId) ?? library.works[0],
    [library.works, currentId],
  );

  const detailWork = useMemo(
    () => library.works.find((work) => work.id === detailId) ?? null,
    [library.works, detailId],
  );

  const favoritesSet = useMemo(() => new Set(favorites), [favorites]);

  const tagCategories = useMemo<TagCategory[]>(() => {
    if (library.tags?.length) return library.tags;
    const counts = new Map<string, number>();
    for (const work of library.works) {
      for (const tag of work.tags) counts.set(tag, (counts.get(tag) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh"))
      .slice(0, 18)
      .map(([label, count]) => ({ id: label, label, count }));
  }, [library]);

  const hasAdult = useMemo(
    () => library.hasAdult ?? library.works.some((work) => Boolean(work.ageRating)),
    [library],
  );

  const cacheCount = Object.keys(cacheIndex).length;
  const cacheSize = useMemo(
    () => Object.values(cacheIndex).reduce((sum, entry) => sum + (entry.size || 0), 0),
    [cacheIndex],
  );
  const fullTracks = workTracks[currentWork?.id ?? ""] ?? [];
  const recommendedTracks = useMemo(
    () => selectPlaybackTracks(fullTracks),
    [fullTracks],
  );
  const currentTracks =
    playScope?.workId === currentWork?.id ? playScope.tracks : recommendedTracks;
  const safeTrackIndex =
    currentTracks.length > 0
      ? Math.max(0, Math.min(trackIndex, currentTracks.length - 1))
      : 0;
  const currentTrack = currentTracks[safeTrackIndex] ?? null;
  const currentCache =
    currentWork && currentTrack
      ? cacheIndex[cacheKey(currentWork.id, currentTrack.id)]
      : undefined;
  const playbackSrc =
    !currentTrack || fallbackPreview
      ? currentWork?.audio ?? ""
      : currentCache
        ? cachedSource(currentCache)
        : currentTrack.streamUrl;
  const isPreview = !currentTrack || fallbackPreview;
  const nativePlayback =
    isBackgroundAudioSupported() && Boolean(currentTrack) && !fallbackPreview;
  const nativeTracks = useMemo<NativeTrack[]>(
    () =>
      currentTracks.map((track) => {
        const cached = cacheIndex[cacheKey(currentWork.id, track.id)];
        return {
          id: track.id,
          url: cached?.filePath ? `file://${cached.filePath}` : track.streamUrl,
          title: track.title,
          artist: currentWork.circle,
          album: currentWork.title,
          duration: track.duration,
        };
      }),
    [cacheIndex, currentTracks, currentWork.circle, currentWork.id, currentWork.title],
  );

  const currentSubtitleKey = currentTrack
    ? subtitleKey(currentWork.id, currentTrack.id)
    : "";
  const importedSubtitles = currentSubtitleKey
    ? subtitleStore[currentSubtitleKey]
    : undefined;
  const officialSubtitle = currentSubtitleKey
    ? officialSubtitles[currentSubtitleKey]
    : undefined;
  const subtitleSource = importedSubtitles ?? officialSubtitle;
  const subtitleDuration = duration > 0 ? duration : currentTrack?.duration || 20;
  const subtitleCues = useMemo(() => {
    if (subtitleSource) {
      return parseSubtitleText(subtitleSource.content, subtitleDuration);
    }
    if (!demoSubtitlesEnabled) return [];
    return buildDemoSubtitles(currentWork, currentTrack, subtitleDuration);
  }, [
    subtitleSource,
    demoSubtitlesEnabled,
    currentWork,
    currentTrack,
    subtitleDuration,
  ]);
  const activeSubtitleCue = useMemo(
    () => activeCueIndex(subtitleCues, currentTime),
    [subtitleCues, currentTime],
  );
  const subtitleLabel = importedSubtitles
    ? `已导入 · ${importedSubtitles.name}`
    : officialSubtitle
      ? `官方字幕 · ${(currentTrack?.subtitleFormat || "vtt").toUpperCase()}`
      : demoSubtitlesEnabled
        ? "演示字幕 · 非原作品台本"
        : "暂无字幕 · 可导入 SRT / LRC / TXT";
  const subtitleIsDemo = !subtitleSource && demoSubtitlesEnabled;

  useEffect(() => {
    setDemoSubtitlesEnabled(false);
  }, [currentWork.id]);

  currentWorkRef.current = currentWork;
  currentTrackRef.current = currentTrack;
  currentTracksRef.current = currentTracks;
  playScopeRef.current = playScope;
  trackIndexRef.current = safeTrackIndex;

  const pushToast = useCallback((message: string, tone: Toast["tone"] = "neutral") => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3600);
  }, []);

  const applyLibrary = useCallback((data: LibraryData) => {
    setLibrary(data);
    setCurrentId((previous) =>
      data.works.some((work) => work.id === previous) ? previous : data.works[0].id,
    );
    setQueueIds((previous) => {
      const valid = previous.filter((id) => data.works.some((work) => work.id === id));
      return valid.length
        ? valid
        : data.playlists[0]?.workIds ?? data.works.slice(0, 4).map((work) => work.id);
    });
    const sourceId: LibrarySourceId =
      data.source.name === ASMR_DAILY_NAME ? "asmr-daily" : "asmr-one";
    setActiveSourceId(sourceId);
    saveActiveSourceId(sourceId);
    try {
      localStorage.setItem(
        sourceId === "asmr-daily" ? "yoru.asmr-daily-library" : "yoru.native-library",
        JSON.stringify(data),
      );
    } catch {
      /* The in-memory library still works without persistent storage. */
    }
  }, []);

  const ensureTracks = useCallback(async (workId: string): Promise<Track[] | null> => {
    const existing = tracksRef.current[workId];
    if (existing) return existing;
    if (loadingRef.current.has(workId)) return null;

    loadingRef.current.add(workId);
    setTrackLoading((prev) => ({ ...prev, [workId]: true }));
    setTrackErrors((prev) => {
      const next = { ...prev };
      delete next[workId];
      return next;
    });

    try {
      const tracks = await fetchTracksForWork(workId);
      setWorkTracks((prev) => ({ ...prev, [workId]: tracks }));
      if (!tracks.length) {
        setTrackErrors((prev) => ({
          ...prev,
          [workId]: "官方接口没有返回可用音轨",
        }));
      }
      return tracks;
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法获取完整音轨";
      setTrackErrors((prev) => ({ ...prev, [workId]: message }));
      return null;
    } finally {
      loadingRef.current.delete(workId);
      setTrackLoading((prev) => ({ ...prev, [workId]: false }));
    }
  }, []);

  useEffect(() => {
    const pending = pendingTrackIndexRef.current;
    const restore = initialTrackIndexRef.current;
    pendingTrackIndexRef.current = null;
    initialTrackIndexRef.current = null;
    setPlayScope((previous) =>
      previous && previous.workId === currentWork?.id ? previous : null,
    );
    setTrackIndex(pending ?? restore ?? 0);
    setFallbackPreview(false);
    setCurrentTime(0);
    setDuration(0);
    if (currentWork) void ensureTracks(currentWork.id);
  }, [currentWork?.id, ensureTracks]);

  useEffect(() => {
    if (trackIndex <= currentTracks.length - 1) return;
    setTrackIndex(Math.max(0, currentTracks.length - 1));
  }, [currentTracks.length, trackIndex]);

  useEffect(() => {
    if (detailId) void ensureTracks(detailId);
  }, [detailId, ensureTracks]);

  useEffect(() => {
    if (!detailWork) return;
    const cover = originalCoverUrl(detailWork);
    if (!cover) return;
    const image = new Image();
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.src = cover;
    return () => {
      image.src = "";
    };
  }, [detailWork]);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    if (!online) {
      wasOnlineRef.current = false;
      return;
    }
    if (wasOnlineRef.current) return;
    wasOnlineRef.current = true;
    if (isNativeApp() && !syncing && library.source.mode !== "live") {
      void syncLibrary();
    }
  }, [online, syncing, library.source.mode]);

  // Keep retrying in the background while the bundled snapshot is shown.
  // Backoff starts at 30s and caps at 5 minutes; a successful sync stops it.
  useEffect(() => {
    if (!isNativeApp() || !online || library.source.mode === "live") return;
    if (activeSourceId !== "asmr-one") return;
    const sourceConfig = readDataSource();
    if (sourceConfig.preset === "bundled" || presetSnapshot(sourceConfig)) return;
    let cancelled = false;
    let attempt = 0;
    let timer = 0;
    const schedule = () => {
      const delay =
        Math.min(30_000 * 2 ** attempt, 5 * 60_000) + Math.floor(Math.random() * 8_000);
      timer = window.setTimeout(async () => {
        if (cancelled) return;
        attempt += 1;
        if (document.visibilityState === "visible") {
          await runSync(true);
        }
        if (!cancelled) schedule();
      }, delay);
    };
    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [online, library.source.mode, sourceRevision, activeSourceId]);

  useEffect(() => {
    try {
      localStorage.setItem(
        "yoru.playback-v1",
        JSON.stringify({ currentId, queueIds, volume, repeat, trackIndex }),
      );
    } catch {
      /* Playback still works without persistent preferences. */
    }
  }, [currentId, queueIds, volume, repeat, trackIndex]);

  useEffect(() => {
    const onBack = () => {
      if (nowPlayingOpen) {
        setNowPlayingOpen(false);
        return;
      }
      if (detailId) {
        setDetailId(null);
        return;
      }
      if (queueOpen) {
        setQueueOpen(false);
        return;
      }
      if (view !== "home") {
        goHome();
        return;
      }
      void exitApp();
    };
    window.addEventListener("yoru:back", onBack);
    return () => window.removeEventListener("yoru:back", onBack);
  }, [detailId, nowPlayingOpen, queueOpen, view]);

  useEffect(() => {
    if (!isNativeApp()) return;
    void keepScreenAwake(isPlaying);
    return () => {
      void keepScreenAwake(false);
    };
  }, [isPlaying]);

  useEffect(() => {
    if (!isBackgroundAudioSupported()) return;
    if (!nativePlayback || !isPlaying || !nativeTracks.length) return;
    void playNative({
      queueId: currentWork.id,
      tracks: nativeTracks,
      index: safeTrackIndex,
      repeat,
      volume,
    }).catch(() => undefined);
  }, [nativePlayback, isPlaying, currentWork.id, nativeTracks, safeTrackIndex]);

  useEffect(() => {
    if (!isBackgroundAudioSupported() || !nativePlayback || isPlaying) return;
    void pauseNative();
  }, [nativePlayback, isPlaying]);

  useEffect(() => {
    if (!isBackgroundAudioSupported() || nativePlayback) return;
    void stopNative();
  }, [nativePlayback]);

  useEffect(() => {
    if (nativePlayback) void setNativeVolume(volume);
  }, [nativePlayback, volume]);

  useEffect(() => {
    if (nativePlayback) void setNativeRepeat(repeat);
  }, [nativePlayback, repeat]);

  useEffect(() => {
    if (!isBackgroundAudioSupported()) return;
    let disposed = false;
    const subscriptions: Array<{ remove: () => Promise<void> }> = [];

    const listen = <T,>(
      event: "state" | "time" | "track" | "ended" | "error",
      handler: (data: T) => void,
    ) => {
      void addNativeListener<T>(event, handler).then((subscription) => {
        if (disposed) void subscription.remove();
        else subscriptions.push(subscription);
      });
    };

    listen<NativePlaybackState>("state", (state) => {
      if (!state?.active) return;
      setIsPlaying(Boolean(state.playing));
      if (Number.isFinite(state.position)) setCurrentTime(state.position);
      if (Number.isFinite(state.duration)) setDuration(state.duration);
      if (Number.isInteger(state.index) && state.index >= 0) setTrackIndex(state.index);
    });

    listen<{ position: number; duration: number }>("time", (time) => {
      if (Number.isFinite(time.position)) setCurrentTime(time.position);
      if (Number.isFinite(time.duration)) setDuration(time.duration);
    });

    listen<{ index: number; duration: number }>("track", (track) => {
      if (Number.isInteger(track.index) && track.index >= 0) setTrackIndex(track.index);
      if (Number.isFinite(track.duration)) setDuration(track.duration);
      setCurrentTime(0);
    });

    listen<{ index: number }>("ended", () => {
      setCurrentTime(0);
      if (!repeatRef.current) {
        setIsPlaying(false);
        if (!playScopeRef.current?.singleWork) advanceRef.current(1);
      }
    });

    listen<{ message: string }>("error", (event) => {
      setFallbackPreview(true);
      setIsPlaying(true);
      const work = currentWorkRef.current;
      if (work) {
        setTrackErrors((prev) => ({
          ...prev,
          [work.id]: event.message || "后台播放失败，已切换本地试听",
        }));
      }
      pushToast(event.message || "后台播放失败，已切换本地试听", "error");
    });

    return () => {
      disposed = true;
      for (const subscription of subscriptions) void subscription.remove();
    };
  }, [pushToast]);

  useEffect(() => {
    if (!isBackgroundAudioSupported()) return;
    const syncNativeState = () => {
      if (document.visibilityState !== "visible") return;
      void getNativeState().then((state) => {
        if (!state?.active) return;
        setIsPlaying(Boolean(state.playing));
        if (Number.isFinite(state.position)) setCurrentTime(state.position);
        if (Number.isFinite(state.duration)) setDuration(state.duration);
        if (Number.isInteger(state.index) && state.index >= 0) setTrackIndex(state.index);
      });
    };
    syncNativeState();
    document.addEventListener("visibilitychange", syncNativeState);
    return () => document.removeEventListener("visibilitychange", syncNativeState);
  }, []);

  useEffect(() => {
    const url = currentTrack?.subtitleUrl;
    if (!url || importedSubtitles) return;
    const key = currentSubtitleKey;
    if (!key || officialSubtitles[key] || officialSubtitleAttempts.current.has(key)) {
      return;
    }
    officialSubtitleAttempts.current.add(key);
    let cancelled = false;

    void fetchSubtitleContent(url)
      .then((content) => {
        if (cancelled) return;
        if (!parseSubtitleText(content, subtitleDuration).length) {
          throw new Error("官方字幕为空");
        }
        setOfficialSubtitles((prev) => ({
          ...prev,
          [key]: {
            name: `官方 ${currentTrack.subtitleFormat?.toUpperCase() || "字幕"}`,
            content,
            importedAt: new Date().toISOString(),
          },
        }));
      })
      .catch(() => {
        if (!cancelled) {
          pushToast("官方字幕加载失败，可导入字幕或查看演示", "neutral");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    currentTrack?.subtitleUrl,
    currentTrack?.subtitleFormat,
    currentSubtitleKey,
    importedSubtitles,
    officialSubtitles,
    subtitleDuration,
    pushToast,
  ]);

  useEffect(() => {
    if (activeTag !== "all" && !tagCategories.some((tag) => tag.id === activeTag)) {
      setActiveTag("all");
    }
  }, [activeTag, tagCategories]);

  const visibleWorks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return library.works.filter((work) => {
      if (view === "favorites" && !favoritesSet.has(work.id)) return false;
      if (activeTag !== "all" && !work.tags.includes(activeTag)) return false;
      if (!needle) return true;
      return [work.title, work.subtitle, work.circle, ...work.cvs, ...work.tags]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [library.works, query, activeTag, view, favoritesSet]);

  const totalPages = Math.max(1, Math.ceil(visibleWorks.length / PAGE_SIZE));
  const pageWorks = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return visibleWorks.slice(start, start + PAGE_SIZE);
  }, [visibleWorks, page]);

  const pageItems = useMemo<(number | "ellipsis")[]>(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }
    const selected = new Set<number>([1, totalPages, page - 1, page, page + 1]);
    if (page <= 3) [2, 3, 4].forEach((value) => selected.add(value));
    if (page >= totalPages - 2) {
      [totalPages - 1, totalPages - 2, totalPages - 3].forEach((value) =>
        selected.add(value),
      );
    }
    const sorted = [...selected]
      .filter((value) => value >= 1 && value <= totalPages)
      .sort((a, b) => a - b);
    const items: (number | "ellipsis")[] = [];
    sorted.forEach((value, index) => {
      if (index > 0 && value - sorted[index - 1] > 1) items.push("ellipsis");
      items.push(value);
    });
    return items;
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [query, activeTag, view, library.works]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const queueWorks = useMemo(
    () =>
      queueIds
        .map((id) => library.works.find((work) => work.id === id))
        .filter(Boolean) as Work[],
    [library.works, queueIds],
  );

  const advance = useCallback(
    (direction: number) => {
      if (!queueWorks.length) return;
      const index = queueWorks.findIndex((work) => work.id === currentId);
      const nextIndex =
        index < 0
          ? direction > 0
            ? 0
            : queueWorks.length - 1
          : (index + direction + queueWorks.length) % queueWorks.length;
      setCurrentId(queueWorks[nextIndex].id);
      setIsPlaying(true);
    },
    [currentId, queueWorks],
  );

  advanceRef.current = advance;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime || 0);
    const onMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    const onEnded = () => {
      if (audio.loop) {
        audio.currentTime = 0;
        void audio.play();
        return;
      }
      const tracks = currentTracksRef.current;
      const index = trackIndexRef.current;
      if (tracks.length && index < tracks.length - 1) {
        setTrackIndex(index + 1);
        setCurrentTime(0);
        return;
      }
      setCurrentTime(0);
      if (playScopeRef.current?.singleWork) {
        setIsPlaying(false);
        return;
      }
      advanceRef.current(1);
    };
    const onError = () => {
      const track = currentTrackRef.current;
      if (track && !fallbackPreviewRef.current) {
        fallbackPreviewRef.current = true;
        setFallbackPreview(true);
        const work = currentWorkRef.current;
        if (work) {
          setTrackErrors((prev) => ({
            ...prev,
            [work.id]: "完整音轨加载失败，已切换本地试听",
          }));
        }
        setIsPlaying(true);
        pushToast("完整音轨加载失败，已切换本地试听", "error");
        return;
      }
      setIsPlaying(false);
      pushToast("音频加载失败，请重新选择作品", "error");
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMetadata);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMetadata);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [pushToast]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentWork || !playbackSrc) return;
    if (nativePlayback) {
      audio.pause();
      return;
    }
    const nextSrc = new URL(playbackSrc, window.location.origin).href;
    if (audio.src !== nextSrc) {
      audio.src = playbackSrc;
      audio.load();
      setCurrentTime(0);
      setDuration(0);
    }
    audio.volume = volume;
    audio.loop = repeat;
    if (isPlaying) {
      void audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }, [playbackSrc, currentWork, isPlaying, repeat, volume, nativePlayback]);

  useEffect(() => {
    try {
      localStorage.setItem("yoru.favorites", JSON.stringify(favorites));
    } catch {
      /* localStorage can be unavailable in private windows */
    }
  }, [favorites]);

  useEffect(() => {
    if (!asmrDailySessionReady) return;
    let cancelled = false;
    const load = async () => {
      if (isNativeApp() && (typeof navigator === "undefined" || navigator.onLine)) {
        setSyncing(true);
      }
      try {
        let data: LibraryData;
        if (isNativeApp()) {
          if (activeSourceId === "asmr-daily") {
            const token = await readAsmrDailyToken();
            if (!token) throw new Error("ASMR Daily Token 未配置");
            data = await fetchAsmrDailyLibrary(token);
          } else {
            data = await fetchNativeLibrary(60_000);
          }
        } else if (activeSourceId === "asmr-daily") {
          const token = await readAsmrDailyToken();
          if (!token) throw new Error("ASMR Daily Token 未配置");
          data = await fetchAsmrDailyLibrary(token);
        } else {
          const response = await fetch("/api/works");
          if (!response.ok) throw new Error("offline");
          data = (await response.json()) as LibraryData;
        }
        if (cancelled || !Array.isArray(data?.works) || data.works.length === 0) return;
        applyLibrary(data);
      } catch {
        /* The bundled snapshot keeps the room open when the API is offline. */
        if (isNativeApp()) {
          setLibrary((previous) =>
            previous.source.mode === "live"
              ? asSnapshot(
                  previous,
                  "本次在线同步失败，继续展示本地缓存的作品数据；可点击同步按钮重试。",
                )
              : previous,
          );
        }
      } finally {
        if (isNativeApp()) setSyncing(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [applyLibrary, asmrDailySessionReady]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setQueueOpen(false);
        setDetailId(null);
        setNowPlayingOpen(false);
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function startWork(work: Work, contextWorks: Work[] = library.works) {
    if (work.id === currentId) {
      setIsPlaying((playing) => !playing);
      return;
    }
    if (contextWorks.length) setQueueIds(contextWorks.map((item) => item.id));
    setPlayScope(null);
    pendingTrackIndexRef.current = 0;
    setTrackIndex(0);
    setFallbackPreview(false);
    setCurrentId(work.id);
    setCurrentTime(0);
    setIsPlaying(true);
  }

  function playTrackList(
    work: Work,
    tracks: Track[],
    startIndex: number,
    label: string,
    singleWork = true,
  ) {
    const list = tracks.length
      ? tracks
      : selectPlaybackTracks(tracksRef.current[work.id] ?? []);
    if (!list.length) {
      startWork(work);
      return;
    }

    const index = Math.max(0, Math.min(startIndex, list.length - 1));
    const sameWork = work.id === currentId;
    const sameList =
      sameWork &&
      currentTracks.length === list.length &&
      currentTracks.every((track, position) => track.id === list[position]?.id);

    if (!sameWork) pendingTrackIndexRef.current = index;
    setPlayScope({ workId: work.id, tracks: list, label, singleWork });
    setTrackIndex(index);
    setFallbackPreview(false);
    setCurrentTime(0);
    if (!sameWork) {
      setCurrentId(work.id);
    } else if (sameList && isBackgroundAudioSupported()) {
      void selectNative(index);
    }
    setIsPlaying(true);
  }

  function seekToTime(value: number) {
    if (nativePlayback) {
      void seekNative(value);
    } else if (audioRef.current) {
      audioRef.current.currentTime = value;
    }
    setCurrentTime(value);
  }

  function playNextTrack() {
    if (!currentTracks.length) return;
    if (safeTrackIndex < currentTracks.length - 1) {
      if (nativePlayback) {
        void nextNative();
      } else {
        setTrackIndex(safeTrackIndex + 1);
        setCurrentTime(0);
        setIsPlaying(true);
      }
      return;
    }
    if (playScopeRef.current?.singleWork) {
      setIsPlaying(false);
      setCurrentTime(0);
      return;
    }
    advance(1);
  }

  function playPrevTrack() {
    if (currentTracks.length && safeTrackIndex > 0) {
      if (nativePlayback) {
        void previousNative();
      } else {
        setTrackIndex(safeTrackIndex - 1);
        setCurrentTime(0);
        setIsPlaying(true);
      }
      return;
    }
    if (playScopeRef.current?.singleWork) {
      seekToTime(0);
      return;
    }
    advance(-1);
  }

  function playPlaylist(playlist: Playlist) {
    const first = playlist.workIds.find((id) => library.works.some((work) => work.id === id));
    if (!first) return;
    setQueueIds(playlist.workIds);
    setPlayScope(null);
    pendingTrackIndexRef.current = 0;
    setTrackIndex(0);
    setFallbackPreview(false);
    setCurrentId(first);
    setCurrentTime(0);
    setIsPlaying(true);
    setView("home");
    pushToast(`正在播放「${playlist.title}」`, "success");
  }

  function playRandom() {
    if (!visibleWorks.length) return;
    const shuffled = [...visibleWorks].sort(() => Math.random() - 0.5);
    setQueueIds(shuffled.map((work) => work.id));
    setPlayScope(null);
    pendingTrackIndexRef.current = 0;
    setTrackIndex(0);
    setFallbackPreview(false);
    setCurrentId(shuffled[0].id);
    setCurrentTime(0);
    setIsPlaying(true);
    pushToast("已打乱今晚的作品顺序", "success");
  }

  function toggleFavorite(id: string) {
    const isFavorite = favoritesSet.has(id);
    setFavorites((prev) =>
      isFavorite ? prev.filter((item) => item !== id) : [...prev, id],
    );
    pushToast(isFavorite ? "已从收藏中移除" : "已收藏到你的夜间书架", isFavorite ? "neutral" : "success");
  }

  function confirmAdult() {
    try {
      localStorage.setItem("yoru.age-ok", "1");
    } catch {
      /* The in-memory choice still applies for this session. */
    }
    setAgeConfirmed(true);
  }

  async function handleImportSubtitles(file: File) {
    if (!currentTrack) {
      pushToast("先播放一段音轨再导入字幕", "neutral");
      return;
    }
    if (file.size > 512 * 1024) {
      pushToast("字幕文件太大（上限 512 KB）", "error");
      return;
    }
    const workId = currentWork.id;
    const trackId = currentTrack.id;
    try {
      const content = await file.text();
      const cues = parseSubtitleText(content, subtitleDuration);
      if (!cues.length) throw new Error("没有解析到字幕内容");
      const key = subtitleKey(workId, trackId);
      const next: Record<string, StoredSubtitles> = {
        ...subtitleStore,
        [key]: {
          name: file.name,
          content,
          importedAt: new Date().toISOString(),
        },
      };
      setSubtitleStore(next);
      writeSubtitleStore(next);
      setDemoSubtitlesEnabled(false);
      pushToast(`已导入字幕 · ${file.name}`, "success");
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "字幕导入失败", "error");
    }
  }

  function handleClearSubtitles() {
    if (!currentSubtitleKey) return;
    const next = { ...subtitleStore };
    delete next[currentSubtitleKey];
    setSubtitleStore(next);
    writeSubtitleStore(next);
    pushToast(officialSubtitle ? "已恢复官方字幕" : "已清除字幕", "neutral");
  }

  function handleShowDemoSubtitles() {
    setDemoSubtitlesEnabled(true);
    pushToast("已显示演示字幕 · 非原作品台本", "neutral");
  }

  function handleHideDemoSubtitles() {
    setDemoSubtitlesEnabled(false);
  }

  async function handleCacheTrack(work: Work, track: Track) {
    if (!isCacheSupported()) {
      pushToast("离线缓存目前仅在 Android 客户端可用", "neutral");
      return;
    }
    const key = cacheKey(work.id, track.id);
    if (readCacheIndex()[key]) {
      pushToast("这条音轨已经缓存过了", "neutral");
      return;
    }
    setTrackCacheProgress((prev) => ({ ...prev, [key]: 0 }));
    try {
      await cacheTrack(work.id, track, (ratio) => {
        setTrackCacheProgress((prev) => ({ ...prev, [key]: ratio }));
      });
      setCacheIndex(readCacheIndex());
      pushToast(`已缓存 · ${track.title}`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "缓存失败";
      pushToast(message, "error");
    } finally {
      setTrackCacheProgress((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  async function handleCacheWork(work: Work) {
    if (!isCacheSupported()) {
      pushToast("离线缓存目前仅在 Android 客户端可用", "neutral");
      return;
    }
    if (workCacheProgress[work.id]) return;

    const allTracks = await ensureTracks(work.id);
    const tracks = allTracks ? selectPlaybackTracks(allTracks) : null;
    if (!tracks?.length) {
      pushToast("没有可缓存的官方音轨，先试试播放或稍后重试", "neutral");
      return;
    }

    const totalSize = tracks.reduce((sum, track) => sum + (track.size || 0), 0);
    if (
      totalSize > 200 * 1048576 &&
      !window.confirm(
        `将缓存 ${tracks.length} 段音轨，约 ${(totalSize / 1048576).toFixed(0)} MB。继续吗？`,
      )
    ) {
      return;
    }

    setWorkCacheProgress((prev) => ({
      ...prev,
      [work.id]: { done: 0, total: tracks.length, title: tracks[0]?.title },
    }));

    let done = 0;
    let failures = 0;

    for (const track of tracks) {
      const key = cacheKey(work.id, track.id);
      if (!readCacheIndex()[key]) {
        setTrackCacheProgress((prev) => ({ ...prev, [key]: 0 }));
        try {
          await cacheTrack(work.id, track, (ratio) => {
            setTrackCacheProgress((prev) => ({ ...prev, [key]: ratio }));
          });
          setCacheIndex(readCacheIndex());
        } catch {
          failures += 1;
        } finally {
          setTrackCacheProgress((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }
      }
      done += 1;
      setWorkCacheProgress((prev) =>
        prev[work.id]
          ? { ...prev, [work.id]: { ...prev[work.id], done } }
          : prev,
      );
    }

    setWorkCacheProgress((prev) => {
      const next = { ...prev };
      delete next[work.id];
      return next;
    });
    pushToast(
      failures
        ? `已缓存 ${tracks.length - failures}/${tracks.length} 段，${failures} 段失败`
        : `已缓存《${work.title}》全部 ${tracks.length} 段音轨`,
      failures ? "error" : "success",
    );
  }

  async function retryTracks(work: Work) {
    delete tracksRef.current[work.id];
    setWorkTracks((prev) => {
      const next = { ...prev };
      delete next[work.id];
      return next;
    });
    setTrackErrors((prev) => {
      const next = { ...prev };
      delete next[work.id];
      return next;
    });
    await ensureTracks(work.id);
  }

  async function handleClearAllCache() {
    const entries = Object.values(readCacheIndex());
    if (!entries.length) {
      pushToast("还没有离线缓存", "neutral");
      return;
    }
    if (!window.confirm(`清除 ${entries.length} 段离线缓存？`)) return;
    for (const entry of entries) {
      await removeCachedTrack(entry);
    }
    setCacheIndex(readCacheIndex());
    pushToast(`已清除 ${entries.length} 段离线缓存`, "success");
  }

  async function handleRemoveCache(work: Work) {
    const entries = Object.values(readCacheIndex()).filter(
      (entry) => entry.workId === work.id,
    );
    for (const entry of entries) {
      await removeCachedTrack(entry);
    }
    setCacheIndex(readCacheIndex());
    pushToast(`已清除《${work.title}》的离线缓存`, "success");
  }

  async function runSync(silent: boolean) {
    if (syncing) return;
    if (isNativeApp() && typeof navigator !== "undefined" && !navigator.onLine) {
      if (!silent) pushToast("当前处于离线状态，联网后再同步", "neutral");
      return;
    }
    setSyncing(true);
    try {
      if (activeSourceId === "asmr-daily") {
        const token = await readAsmrDailyToken();
        if (!token) {
          throw new Error("请先在头像 → ASMR Daily 登录或保存 Token");
        }
        const dailyData = await fetchAsmrDailyLibrary(token);
        applyLibrary(dailyData);
        if (!silent) {
          pushToast(`已同步 ${dailyData.works.length} 个作品 · ASMR Daily`, "success");
        }
        return;
      }
      if (isNativeApp()) {
        const preset = readDataSource().preset;
        const nativeData = await fetchNativeLibrary(60_000);
        applyLibrary(nativeData);
        if (!silent) {
          pushToast(
            preset === "bundled"
              ? `已载入内置快照 · ${nativeData.works.length} 个作品`
              : `已同步 ${nativeData.works.length} 个作品 · asmr.one`,
            "success",
          );
        }
        return;
      }
      const response = await fetch("/api/sync", { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.message || "同步失败");
      }
      const refreshed = await fetch("/api/works");
      if (refreshed.ok) {
        const data: LibraryData = await refreshed.json();
        applyLibrary(data);
      }
      if (!silent) pushToast(`已同步 ${result.count ?? 0} 个作品 · asmr.one`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "同步失败";
      if (!silent) {
        if (isNativeApp()) {
          setLibrary((previous) =>
            previous.source.mode === "live"
              ? asSnapshot(previous, `${message}；继续展示本地缓存的作品数据。`)
              : previous,
          );
        }
        pushToast(`${message}；继续使用现有作品数据`, "error");
      }
    } finally {
      setSyncing(false);
    }
  }

  async function syncLibrary() {
    await runSync(false);
  }

  function handleSourceChanged() {
    setSourceRevision((value) => value + 1);
    if (isNativeApp() && online) {
      pushToast("数据源已更新，正在尝试同步", "neutral");
      void syncLibrary();
    }
  }

  async function switchSource(id: LibrarySourceId) {
    if (id === activeSourceId) return;
    if (id === "asmr-one") {
      applyLibrary(isNativeApp() ? readNativeSeed() : webSeed);
      pushToast("已切换到 asmr.one 作品源", "success");
      return;
    }

    const token = await readAsmrDailyToken();
    const cached = readAsmrDailyCachedLibrary();
    if (!token) {
      if (cached) {
        applyLibrary(cached);
        pushToast("已切换到 ASMR Daily 缓存 · 配置 Token 后可刷新", "neutral");
      } else {
        pushToast("请先在头像 → ASMR Daily 登录或保存 Token", "neutral");
      }
      return;
    }
    setAsmrDailyToken(token);
    if (cached) applyLibrary(cached);
    setSyncing(true);
    try {
      const data = await fetchAsmrDailyLibrary(token);
      applyLibrary(data);
      pushToast(`已切换到 ASMR Daily · ${data.works.length} 个作品`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "ASMR Daily 加载失败";
      if (cached) {
        pushToast(`${message}；继续使用 ASMR Daily 缓存`, "neutral");
      } else {
        pushToast(`${message}；请检查 Token`, "error");
      }
    } finally {
      setSyncing(false);
    }
  }

  async function handleAsmrDailySessionChanged() {
    const revision = ++asmrDailySessionRevision.current;
    const token = await readAsmrDailyToken();
    const user = token ? await readAsmrDailyUser() : "";
    if (revision !== asmrDailySessionRevision.current) return;
    setAsmrDailyToken(token);
    setAsmrDailyUser(user);
    setAsmrDailySessionReady(true);
    if (!token) {
      if (activeSourceId === "asmr-daily") void switchSource("asmr-one");
      return;
    }
    if (activeSourceId === "asmr-daily") {
      void syncLibrary();
    } else {
      void switchSource("asmr-daily");
    }
  }

  function goToPage(next: number) {
    const clamped = Math.max(1, Math.min(totalPages, next));
    if (clamped === page) return;
    setPage(clamped);
    window.setTimeout(scrollToCollection, 0);
  }

  function scrollToCollection() {
    document.getElementById("collection")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function goHome() {
    setView("home");
    setActiveTag("all");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goFavorites() {
    setView("favorites");
    setActiveTag("all");
    setQuery("");
    scrollToCollection();
  }

  const bundledSnapshot = library.source.transport === "bundled";
  const sectionTitle =
    view === "favorites" ? "我的收藏" : query.trim() ? "搜索结果" : "今晚的声音";
  const sectionKicker =
    view === "favorites" ? "YOUR NIGHT SHELF" : query.trim() ? "SEARCH RESULTS" : "THE COLLECTION";

  return (
    <div className="app-shell">
      <Sidebar
        playlists={library.playlists}
        source={library.source}
        activeView={view}
        favoritesCount={favorites.length}
        syncing={syncing}
        onHome={goHome}
        onExplore={scrollToCollection}
        onFavorites={goFavorites}
        onRecent={() => setQueueOpen(true)}
        onPlaylist={playPlaylist}
        onSync={syncLibrary}
        activeSourceId={activeSourceId}
        dailyConfigured={Boolean(asmrDailyToken)}
        onAsmrOne={() => void switchSource("asmr-one")}
        onAsmrDaily={() => void switchSource("asmr-daily")}
      />

      <main className="main">
        <TopBar
          query={query}
          onQuery={setQuery}
          source={library.source}
          library={library}
          syncing={syncing}
          searchRef={searchRef}
          onSync={syncLibrary}
          favoritesCount={favorites.length}
          queueCount={currentTracks.length}
          cacheCount={cacheCount}
          cacheSize={cacheSize}
          onFavorites={goFavorites}
          onQueue={() => setQueueOpen(true)}
          onExpand={() => setNowPlayingOpen(true)}
          onClearCache={handleClearAllCache}
          onSourceChanged={handleSourceChanged}
          activeSourceId={activeSourceId}
          asmrDailyToken={asmrDailyToken}
          asmrDailyUser={asmrDailyUser}
          asmrDailySessionReady={asmrDailySessionReady}
          onSwitchSource={(id) => void switchSource(id)}
          onAsmrDailySessionChanged={handleAsmrDailySessionChanged}
        />

        <div className="page">
          {!online && (
            <div className="source-banner offline-banner" role="status">
              <span className="source-banner-dot" aria-hidden="true" />
              <p>
                <strong>当前处于离线状态</strong>
                <span className="source-banner-detail">
                  正在使用本地缓存；联网后会自动重试同步
                </span>
              </p>
            </div>
          )}

          {library.source.mode !== "live" && online && (
            <div className="source-banner" role="status">
              <span className="source-banner-dot" aria-hidden="true" />
              <p>
                <strong>
                  {syncing
                    ? `正在连接 ${library.source.name}`
                    : bundledSnapshot
                      ? "内置快照模式"
                      : `${library.source.name} 实时接口暂不可达`}
                </strong>
                <span className="source-banner-detail">
                  {syncing
                    ? "后台刷新中，当前展示"
                    : bundledSnapshot
                      ? "完全离线，共"
                      : "正在展示"}{" "}
                  {library.works.length} 件本地作品快照
                </span>
                <span className="source-banner-note">
                  {bundledSnapshot
                    ? "要联网更新，请在头像 → 网络与数据源切换到自动选择 / 内置中继"
                    : library.source.name === ASMR_DAILY_NAME
                      ? "请在头像 → ASMR Daily 账号中登录或保存 Token；当前显示本地缓存"
                      : "可在头像 → 网络与数据源中切换中继或快照；封面来自原站或 YORU 生成"}
                </span>
              </p>
              <a href={library.source.url} target="_blank" rel="noreferrer">
                打开源站
                <ExternalLink size={11} strokeWidth={1.8} />
              </a>
              {!bundledSnapshot && (
                <button onClick={syncLibrary} disabled={syncing}>
                  <RefreshCw size={11} strokeWidth={1.8} />
                  {syncing ? "抓取中" : "重试抓取"}
                </button>
              )}
            </div>
          )}

          <Hero
            playlist={library.playlists[0]}
            works={library.works}
            onPlay={playPlaylist}
            onExplore={scrollToCollection}
          />

          <section className="section playlists-section" id="playlists">
            <div className="section-head">
              <div>
                <span className="section-kicker">
                  <Sparkles size={11} />
                  CURATED FOR THE NIGHT
                </span>
                <h2>场景歌单</h2>
              </div>
              <p className="section-note">
                四种夜晚的打开方式
                <span>—</span>
                <strong>{library.playlists.length}</strong> 张策展歌单
              </p>
            </div>
            <div className="playlist-grid">
              {library.playlists.map((playlist, index) => (
                <PlaylistCard
                  key={playlist.id}
                  playlist={playlist}
                  index={index}
                  works={library.works}
                  onPlay={playPlaylist}
                />
              ))}
            </div>
          </section>

          <section className="section collection-section" id="collection">
            <div className="section-head collection-head">
              <div>
                <span className="section-kicker">{sectionKicker}</span>
                <h2>{sectionTitle}</h2>
              </div>
              <div className="collection-stats">
                <span>
                  <strong>{String(visibleWorks.length).padStart(2, "0")}</strong>
                  件作品
                </span>
                <button className="shuffle-button" onClick={playRandom} disabled={!visibleWorks.length}>
                  <Shuffle size={14} />
                  随机播放
                </button>
              </div>
            </div>

            <div className="filter-row">
              <div
                className="mood-tabs tag-tabs"
                role="tablist"
                aria-label={`按 ${library.source.name} 标签筛选`}
              >
                <button
                  role="tab"
                  aria-selected={activeTag === "all"}
                  className={activeTag === "all" ? "active" : ""}
                  onClick={() => {
                    setActiveTag("all");
                    setView("home");
                  }}
                >
                  <span>全部</span>
                  <small>ALL</small>
                </button>
                {tagCategories.slice(0, 14).map((tag) => (
                  <button
                    key={tag.id}
                    role="tab"
                    aria-selected={activeTag === tag.id}
                    className={activeTag === tag.id ? "active" : ""}
                    onClick={() => {
                      setActiveTag(tag.id);
                      setView("home");
                    }}
                  >
                    <span>{tag.label}</span>
                    <small>{tag.count}</small>
                  </button>
                ))}
              </div>
              <div className="filter-meta">
                <p className="filter-hint">
                  {view === "favorites"
                    ? "只显示你收藏的声音"
                    : query.trim()
                      ? `“${query.trim()}” 的结果`
                      : `来自 ${library.source.name} · ${tagCategories.length} 个标签`}
                  {visibleWorks.length > 0
                    ? ` · 第 ${page} / ${totalPages} 页`
                    : ""}
                </p>
              </div>
            </div>

            {visibleWorks.length > 0 ? (
              <>
                <div className="works-grid">
                  {pageWorks.map((work, index) => (
                    <WorkCard
                      key={work.id}
                      work={work}
                      index={index}
                      active={work.id === currentId}
                      playing={work.id === currentId && isPlaying}
                      favorite={favoritesSet.has(work.id)}
                      onPlay={(item) => startWork(item, visibleWorks)}
                      onOpen={(item) => setDetailId(item.id)}
                      onFavorite={toggleFavorite}
                    />
                  ))}
                </div>
                {totalPages > 1 && (
                  <nav className="pagination" aria-label="作品分页">
                    <button
                      className="page-step"
                      onClick={() => goToPage(page - 1)}
                      disabled={page === 1}
                    >
                      上一页
                    </button>
                    <div className="page-numbers">
                      {pageItems.map((item, index) =>
                        item === "ellipsis" ? (
                          <span className="page-ellipsis" key={`ellipsis-${index}`}>
                            …
                          </span>
                        ) : (
                          <button
                            key={item}
                            className={item === page ? "is-active" : ""}
                            aria-current={item === page ? "page" : undefined}
                            onClick={() => goToPage(item)}
                          >
                            {item}
                          </button>
                        ),
                      )}
                    </div>
                    <button
                      className="page-step"
                      onClick={() => goToPage(page + 1)}
                      disabled={page === totalPages}
                    >
                      下一页
                    </button>
                  </nav>
                )}
              </>
            ) : (
              <div className="empty-state">
                <span className="empty-mark">夜</span>
                <h3>{view === "favorites" ? "书架还是空的" : "没有找到这段声音"}</h3>
                <p>
                  {view === "favorites"
                    ? "点一下作品封面上的心形，把喜欢的夜晚留在这里。"
                    : "换一个关键词，或者从全部作品里重新挑一段。"}
                </p>
                <button
                  onClick={() => {
                    setQuery("");
                    setView("home");
                    setActiveTag("all");
                  }}
                >
                  浏览全部作品
                </button>
              </div>
            )}
          </section>

          <footer className="page-footer">
            <div className="footer-brand">
              <span className="footer-glyph">夜</span>
              <div>
                <strong>YORU · 夜音</strong>
                <p>把夜晚留给耳朵。一个为 ASMR 作品而做的安静播放器。</p>
              </div>
            </div>
            <div className="footer-source">
              <span className="footer-live">
                <i />
                数据源
              </span>
              <a href={library.source.url} target="_blank" rel="noreferrer">
                {library.source.name}
              </a>
              <p>作品版权归原作者与社团所有。完整音轨来自官方接口；离线缓存仅限个人收听。</p>
            </div>
          </footer>
        </div>
      </main>

      <PlayerBar
        work={currentWork}
        track={currentTrack}
        trackIndex={safeTrackIndex}
        trackCount={currentTracks.length}
        isPreview={isPreview}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration || (isPreview ? 20 : 0)}
        volume={volume}
        repeat={repeat}
        favorite={favoritesSet.has(currentWork.id)}
        queueCount={currentTracks.length}
        queueOpen={queueOpen}
        onToggle={() => {
          const end = duration || (isPreview ? 20 : 0);
          if (currentTime >= end - 0.1) {
            if (nativePlayback) void seekNative(0);
            else if (audioRef.current) audioRef.current.currentTime = 0;
          }
          setIsPlaying((playing) => !playing);
        }}
        onNext={playNextTrack}
        onPrev={playPrevTrack}
        onSeek={seekToTime}
        onVolume={(value) => {
          setVolume(value);
          if (value > 0) setLastVolume(value);
        }}
        onToggleMute={() => {
          if (volume > 0) {
            setLastVolume(volume);
            setVolume(0);
          } else {
            setVolume(lastVolume || 0.7);
          }
        }}
        onToggleRepeat={() => setRepeat((value) => !value)}
        onQueue={() => setQueueOpen((open) => !open)}
        onFavorite={() => toggleFavorite(currentWork.id)}
        onExpand={() => setNowPlayingOpen(true)}
      />

      {nowPlayingOpen && (
        <Suspense fallback={null}>
          <NowPlayingPage
            open={nowPlayingOpen}
            work={currentWork}
            track={currentTrack}
            trackIndex={safeTrackIndex}
            trackCount={currentTracks.length}
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration || (isPreview ? 20 : 0)}
            volume={volume}
            repeat={repeat}
            favorite={favoritesSet.has(currentWork.id)}
            cues={subtitleCues}
            activeCue={activeSubtitleCue}
            subtitleLabel={subtitleLabel}
            subtitleIsDemo={subtitleIsDemo}
            subtitleCanClear={Boolean(importedSubtitles)}
            onClose={() => setNowPlayingOpen(false)}
            onToggle={() => setIsPlaying((playing) => !playing)}
            onNext={playNextTrack}
            onPrev={playPrevTrack}
            onSeek={seekToTime}
            onVolume={(value) => {
              setVolume(value);
              if (value > 0) setLastVolume(value);
            }}
            onToggleRepeat={() => setRepeat((value) => !value)}
            onFavorite={() => toggleFavorite(currentWork.id)}
            onImportSubtitles={handleImportSubtitles}
            onClearSubtitles={handleClearSubtitles}
            onUseDemo={handleShowDemoSubtitles}
            onHideDemo={handleHideDemoSubtitles}
          />
        </Suspense>
      )}

      {queueOpen && (
        <Suspense fallback={null}>
          <QueueDrawer
            open={queueOpen}
            current={currentWork}
            tracks={currentTracks}
            currentIndex={safeTrackIndex}
            label={playScope?.label ?? "推荐音轨"}
            isPlaying={isPlaying}
            onClose={() => setQueueOpen(false)}
            onPlayTrack={(index) => {
              playTrackList(
                currentWork,
                currentTracks,
                index,
                playScope?.label ?? "推荐音轨",
                playScope?.singleWork ?? false,
              );
            }}
            onToggle={() => setIsPlaying((playing) => !playing)}
          />
        </Suspense>
      )}

      {detailWork && (
        <Suspense fallback={null}>
          <DetailSheet
            work={detailWork}
            favorite={favoritesSet.has(detailWork.id)}
            isActive={detailWork.id === currentId}
            isPlaying={detailWork.id === currentId && isPlaying}
            tracks={workTracks[detailWork.id]}
            tracksLoading={Boolean(trackLoading[detailWork.id])}
            trackError={trackErrors[detailWork.id]}
            currentTrackId={detailWork.id === currentId ? currentTrack?.id : undefined}
            playlistLabel={detailWork.id === currentId ? playScope?.label : undefined}
            cacheIndex={cacheIndex}
            trackCacheProgress={trackCacheProgress}
            workCacheProgress={workCacheProgress[detailWork.id]}
            onClose={() => setDetailId(null)}
            onPlay={(work) => startWork(work, library.works)}
            onFavorite={toggleFavorite}
            onPlayTracks={playTrackList}
            onCacheTrack={handleCacheTrack}
            onCacheWork={handleCacheWork}
            onRemoveCache={handleRemoveCache}
            onRetryTracks={retryTracks}
          />
        </Suspense>
      )}

      {hasAdult && !ageConfirmed && <AgeGate onConfirm={confirmAdult} />}

      <Toasts toasts={toasts} />
      <audio ref={audioRef} preload="metadata" />
    </div>
  );
}

export default App;
