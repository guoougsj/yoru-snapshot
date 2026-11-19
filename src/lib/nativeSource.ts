import liveSeedRaw from "../../data/live-seed.json";
import type {
  CoverArtSpec,
  LibraryData,
  Mood,
  Playlist,
  TagCategory,
  Track,
  Work,
} from "../types";
import {
  buildRelayTarget,
  FURINA_RELAY,
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
const SYNC_DEADLINE = 45_000;
const TARGET_WORKS = 24;

interface RawTag {
  name?: string;
  i18n?: Record<string, { name?: string } | undefined>;
}

interface RawVa {
  name?: string;
}

interface RawWork {
  id?: number;
  source_id?: string;
  title?: string;
  circle?: { name?: string };
  name?: string;
  tags?: RawTag[];
  vas?: RawVa[];
  duration?: number;
  release?: string;
  create_date?: string;
  rate_average_2dp?: number;
  review_count?: number;
  age_category_string?: string;
  nsfw?: boolean;
}

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

const MOOD_RULES: Array<[string, RegExp]> = [
  ["sleep", /睡眠|添い寝|安眠|おやすみ|寝息|sleep/i],
  ["rain", /雨|rain|water|水音/i],
  ["focus", /作業|勉強|読書|集中|図書|focus|study/i],
  ["nature", /森|海|波|山|自然|風|焚|火|星|nature|forest|ocean/i],
  ["whisper", /ささやき|囁|耳語|低語|whisper|voice/i],
];

const ART: CoverArtSpec[] = [
  { motif: "moon", base: "#101c2a", glow: "#e6b77e", ink: "#f1e9dc", glyph: "夜" },
  { motif: "cloud", base: "#2d2828", glow: "#e9c9ad", ink: "#f8f1e7", glyph: "羊" },
  { motif: "window", base: "#1c211d", glow: "#e3b970", ink: "#f5eee0", glyph: "茶" },
  { motif: "rain", base: "#101d20", glow: "#9fc6bb", ink: "#edf2e9", glyph: "雨" },
  { motif: "ember", base: "#241714", glow: "#e58e57", ink: "#f6e6d1", glyph: "焚" },
  { motif: "garden", base: "#182019", glow: "#c8c690", ink: "#eff0de", glyph: "道" },
  { motif: "wave", base: "#0b1d2c", glow: "#6cb7b9", ink: "#e3f1ec", glyph: "海" },
  { motif: "cafe", base: "#231a15", glow: "#dd9d65", ink: "#f3e4d0", glyph: "喫" },
  { motif: "mountain", base: "#162024", glow: "#a8c8d2", ink: "#eef3f1", glyph: "雪" },
  { motif: "cat", base: "#28201d", glow: "#d7aa83", ink: "#f5e9d9", glyph: "猫" },
  { motif: "book", base: "#25221b", glow: "#d8c597", ink: "#f4eddb", glyph: "頁" },
  { motif: "horizon", base: "#121d26", glow: "#e9a68d", ink: "#f5e7dc", glyph: "潮" },
];

const MOODS: Mood[] = [
  { id: "all", label: "全部", caption: "ALL" },
  { id: "sleep", label: "睡前", caption: "SLEEP" },
  { id: "rain", label: "雨声", caption: "RAIN" },
  { id: "focus", label: "专注", caption: "FOCUS" },
  { id: "nature", label: "自然", caption: "NATURE" },
  { id: "whisper", label: "耳语", caption: "WHISPER" },
];

const PLAYLIST_BLUEPRINTS = [
  {
    id: "midnight-radio",
    title: "深夜耳语电台",
    subtitle: "关灯之后，把世界调成静音",
    description: "给还不想睡的人。低声、雨声与翻页声，陪你度过一天里最私密的两小时。",
    tag: "WHISPER",
    moods: ["night", "whisper"],
    picks: [0, 7, 3, 10],
    art: { base: "#1b2028", glow: "#e2b27d", ink: "#f0e7d9" },
  },
  {
    id: "rainy-day",
    title: "雨天待机",
    subtitle: "让雨替你完成今天的待办",
    description: "窗边的雨、杯中的热气、猫在毛毯上翻身。今天的计划只有一条：不出门。",
    tag: "RAIN",
    moods: ["rain", "healing"],
    picks: [3, 5, 9, 11],
    art: { base: "#162123", glow: "#9fc3b1", ink: "#edf1e9" },
  },
  {
    id: "deep-focus",
    title: "专注一小时",
    subtitle: "没有歌词，也没有打扰",
    description: "给写作者、夜班人和赶 ddl 的人。把声音铺在背景里，让注意力回到眼前。",
    tag: "FOCUS",
    moods: ["focus"],
    picks: [10, 6, 7, 4],
    art: { base: "#1d1e1b", glow: "#d6c598", ink: "#f1ecdf" },
  },
  {
    id: "sleep-well",
    title: "睡前仪式",
    subtitle: "今天到这里就可以了",
    description: "洗漱、关灯、戴上耳机。四段柔软的声音，把今天轻轻合上。",
    tag: "SLEEP",
    moods: ["sleep", "healing"],
    picks: [1, 8, 9, 11],
    art: { base: "#202028", glow: "#c3b7d2", ink: "#f0ecf5" },
  },
];

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const capacitor = (
    window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean };
    }
  ).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.());
}

function cleanTitle(value = ""): string {
  return String(value).replace(/^【[^】]+】\s*/u, "").trim();
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

function deriveMoods(raw: RawWork): string[] {
  const corpus = [raw.title, ...(raw.tags ?? []).map((tag) => tag?.name ?? "")].join(" ");
  const picks = MOOD_RULES.filter(([, pattern]) => pattern.test(corpus)).map(([id]) => id);
  if (!picks.length) picks.push("night");
  return [...new Set(picks)];
}

function normaliseWork(raw: RawWork, index: number): Work {
  const sourceId =
    raw.source_id ||
    (raw.id ? `RJ${String(raw.id).padStart(8, "0")}` : `LIVE-${index + 1}`);
  const art = ART[stableIndex(sourceId, ART.length)];
  const age = String(raw.age_category_string || "").toLowerCase();
  const ageRating =
    raw.nsfw === true || /adult|r18|18\+|nsfw/.test(age)
      ? "ADULT"
      : /r15|15/.test(age)
        ? "R15"
        : undefined;
  const tags = (raw.tags ?? [])
    .map((tag) => tag?.i18n?.["zh-cn"]?.name || tag?.name)
    .filter((tag): tag is string => Boolean(tag))
    .slice(0, 6);
  const circle = raw.circle?.name || raw.name || "asmr.one";
  const cvs = (raw.vas ?? [])
    .map((va) => va.name)
    .filter((name): name is string => Boolean(name))
    .slice(0, 4);
  const duration = Number(raw.duration) > 0 ? Number(raw.duration) : 3600;
  const moodLabel = tags.length ? tags.slice(0, 2).join("、") : "环境声音";

  return {
    id: sourceId,
    title: cleanTitle(raw.title) || `Untitled ${sourceId}`,
    subtitle: cvs.length ? `CV. ${cvs.join(" / ")}` : circle,
    circle,
    cvs,
    tags,
    moods: deriveMoods(raw),
    duration,
    releaseDate:
      raw.release || raw.create_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    rating: Number(raw.rate_average_2dp) || 0,
    reviewCount: Number(raw.review_count) || 0,
    sourceUrl: `https://asmr.one/work/${sourceId}`,
    audio: `/audio/ambient-${String(stableIndex(sourceId + "audio", 12) + 1).padStart(2, "0")}.wav`,
    art,
    ageRating,
    description: `来自 ${circle} 的声音作品，收录 ${moodLabel}。原作品共 ${(duration / 60).toFixed(0)} 分钟，右侧可在 asmr.one 查看完整内容。`,
  };
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

  for (let page = 1; page <= 4 && collected.length < TARGET_WORKS; page += 1) {
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
      // Keep a partial page if we already have enough works to be useful.
      if (collected.length >= 12) break;
      throw error;
    }
  }

  if (!collected.length && lastError) throw lastError;
  return { works: collected, transport, mirror };
}

function aggregateTags(works: Work[]): TagCategory[] {
  const counts = new Map<string, number>();
  for (const work of works) {
    for (const tag of work.tags) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh"))
    .slice(0, 18)
    .map(([label, count]) => ({ id: label, label, count }));
}

function buildLibrary(rawWorks: RawWork[], mirror: string, relayName: string): LibraryData {
  const works = rawWorks.slice(0, TARGET_WORKS).map(normaliseWork);
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

interface RawTrackNode {
  type?: string;
  title?: string;
  hash?: string;
  id?: string | number;
  size?: number;
  duration?: number;
  mediaStreamUrl?: string | null;
  mediaDownloadUrl?: string | null;
  children?: RawTrackNode[];
}

function absoluteMediaUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, "https://api.asmr-200.com").href;
  } catch {
    return undefined;
  }
}

/** Flatten the recursive /api/tracks tree into playable audio files. */
interface TextAsset {
  url: string;
  format: string;
  title: string;
}

const SUBTITLE_FORMATS = new Set(["vtt", "srt", "lrc"]);
const MEDIA_EXTENSIONS = /\.(mp3|wav|flac|m4a|ogg|opus)$/i;
const SUBTITLE_PRIORITY: Record<string, number> = { vtt: 3, srt: 2, lrc: 1 };

export function normaliseTrackTree(
  raw: RawTrackNode[] | { children?: RawTrackNode[] },
): Track[] {
  const groups = new Map<string, Track>();
  const fullTextAssets = new Map<string, TextAsset>();
  const logicalTextAssets = new Map<string, TextAsset>();
  let sequence = 0;

  const collectText = (node: RawTrackNode) => {
    if (node?.type !== "text") return;
    const title = String(node.title || "");
    const formatMatch = title.match(/\.([a-z0-9]{2,5})$/i);
    const format = formatMatch ? formatMatch[1].toLowerCase() : "";
    if (!SUBTITLE_FORMATS.has(format)) return;
    const url =
      absoluteMediaUrl(node.mediaDownloadUrl) || absoluteMediaUrl(node.mediaStreamUrl);
    if (!url) return;
    const withoutExtension = title.slice(0, -(`.${format}`.length));
    const logicalBase = withoutExtension.replace(MEDIA_EXTENSIONS, "");
    const asset: TextAsset = { url, format, title };
    fullTextAssets.set(title.toLowerCase(), asset);
    const existing = logicalTextAssets.get(logicalBase.toLowerCase());
    if (
      !existing ||
      (SUBTITLE_PRIORITY[format] || 0) > (SUBTITLE_PRIORITY[existing.format] || 0)
    ) {
      logicalTextAssets.set(logicalBase.toLowerCase(), asset);
    }
  };

  const findSubtitle = (rawTitle: string, baseTitle: string): TextAsset | null => {
    for (const format of ["vtt", "srt", "lrc"]) {
      const direct = fullTextAssets.get(`${rawTitle}.${format}`.toLowerCase());
      if (direct) return direct;
    }
    const logical = logicalTextAssets.get(baseTitle.toLowerCase());
    if (logical) return logical;
    for (const format of ["vtt", "srt", "lrc"]) {
      const byBase = fullTextAssets.get(`${baseTitle}.${format}`.toLowerCase());
      if (byBase) return byBase;
    }
    return null;
  };

  const audioNodes: RawTrackNode[] = [];
  const walk = (nodes: RawTrackNode[] | undefined) => {
    for (const node of nodes ?? []) {
      if (node?.type === "text") {
        collectText(node);
      } else if (node?.type === "audio") {
        audioNodes.push(node);
      }
      if (Array.isArray(node?.children)) walk(node.children);
    }
  };

  walk(Array.isArray(raw) ? raw : raw?.children);

  // Second pass: text assets can appear after their audio node in the tree.
  for (const node of audioNodes) {
    const streamUrl = absoluteMediaUrl(node.mediaStreamUrl);
    const downloadUrl = absoluteMediaUrl(node.mediaDownloadUrl);
    if (streamUrl || downloadUrl) {
      sequence += 1;
      const rawTitle = String(node.title || `Track ${sequence}`);
      const formatMatch = rawTitle.match(/\.([a-z0-9]{2,5})$/i);
      const format = formatMatch ? formatMatch[1].toLowerCase() : "";
      const title = rawTitle.replace(/\.[a-z0-9]{2,5}$/i, "").trim() || rawTitle;
      const subtitle = findSubtitle(rawTitle, title);
      const candidate: Track = {
        id: String(node.hash || node.id || `track-${sequence}`),
        title,
        format,
        duration: Number(node.duration) || 0,
        size: Number(node.size) || 0,
        streamUrl: (streamUrl || downloadUrl) as string,
        downloadUrl: downloadUrl || undefined,
        downloadable: Boolean(downloadUrl),
        subtitleUrl: subtitle?.url,
        subtitleFormat: subtitle?.format,
      };

      const existing = groups.get(title);
      const candidateScore = candidate.size || Number.MAX_SAFE_INTEGER;
      const existingScore = existing ? existing.size || Number.MAX_SAFE_INTEGER : Infinity;
      const preferCandidate =
        !existing ||
        candidateScore < existingScore ||
        (candidateScore === existingScore && format === "mp3" && existing.format !== "mp3");

      if (preferCandidate) groups.set(title, candidate);
    }
  }

  return [...groups.values()];
}

const trackMemo = new Map<string, { expires: number; tracks: Track[] }>();
const TRACK_CACHE_TTL = 5 * 60_000;
const TRACK_META_KEY = "yoru.track-meta-v2";
const TRACK_META_TTL = 24 * 60 * 60_000;

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

function readCachedTrackMeta(id: string): Track[] | null {
  const cached = readTrackMetaCache()[id];
  if (!cached || !Array.isArray(cached.tracks) || !cached.tracks.length) return null;
  if (Date.now() - Number(cached.cachedAt || 0) > TRACK_META_TTL) return null;
  return cached.tracks;
}

function writeCachedTrackMeta(id: string, tracks: Track[]) {
  try {
    const all = readTrackMetaCache();
    all[id] = { cachedAt: Date.now(), tracks };
    localStorage.setItem(TRACK_META_KEY, JSON.stringify(all));
  } catch {
    /* Track URLs still work for this session without persistent metadata. */
  }
}

const trackInFlight = new Map<string, Promise<Track[]>>();

export async function fetchNativeTracks(workId: string): Promise<Track[]> {
  const digits = String(workId).replace(/^RJ/i, "").replace(/\D/g, "");
  if (!digits) throw new Error("无效的作品编号");
  const id = String(Number(digits));

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
    const stale = readTrackMetaCache()[id];
    if (stale?.tracks?.length) return stale.tracks;
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
      try {
        const text = await fetchText(custom.base, 20_000);
        const snapshot = snapshotToLibrary(JSON.parse(text));
        if (snapshot) return snapshot;
      } catch {
        /* Fall back to the live relay path below. */
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
