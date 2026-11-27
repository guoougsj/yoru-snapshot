import liveSeedRaw from "../../data/live-seed.json";
import {
  aggregateTags,
  cleanTitle,
  MOODS,
  normaliseTrackTree,
  normaliseWorkWithIndex,
  PLAYLIST_BLUEPRINTS,
  safeMediaUrl,
  TARGET_WORKS,
  type RawTrackNode,
  type RawWork,
} from "../../shared/asmrCore.mjs";
import type { LibraryData, Playlist, Track, Work } from "../types";

export { normaliseTrackTree };
import {
  buildRelayTarget,
  DEFAULT_SNAPSHOT_URL,
  FURINA_RELAY,
  GIT_SEED_SNAPSHOT_URL,
  isRouteCoolingDown,
  noteRouteResult,
  parseCustomSource,
  presetRelay,
  presetSnapshot,
  readDataSource,
  routePenalty,
  type DataSourcePreset,
} from "./netSettings";

/**
 * Android (Capacitor) data source.
 *
 * The Express API is not bundled into the APK, so the native shell talks to
 * read-only metadata relays. Only public asmr.one metadata is fetched; covers
 * and previews stay local. Audio and subtitles still point at the official
 * media CDN, which is reachable on networks that block the API.
 */

const API_MIRRORS = [
  "https://api.asmr-200.com",
  "https://api.asmr.one",
  "https://api.asmr-100.com",
  "https://api.asmr-300.com",
];
const SYNC_DEADLINE = 60_000;

interface WorksResponse {
  works?: RawWork[];
}

type TextUnwrapper = (text: string) => unknown;

type CandidateGroup = "direct" | "furina" | "public" | "custom";

interface Candidate {
  name: string;
  url: string;
  timeout: number;
  /** Staggered launch: direct first, relays shortly after. */
  delay: number;
  unwrap: TextUnwrapper;
  mirror: string;
  group: CandidateGroup;
}

const RAW_UNWRAP: TextUnwrapper = (text) => JSON.parse(text);
const RELAY_UNWRAP: TextUnwrapper = (text) => {
  const payload = JSON.parse(text) as {
    status?: { http_code?: number };
    contents?: string;
  };
  if (typeof payload?.contents === "string") {
    const code = payload?.status?.http_code;
    if (code && code !== 200) throw new Error(`中继上游返回 ${code}`);
    return JSON.parse(payload.contents);
  }
  return payload;
};

function furinaTarget(target: string): string {
  const url = new URL(target);
  return `${FURINA_RELAY}${url.pathname.replace(/^\/api/, "")}${url.search}`;
}

/**
 * Hedged requests: direct is tried immediately, then the read-only relays are
 * started with small delays. The first valid response wins and the rest are
 * aborted. This turns a 45s sequential timeout into a normal 2-10s load on
 * networks where only one relay is healthy.
 */
const PRESET_GROUPS: Record<DataSourcePreset, CandidateGroup[]> = {
  auto: ["custom", "furina", "direct", "public"],
  furina: ["furina", "direct"],
  direct: ["direct"],
  public: ["public", "direct"],
  custom: ["custom", "furina", "direct"],
  // A snapshot is tried before candidates. If it fails, use the auto routes.
  snapshot: ["custom", "furina", "direct", "public"],
  bundled: ["custom", "furina", "direct", "public"],
};

function buildCandidates(targetFor: (mirror: string) => string): Candidate[] {
  const candidates: Candidate[] = [];
  const config = readDataSource();
  const custom = config.preset === "custom" ? presetRelay(config) : null;

  if (custom?.kind === "relay") {
    candidates.push({
      name: "custom-relay",
      url: buildRelayTarget(custom.base, targetFor(API_MIRRORS[0])),
      timeout: 20_000,
      delay: 0,
      unwrap: RELAY_UNWRAP,
      mirror: API_MIRRORS[0],
      group: "custom",
    });
  }

  // The Furina relay is a transparent API proxy hosted on Cloudflare Pages.
  // It stays reachable on many networks where the official domains are not.
  candidates.push({
    name: "furina-relay",
    url: furinaTarget(targetFor(API_MIRRORS[0])),
    timeout: 15_000,
    delay: 0,
    unwrap: RAW_UNWRAP,
    mirror: API_MIRRORS[0],
    group: "furina",
  });

  API_MIRRORS.forEach((mirror, index) => {
    candidates.push({
      name: `direct-${index + 1}`,
      url: targetFor(mirror),
      timeout: 6_000,
      delay: 0,
      unwrap: RAW_UNWRAP,
      mirror,
      group: "direct",
    });
  });

  API_MIRRORS.slice(0, 2).forEach((mirror, index) => {
    candidates.push({
      name: `allorigins-raw-${index + 1}`,
      url: `https://api.allorigins.win/raw?url=${encodeURIComponent(targetFor(mirror))}`,
      timeout: 15_000,
      delay: 600 + index * 300,
      unwrap: RELAY_UNWRAP,
      mirror,
      group: "public",
    });
  });

  candidates.push({
    name: "allorigins-get",
    url: `https://api.allorigins.win/get?url=${encodeURIComponent(targetFor(API_MIRRORS[0]))}`,
    timeout: 15_000,
    delay: 1_000,
    unwrap: RELAY_UNWRAP,
    mirror: API_MIRRORS[0],
    group: "public",
  });

  candidates.push({
    name: "cors-lol",
    url: `https://api.cors.lol/?url=${encodeURIComponent(targetFor(API_MIRRORS[0]))}`,
    timeout: 15_000,
    delay: 1_800,
    unwrap: RELAY_UNWRAP,
    mirror: API_MIRRORS[0],
    group: "public",
  });

  const allowed = new Set(PRESET_GROUPS[config.preset] || PRESET_GROUPS.auto);
  const selected = candidates.filter((candidate) => allowed.has(candidate.group));
  const available = selected.filter(
    (candidate) =>
      candidate.group === "custom" || !isRouteCoolingDown(candidate.name),
  );
  return (available.length ? available : selected).sort(
    (a, b) => routePenalty(a.name) - routePenalty(b.name),
  );
}

interface HedgedResult<T> {
  value: T;
  candidate: Candidate;
}

function hedgedValue<T>(
  candidates: Candidate[],
  deadline: number,
  parse: (raw: unknown) => T | null,
): Promise<HedgedResult<T>> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let rejected = 0;
    const controllers = new Set<AbortController>();
    const errors: string[] = [];

    const finishError = () => {
      if (settled) return;
      settled = true;
      reject(
        new Error(
          `网络线路均不可用${errors.length ? `（${errors.slice(-2).join("；")}）` : ""}`,
        ),
      );
    };

    const tasks = candidates.map(async (candidate) => {
      if (candidate.delay > 0) {
        await new Promise((done) => window.setTimeout(done, candidate.delay));
      }
      if (settled) throw new Error("已由其他线路完成");
      const remaining = deadline - Date.now();
      if (remaining < 600) throw new Error("请求超时");

      const controller = new AbortController();
      controllers.add(controller);
      try {
        const text = await fetchText(
          candidate.url,
          Math.min(candidate.timeout, remaining),
          controller.signal,
        );
        const value = parse(candidate.unwrap(text));
        if (value === null) throw new Error("响应不完整");
        noteRouteResult(candidate.name, true);
        return { value, candidate };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${candidate.name}: ${message}`);
        if (!settled) noteRouteResult(candidate.name, false);
        throw error;
      } finally {
        controllers.delete(controller);
      }
    });

    for (const task of tasks) {
      task
        .then((result) => {
          if (settled) return;
          settled = true;
          for (const controller of controllers) controller.abort();
          resolve(result);
        })
        .catch(() => {
          rejected += 1;
          if (rejected >= tasks.length) finishError();
        });
    }
  });
}

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const capacitor = (
    window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean };
    }
  ).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.());
}

/** FNV-1a keeps art/audio assignment deterministic without Node's crypto. */
function stableIndex(seed: string, mod: number): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % mod;
}

async function fetchText(
  url: string,
  timeout: number,
  externalSignal?: AbortSignal,
): Promise<string> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", abort, { once: true });
  }
  let timer = 0;

  // Capacitor's native HTTP bridge may ignore AbortSignal, so race the request
  // against an explicit deadline as well as aborting the browser fetch.
  const deadline = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      controller.abort();
      reject(new Error("请求超时"));
    }, Math.max(500, timeout));
  });

  try {
    const response = await Promise.race([
      fetch(url, { signal: controller.signal, cache: "no-store" }),
      deadline,
    ]);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    window.clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abort);
  }
}

async function collectWorksHedged(
  deadline: number,
): Promise<{ works: RawWork[]; transport: string; mirror: string }> {
  const collected: RawWork[] = [];
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  let transport = "direct-1";
  let mirror = API_MIRRORS[0];
  let lastError: unknown = null;

  for (let page = 1; page <= 40 && collected.length < TARGET_WORKS; page += 1) {
    if (Date.now() >= deadline) break;
    try {
      const result = await hedgedValue(
        buildCandidates(
          (base) => `${base}/api/works?order=release&sort=desc&page=${page}&subtitle=0`,
        ),
        deadline,
        (raw) => {
          const payload = raw as WorksResponse;
          return Array.isArray(payload?.works) && payload.works.length ? payload : null;
        },
      );

      transport = result.candidate.name;
      mirror = result.candidate.mirror;
      const works = result.value.works ?? [];

      for (const work of works) {
        const id = String(work.source_id || work.id || "");
        const titleKey = `${cleanTitle(work.title)}::${work.circle?.name || work.name || ""}`;
        if (!id || seenIds.has(id) || seenTitles.has(titleKey)) continue;
        seenIds.add(id);
        seenTitles.add(titleKey);
        collected.push(work);
        if (collected.length >= TARGET_WORKS) break;
      }
    } catch (error) {
      lastError = error;
      // Keep the partial library and try the next page. One flaky page
      // should not cap a 500-work sync at 20 or 40 items.
      if (collected.length >= 12) continue;
      throw error;
    }
  }

  if (!collected.length && lastError) throw lastError;
  return { works: collected, transport, mirror };
}

function buildLibrary(rawWorks: RawWork[], mirror: string, relayName: string): LibraryData {
  const works = rawWorks
    .slice(0, TARGET_WORKS)
    .map((raw, index) => normaliseWorkWithIndex(raw, index, stableIndex));
  const playlists: Playlist[] = PLAYLIST_BLUEPRINTS.map((blueprint) => ({
    ...blueprint,
    curator: "YORU 编辑部",
    workIds: blueprint.picks
      .map((pick) => works[pick % works.length]?.id)
      .filter((id): id is string => Boolean(id)),
  }));
  const via = relayName.startsWith("direct")
    ? "Android 客户端直连 asmr.one"
    : `Android 客户端通过 ${relayName} 只读中继`;

  return {
    source: {
      name: "asmr.one",
      url: "https://asmr.one/works",
      api: `${mirror}/api/works?order=release&sort=desc`,
      fetchedAt: new Date().toISOString(),
      mode: "live",
      transport: relayName,
      note: `${via} 抓取 asmr.one 作品，并按原站标签分类；完整音轨通过官方接口播放。`,
    },
    works,
    playlists,
    moods: MOODS,
    tags: aggregateTags(works),
    hasAdult: works.some((work) => Boolean(work.ageRating)),
  };
}

function snapshotToLibrary(
  raw: unknown,
  transport = "snapshot",
  note = "已从自定义快照载入 asmr.one 作品数据；这是快照，不是实时抓取。",
): LibraryData | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as Partial<LibraryData> & { works?: Array<RawWork | Work> };
  if (!Array.isArray(payload.works) || !payload.works.length) return null;

  if (payload.source && Array.isArray(payload.playlists) && Array.isArray(payload.moods)) {
    return {
      ...(payload as LibraryData),
      works: payload.works.slice(0, TARGET_WORKS) as Work[],
      source: {
        ...(payload.source as LibraryData["source"]),
        mode: "curated-snapshot",
        transport,
        fetchedAt: payload.source.fetchedAt || new Date().toISOString(),
        note: note + (payload.source.note ? ` ${payload.source.note}` : ""),
      },
    };
  }

  const library = buildLibrary(payload.works as RawWork[], API_MIRRORS[0], transport);
  return {
    ...library,
    source: {
      ...library.source,
      mode: "curated-snapshot",
      transport,
      note,
    },
  };
}

const trackMemo = new Map<string, { expires: number; tracks: Track[] }>();
const TRACK_CACHE_TTL = 5 * 60_000;
const TRACK_META_KEY = "yoru.track-meta-v3";
const TRACK_META_TTL = 24 * 60 * 60_000;
const MAX_TRACK_META_ENTRIES = 60;

interface TrackMetaCache {
  cachedAt: number;
  tracks: Track[];
}

function readTrackMetaCache(): Record<string, TrackMetaCache> {
  try {
    const raw = JSON.parse(localStorage.getItem(TRACK_META_KEY) ?? "{}") as Record<
      string,
      TrackMetaCache
    >;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function readCachedTrackMeta(id: string, allowStale = false): Track[] | null {
  const cached = readTrackMetaCache()[id];
  if (!cached || !Array.isArray(cached.tracks) || !cached.tracks.length) return null;
  if (!allowStale && Date.now() - Number(cached.cachedAt || 0) > TRACK_META_TTL) return null;
  const tracks = cached.tracks.filter(
    (track) =>
      safeMediaUrl(track.streamUrl) &&
      (!track.downloadUrl || safeMediaUrl(track.downloadUrl)) &&
      (!track.subtitleUrl || safeMediaUrl(track.subtitleUrl)),
  );
  return tracks.length ? tracks : null;
}

function writeCachedTrackMeta(id: string, tracks: Track[]) {
  try {
    const now = Date.now();
    const all = readTrackMetaCache();
    all[id] = { cachedAt: now, tracks };
    const pruned = Object.entries(all)
      .filter(([, entry]) => entry && Array.isArray(entry.tracks) && now - Number(entry.cachedAt || 0) < TRACK_META_TTL)
      .sort((a, b) => Number(b[1].cachedAt || 0) - Number(a[1].cachedAt || 0))
      .slice(0, MAX_TRACK_META_ENTRIES);
    localStorage.setItem(TRACK_META_KEY, JSON.stringify(Object.fromEntries(pruned)));
  } catch {
    /* Track URLs still work for this session without persistent metadata. */
  }
}

const trackInFlight = new Map<string, Promise<Track[]>>();

export async function fetchNativeTracks(workId: string): Promise<Track[]> {
  const rawId = String(workId || "").trim();
  if (!/^RJ?\d+$/i.test(rawId)) throw new Error("无效的作品编号");
  const numericId = Number(rawId.replace(/^RJ/i, ""));
  if (!Number.isSafeInteger(numericId) || numericId <= 0) {
    throw new Error("无效的作品编号");
  }
  const id = String(numericId);

  const memory = trackMemo.get(id);
  if (memory && memory.expires > Date.now()) return memory.tracks;

  const persisted = readCachedTrackMeta(id);
  if (persisted) {
    trackMemo.set(id, { expires: Date.now() + TRACK_CACHE_TTL, tracks: persisted });
    return persisted;
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("当前处于离线状态");
  }

  const active = trackInFlight.get(id);
  if (active) return active;

  const promise = (async () => {
    const result = await hedgedValue(
      buildCandidates((base) => `${base}/api/tracks/${id}?v=2`),
      Date.now() + 25_000,
      (raw) => {
        const tracks = normaliseTrackTree(
          raw as RawTrackNode[] | { children?: RawTrackNode[] },
        );
        return tracks.length ? tracks : null;
      },
    );

    trackMemo.set(id, { expires: Date.now() + TRACK_CACHE_TTL, tracks: result.value });
    writeCachedTrackMeta(id, result.value);
    return result.value;
  })();

  trackInFlight.set(id, promise);
  try {
    return await promise;
  } catch (error) {
    const stale = readCachedTrackMeta(id, true);
    if (stale) return stale;
    throw error;
  } finally {
    trackInFlight.delete(id);
  }
}

let libraryInFlight: Promise<LibraryData> | null = null;

export async function fetchNativeLibrary(
  deadlineMs = SYNC_DEADLINE,
): Promise<LibraryData> {
  const config = readDataSource();
  if (config.preset === "bundled") {
    const bundled = snapshotToLibrary(
      liveSeedRaw,
      "bundled",
      "安装包内置的 asmr.one 作品快照；完全离线，不会自动联网更新。",
    );
    if (bundled) return bundled;
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("当前处于离线状态");
  }
  if (libraryInFlight) return libraryInFlight;

  const promise = (async () => {
    const custom = presetSnapshot(config);
    if (custom) {
      const urls =
        custom.base === DEFAULT_SNAPSHOT_URL
          ? [custom.base, GIT_SEED_SNAPSHOT_URL]
          : [custom.base];
      for (const url of urls) {
        try {
          const text = await fetchText(url, 20_000);
          const snapshot = snapshotToLibrary(JSON.parse(text));
          if (snapshot) return snapshot;
        } catch {
          /* Try the next snapshot URL, then fall back to live relays. */
        }
      }
    }

    const { works, transport, mirror } = await collectWorksHedged(
      Date.now() + deadlineMs,
    );
    if (works.length < 12) {
      throw new Error(`仅找到 ${works.length} 件作品`);
    }
    return buildLibrary(works, mirror, transport);
  })();

  libraryInFlight = promise;
  try {
    return await promise;
  } finally {
    libraryInFlight = null;
  }
}

/**
 * Validate a user-supplied relay or snapshot before saving it. This is used by
 * the data-source settings panel; it never writes to localStorage itself.
 */
export async function testCustomSource(raw: string): Promise<string> {
  const custom = parseCustomSource(raw);
  if (!custom) throw new Error("请输入有效的 http(s) 地址");

  if (custom.kind === "snapshot") {
    const text = await fetchText(custom.base, 20_000);
    const snapshot = snapshotToLibrary(JSON.parse(text));
    if (!snapshot) throw new Error("快照中没有可识别的作品数据");
    return `快照可用 · ${snapshot.works.length} 个作品`;
  }

  const target = `${API_MIRRORS[0]}/api/works?order=release&sort=desc&page=1&subtitle=0`;
  const text = await fetchText(buildRelayTarget(custom.base, target), 20_000);
  const payload = RELAY_UNWRAP(text) as WorksResponse;
  const count = Array.isArray(payload?.works) ? payload.works.length : 0;
  if (!count) throw new Error("中继返回了空作品列表");
  return `中继可用 · 本页 ${count} 个作品`;
}
