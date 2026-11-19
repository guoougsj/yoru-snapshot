import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const MIRRORS = [
  "https://api.asmr-200.com",
  "https://api.asmr.one",
  "https://api.asmr-100.com",
  "https://api.asmr-300.com",
];

/**
 * The deployment network blocks direct TLS connections to asmr.one. These
 * public read-only relays let the sync script still reach the public API.
 * Only public metadata is requested; no media is proxied.
 */
export const RELAYS = [
  {
    // Transparent, read-only API relay hosted on Cloudflare Pages. It is
    // reachable from networks where the official API domains are blocked.
    name: "furina-relay",
    build: (url) => {
      const target = new URL(url);
      return `https://asmr.furina.in/api${target.pathname.replace(/^\/api/, "")}${target.search}`;
    },
    unwrap: (payload) => payload,
  },
  {
    name: "allorigins-raw",
    build: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    unwrap: (payload) => payload,
  },
  {
    name: "cors-lol",
    build: (url) => `https://api.cors.lol/?url=${encodeURIComponent(url)}`,
    unwrap: (payload) => payload,
  },
  {
    name: "allorigins",
    build: (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    unwrap: (payload) => {
      const code = payload?.status?.http_code;
      if (code && code !== 200) throw new Error(`relay upstream ${code}`);
      if (typeof payload?.contents !== "string") {
        throw new Error("relay returned empty contents");
      }
      return JSON.parse(payload.contents);
    },
  },
];

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
];

const MOOD_RULES = [
  ["sleep", /睡眠|添い寝|安眠|おやすみ|寝息|sleep/i],
  ["rain", /雨|rain|water|水音/i],
  ["focus", /作業|勉強|読書|集中|図書|focus|study/i],
  ["nature", /森|海|波|山|自然|風|焚|火|星|nature|forest|ocean/i],
  ["whisper", /ささやき|囁|耳語|低語|whisper|voice/i],
];

const ART = [
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

const MOODS = [
  { id: "all", label: "全部", caption: "ALL" },
  { id: "sleep", label: "睡前", caption: "SLEEP" },
  { id: "rain", label: "雨声", caption: "RAIN" },
  { id: "focus", label: "专注", caption: "FOCUS" },
  { id: "nature", label: "自然", caption: "NATURE" },
  { id: "whisper", label: "耳语", caption: "WHISPER" },
];

export function cleanTitle(value = "") {
  return String(value).replace(/^【[^】]+】\s*/u, "").trim();
}

function stableIndex(seed, mod) {
  const hash = createHash("sha1").update(seed).digest();
  return hash.readUInt16BE(0) % mod;
}

function deriveMoods(raw) {
  const corpus = [raw.title, ...(raw.tags ?? []).map((t) => t?.name ?? "")].join(" ");
  const picks = MOOD_RULES.filter(([, re]) => re.test(corpus)).map(([id]) => id);
  if (!picks.length) picks.push("night");
  return [...new Set(picks)];
}

function normaliseWork(raw, index) {
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
    .filter(Boolean)
    .slice(0, 6);
  const circle = raw.circle?.name || raw.name || "asmr.one";
  const cvs = (raw.vas ?? []).map((va) => va.name).filter(Boolean).slice(0, 4);
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
    releaseDate: raw.release || raw.create_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    rating: Number(raw.rate_average_2dp) || 0,
    reviewCount: Number(raw.review_count) || 0,
    sourceUrl: `https://asmr.one/work/${sourceId}`,
    audio: `/audio/ambient-${String((stableIndex(sourceId + "audio", 12) + 1)).padStart(2, "0")}.wav`,
    art,
    ageRating,
    description: `来自 ${circle} 的声音作品，收录 ${moodLabel}。原作品共 ${(duration / 60).toFixed(0)} 分钟，右侧可在 asmr.one 查看完整内容。`,
  };
}

async function fetchJson(url, { relay = null, timeout = 9000, attempts = 1 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const target = relay ? relay.build(url) : url;
      const headers = relay
        ? { "User-Agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] }
        : {
            Accept: "application/json",
            Origin: "https://asmr.one",
            Referer: "https://asmr.one/",
            "User-Agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
          };
      const response = await fetch(target, {
        headers,
        signal: AbortSignal.timeout(timeout),
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText} ${text.slice(0, 80)}`);
      }
      const payload = JSON.parse(text);
      return relay ? relay.unwrap(payload) : payload;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 2500 * attempt));
      }
    }
  }
  throw lastError;
}

const TARGET_WORKS = 200;

async function collectWorks(base, transport) {
  const collected = [];
  const seenIds = new Set();
  const seenTitles = new Set();

  for (let page = 1; page <= 20 && collected.length < TARGET_WORKS; page++) {
    const url = `${base}/api/works?order=release&sort=desc&page=${page}&subtitle=0`;
    const payload = await fetchJson(url, transport);
    const works = Array.isArray(payload?.works) ? payload.works : [];
    if (!works.length) break;

    for (const work of works) {
      const id = String(work.source_id || work.id || "");
      const titleKey = `${cleanTitle(work.title)}::${work.circle?.name || work.name || ""}`;
      if (!id || seenIds.has(id) || seenTitles.has(titleKey)) continue;
      seenIds.add(id);
      seenTitles.add(titleKey);
      collected.push(work);
      if (collected.length >= TARGET_WORKS) break;
    }
    if (collected.length >= TARGET_WORKS) break;
  }

  return collected;
}

async function scrapeMirror(base, transport) {
  const collected = await collectWorks(base, transport);
  if (collected.length < 12) {
    throw new Error(`Only ${collected.length} works found`);
  }
  return collected;
}

const RELAY_MIRRORS = [MIRRORS[0], MIRRORS[1]];
const SYNC_DEADLINE_MS = 150_000;

function aggregateTags(works) {
  const counts = new Map();
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

function buildLibrary(rawWorks, mirror, transport) {
  const works = rawWorks.slice(0, TARGET_WORKS).map(normaliseWork);
  const playlists = PLAYLIST_BLUEPRINTS.map((blueprint) => ({
    ...blueprint,
    curator: "YORU 编辑部",
    workIds: blueprint.picks
      .map((pick) => works[pick % works.length]?.id)
      .filter(Boolean),
  }));

  return {
    source: {
      name: "asmr.one",
      url: "https://asmr.one/works",
      api: `${mirror}/api/works?order=release&sort=desc`,
      fetchedAt: new Date().toISOString(),
      mode: "live",
      transport,
      note:
        transport === "direct"
          ? "实时抓取 asmr.one 作品，并按原站标签分类；完整音轨通过官方接口播放。"
          : `通过 ${transport} 只读中继抓取 asmr.one 作品，并按原站标签分类；完整音轨通过官方接口播放。`,
    },
    works,
    playlists,
    moods: MOODS,
    tags: aggregateTags(works),
    hasAdult: works.some((work) => Boolean(work.ageRating)),
  };
}

function absoluteMediaUrl(value) {
  if (!value || typeof value !== "string") return undefined;
  try {
    return new URL(value, "https://api.asmr-200.com").href;
  } catch {
    return undefined;
  }
}

/**
 * Fetch a public subtitle/text asset from the official media CDN. The server
 * only proxies small text files; audio is never proxied here.
 */
export async function fetchSubtitleText(rawUrl) {
  const url = new URL(String(rawUrl || ""));
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error("仅支持 HTTP(S) 字幕地址");
  }
  const host = url.hostname.toLowerCase();
  const allowed =
    host === "asmr.one" ||
    host.endsWith(".asmr.one") ||
    host.endsWith(".kiko-play-niptan.one");
  if (!allowed) throw new Error("不允许的字幕域名");
  if (!/\.(vtt|srt|lrc|txt)$/i.test(url.pathname)) {
    throw new Error("不支持的字幕格式");
  }

  const response = await fetch(url.href, {
    headers: {
      Origin: "https://asmr.one",
      Referer: "https://asmr.one/",
      "User-Agent": USER_AGENTS[0],
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`字幕 HTTP ${response.status}`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > 1_000_000) throw new Error("字幕文件过大");
  const text = await response.text();
  if (text.length > 1_000_000) throw new Error("字幕文件过大");
  return text;
}

/**
 * The tracks endpoint returns a recursive folder tree. Keep only audio nodes
 * and collapse duplicate format variants (mp3/flac/wav) by title + duration.
 */
const SUBTITLE_FORMATS = new Set(["vtt", "srt", "lrc"]);
const MEDIA_EXTENSIONS = /\.(mp3|wav|flac|m4a|ogg|opus)$/i;

export function normaliseTrackTree(raw) {
  // The official tree usually contains the same track in mp3 + wav/flac.
  // Group by filename without extension and keep the smallest file (mp3)
  // so we never accidentally cache a 1 GB wav variant.
  const groups = new Map();
  const fullTextAssets = new Map();
  const logicalTextAssets = new Map();
  let sequence = 0;

  const collectText = (node) => {
    if (node?.type !== "text") return;
    const title = String(node.title || "");
    const formatMatch = title.match(/\.([a-z0-9]{2,5})$/i);
    const format = formatMatch ? formatMatch[1].toLowerCase() : "";
    if (!SUBTITLE_FORMATS.has(format)) return;
    const url =
      absoluteMediaUrl(node.mediaDownloadUrl) ||
      absoluteMediaUrl(node.mediaStreamUrl);
    if (!url) return;
    const withoutExtension = title.slice(0, -(`.${format}`.length));
    const logicalBase = withoutExtension.replace(MEDIA_EXTENSIONS, "");
    const asset = { url, format, title };
    fullTextAssets.set(title.toLowerCase(), asset);
    const existing = logicalTextAssets.get(logicalBase.toLowerCase());
    const priority = { vtt: 3, srt: 2, lrc: 1 };
    if (!existing || (priority[format] || 0) > (priority[existing.format] || 0)) {
      logicalTextAssets.set(logicalBase.toLowerCase(), asset);
    }
  };

  const findSubtitle = (rawTitle, baseTitle) => {
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

  const audioNodes = [];
  const walk = (nodes) => {
    for (const node of Array.isArray(nodes) ? nodes : []) {
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
      const candidate = {
        id: String(node.hash || node.id || `track-${sequence}`),
        title,
        format,
        duration: Number(node.duration) || 0,
        size: Number(node.size) || 0,
        streamUrl: streamUrl || downloadUrl,
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

const trackCache = new Map();
const TRACK_CACHE_TTL = 5 * 60_000;
const TRACKS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "cache", "tracks");
const TRACKS_DISK_TTL = 24 * 60 * 60_000;

function readDiskTrackCache(id) {
  try {
    const data = JSON.parse(readFileSync(join(TRACKS_DIR, `${id}.json`), "utf8"));
    if (data?.version === 2 && Array.isArray(data?.tracks) && data.tracks.length) {
      return data;
    }
  } catch {
    /* No cache for this work yet. */
  }
  return null;
}

function writeDiskTrackCache(id, data) {
  try {
    mkdirSync(TRACKS_DIR, { recursive: true });
    writeFileSync(
      join(TRACKS_DIR, `${id}.json`),
      JSON.stringify({ ...data, version: 2, cachedAt: Date.now() }, null, 2),
      "utf8",
    );
  } catch (error) {
    console.warn("[yoru] could not write track cache:", error.message);
  }
}

export async function fetchTracks(workId) {
  const digits = String(workId || "").replace(/^RJ/i, "").replace(/\D/g, "");
  if (!digits) throw new Error("无效的作品编号");
  const id = String(Number(digits));

  const memory = trackCache.get(id);
  if (memory && memory.expires > Date.now()) return memory.data;

  const disk = readDiskTrackCache(id);
  if (disk && Date.now() - Number(disk.cachedAt || 0) < TRACKS_DISK_TTL) {
    return disk;
  }

  const errors = [];
  const startedAt = Date.now();
  const deadline = startedAt + 45_000;
  const url = (base) => `${base}/api/tracks/${id}?v=2`;

  const remember = (data) => {
    trackCache.set(id, { expires: Date.now() + TRACK_CACHE_TTL, data });
    writeDiskTrackCache(id, data);
    return data;
  };

  // Try the Cloudflare Pages relay first: it is reachable on networks where
  // the official API domains are blocked, and it responds in well under a
  // second for a typical track tree.
  try {
    const raw = await fetchJson(url(MIRRORS[0]), {
      relay: RELAYS[0],
      timeout: 10_000,
    });
    return remember({
      workId: id,
      tracks: normaliseTrackTree(raw),
      transport: RELAYS[0].name,
      mirror: MIRRORS[0],
    });
  } catch (error) {
    errors.push(`${RELAYS[0].name} ${new URL(MIRRORS[0]).host}: ${error.message}`);
  }

  for (const mirror of MIRRORS) {
    if (Date.now() >= deadline) break;
    try {
      const raw = await fetchJson(url(mirror), {
        timeout: Math.min(5000, Math.max(1000, deadline - Date.now())),
      });
      return remember({
        workId: id,
        tracks: normaliseTrackTree(raw),
        transport: "direct",
        mirror,
      });
    } catch (error) {
      errors.push(`direct ${new URL(mirror).host}: ${error.message}`);
    }
  }

  for (const relay of RELAYS) {
    for (const mirror of RELAY_MIRRORS) {
      if (Date.now() >= deadline) break;
      const remaining = deadline - Date.now();
      if (remaining < 1200) break;
      try {
        const raw = await fetchJson(url(mirror), {
          relay,
          timeout: Math.min(20_000, remaining),
        });
        return remember({
          workId: id,
          tracks: normaliseTrackTree(raw),
          transport: relay.name,
          mirror,
        });
      } catch (error) {
        errors.push(`${relay.name} ${new URL(mirror).host}: ${error.message}`);
      }
    }
  }

  if (disk) return disk;
  throw new Error(`无法获取作品音轨（${errors.slice(-2).join("；")}）`);
}

export async function scrapeAsmrOne() {
  const errors = [];
  const startedAt = Date.now();
  const hasTime = () => Date.now() - startedAt < SYNC_DEADLINE_MS;

  // Fast path: the Cloudflare Pages relay is usually the only route that is
  // reachable when the official API is blocked.
  if (hasTime()) {
    try {
      const rawWorks = await scrapeMirror(MIRRORS[0], {
        relay: RELAYS[0],
        timeout: 20_000,
        attempts: 1,
      });
      return buildLibrary(rawWorks, MIRRORS[0], RELAYS[0].name);
    } catch (error) {
      errors.push(`${RELAYS[0].name} ${new URL(MIRRORS[0]).host}: ${error.message}`);
    }
  }

  for (const mirror of MIRRORS) {
    if (!hasTime()) break;
    try {
      const rawWorks = await scrapeMirror(mirror, { timeout: 6000, attempts: 1 });
      return buildLibrary(rawWorks, mirror, "direct");
    } catch (error) {
      errors.push(`direct ${new URL(mirror).host}: ${error.message}`);
    }
  }

  for (const relay of RELAYS) {
    for (const mirror of RELAY_MIRRORS) {
      if (!hasTime()) break;
      try {
        const rawWorks = await scrapeMirror(mirror, {
          relay,
          timeout: 20000,
          attempts: 1,
        });
        return buildLibrary(rawWorks, mirror, relay.name);
      } catch (error) {
        errors.push(`${relay.name} ${new URL(mirror).host}: ${error.message}`);
      }
    }
  }

  throw new Error(`asmr.one 暂时无法连接（${errors.join("；")}）`);
}
