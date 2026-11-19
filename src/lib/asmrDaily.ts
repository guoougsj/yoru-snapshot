import type {
  CoverArtSpec,
  LibraryData,
  Mood,
  Playlist,
  TagCategory,
  Work,
} from "../types";

export const ASMR_DAILY_BASE = "https://asmrdaily.drive2dav.top";
export const ASMR_DAILY_NAME = "ASMR Daily";
export const ASMR_DAILY_TOKEN_KEY = "yoru.asmr-daily-token";
export const ASMR_DAILY_USER_KEY = "yoru.asmr-daily-user";
export const ASMR_DAILY_LIBRARY_KEY = "yoru.asmr-daily-library";
export const ACTIVE_SOURCE_KEY = "yoru.active-source";

export type LibrarySourceId = "asmr-one" | "asmr-daily";

interface RawAsmrDailyWork {
  id?: string;
  name?: string;
  image_main?: string;
  image_thumb?: string;
  intro?: string;
  maker?: { name?: string };
  artists?: Array<{ name?: string }>;
  illustrators?: Array<{ name?: string }>;
  genres?: Array<{ name?: string }>;
  age_category?: number;
  price?: number;
  sales?: number;
  wishlist_count?: number;
  rating?: number;
  rating_count?: number;
  review_count?: number;
  release_date?: string;
}

interface AsmrDailyWorksResponse {
  data?: RawAsmrDailyWork[];
  pagination?: { page?: number; page_size?: number; total?: number };
}

const PAGE_SIZE = 100;
// Some Kikoeru deployments cap page_size at 20, so allow enough pages to
// reach 500 items even when the server clamps the requested size.
const MAX_PAGES = 25;
const MAX_WORKS = 500;

const ART: CoverArtSpec[] = [
  { motif: "moon", base: "#111d2a", glow: "#e6b77e", ink: "#f1e9dc", glyph: "夜" },
  { motif: "cloud", base: "#282328", glow: "#e9c9ad", ink: "#f8f1e7", glyph: "云" },
  { motif: "window", base: "#1c211d", glow: "#e3b970", ink: "#f5eee0", glyph: "窗" },
  { motif: "rain", base: "#101d20", glow: "#9fc6bb", ink: "#edf2e9", glyph: "雨" },
  { motif: "ember", base: "#241714", glow: "#e58e57", ink: "#f6e6d1", glyph: "灯" },
  { motif: "wave", base: "#0b1d2c", glow: "#6cb7b9", ink: "#e3f1ec", glyph: "潮" },
  { motif: "garden", base: "#182019", glow: "#c8c690", ink: "#eff0de", glyph: "庭" },
  { motif: "horizon", base: "#121d26", glow: "#e9a68d", ink: "#f5e7dc", glyph: "海" },
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
    id: "daily-new",
    title: "Daily 新入库",
    subtitle: "来自外部作品库的最新声音",
    description: "ASMR Daily 最近收录的作品。适合想换一批声音、又不想离开 YORU 的夜晚。",
    tag: "NEW",
    moods: ["night"],
    picks: [0, 1, 2, 3],
    art: { base: "#1b2028", glow: "#e2b27d", ink: "#f0e7d9" },
  },
  {
    id: "daily-sleep",
    title: "Daily 睡前",
    subtitle: "把今天轻轻放下",
    description: "耳语、掏耳和低频环境声，给睡前留一段不被打扰的时间。",
    tag: "SLEEP",
    moods: ["sleep"],
    picks: [4, 5, 6, 7],
    art: { base: "#202028", glow: "#c3b7d2", ink: "#f0ecf5" },
  },
  {
    id: "daily-focus",
    title: "Daily 专注",
    subtitle: "只留下声音和手头的事",
    description: "没有歌词，也没有多余提示。把声音放在背景里，继续写、读或工作。",
    tag: "FOCUS",
    moods: ["focus"],
    picks: [8, 9, 10, 11],
    art: { base: "#1d1e1b", glow: "#d6c598", ink: "#f1ecdf" },
  },
  {
    id: "daily-night",
    title: "Daily 夜航",
    subtitle: "给还醒着的人",
    description: "从 ASMR Daily 的作品里挑出的夜色组合，适合关灯后慢慢听。",
    tag: "NIGHT",
    moods: ["night", "healing"],
    picks: [12, 13, 14, 15],
    art: { base: "#141b2a", glow: "#aebbd6", ink: "#e9edf5" },
  },
];

function hashIndex(value: string, modulo: number): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash % modulo;
}

function coverUrl(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("//")) return `https:${value}`;
  return value;
}

function deriveMoods(tags: string[]): string[] {
  const corpus = tags.join(" ");
  const moods: string[] = [];
  if (/睡眠|安眠|添い寝|助眠|寝息|sleep/i.test(corpus)) moods.push("sleep");
  if (/雨|rain|水音/i.test(corpus)) moods.push("rain");
  if (/作業|勉強|読書|集中|study|focus/i.test(corpus)) moods.push("focus");
  if (/森|海|波|山|自然|風|星|nature|forest|ocean/i.test(corpus)) moods.push("nature");
  if (/ささやき|囁|低語|耳語|whisper|voice/i.test(corpus)) moods.push("whisper");
  return moods.length ? [...new Set(moods)] : ["night"];
}

function normaliseAsmrDailyWork(raw: RawAsmrDailyWork, index: number): Work {
  const id = String(raw.id || `ASMR-DAILY-${index + 1}`);
  const tags = (raw.genres ?? [])
    .map((genre) => genre?.name)
    .filter((name): name is string => Boolean(name))
    .slice(0, 6);
  const cvs = (raw.artists ?? [])
    .map((artist) => artist?.name)
    .filter((name): name is string => Boolean(name))
    .slice(0, 4);
  const circle = raw.maker?.name || ASMR_DAILY_NAME;
  const ageCategory = Number(raw.age_category) || 1;
  const ageRating = ageCategory >= 3 ? "ADULT" : ageCategory === 2 ? "R15" : undefined;
  const title = raw.name || `ASMR Daily ${id}`;
  const art = ART[hashIndex(id, ART.length)];

  return {
    id,
    title,
    subtitle: cvs.length ? `CV. ${cvs.join(" / ")}` : circle,
    circle,
    cvs,
    tags,
    moods: deriveMoods(tags),
    duration: 0,
    releaseDate: raw.release_date || new Date().toISOString().slice(0, 10),
    rating: Number(raw.rating) || 0,
    reviewCount: Number(raw.review_count || raw.rating_count) || 0,
    sourceUrl: `${ASMR_DAILY_BASE}/works/${encodeURIComponent(id)}`,
    audio: `/audio/ambient-${String(hashIndex(id + "audio", 12) + 1).padStart(2, "0")}.wav`,
    coverUrl: coverUrl(raw.image_main || raw.image_thumb),
    art,
    ageRating,
    description:
      raw.intro ||
      `来自 ASMR Daily 的作品，收录 ${tags.slice(0, 2).join("、") || "ASMR"}。`,
    source: "asmr-daily",
  };
}

function aggregateTags(works: Work[]): TagCategory[] {
  const counts = new Map<string, number>();
  for (const work of works) {
    for (const tag of work.tags) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh"))
    .slice(0, 18)
    .map(([label, count]) => ({ id: label, label, count }));
}

export function buildAsmrDailyLibrary(rawWorks: RawAsmrDailyWork[]): LibraryData {
  const works = rawWorks.slice(0, MAX_WORKS).map(normaliseAsmrDailyWork);
  const playlists: Playlist[] = PLAYLIST_BLUEPRINTS.map((blueprint) => ({
    ...blueprint,
    curator: ASMR_DAILY_NAME,
    workIds: blueprint.picks
      .map((pick) => works[pick % Math.max(works.length, 1)]?.id)
      .filter((id): id is string => Boolean(id)),
  }));

  return {
    source: {
      name: ASMR_DAILY_NAME,
      url: ASMR_DAILY_BASE,
      api: `${ASMR_DAILY_BASE}/api/works`,
      fetchedAt: new Date().toISOString(),
      mode: "live",
      transport: "asmr-daily-token",
      note: "通过 ASMR Daily Token 读取作品元数据；音轨优先尝试 asmr.one，失败时使用本地试听。",
    },
    works,
    playlists,
    moods: MOODS,
    tags: aggregateTags(works),
    hasAdult: works.some((work) => Boolean(work.ageRating)),
  };
}

export function readAsmrDailyToken(): string {
  try {
    return localStorage.getItem(ASMR_DAILY_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function readAsmrDailyUser(): string {
  try {
    return localStorage.getItem(ASMR_DAILY_USER_KEY) || "";
  } catch {
    return "";
  }
}

export function saveAsmrDailySession(token: string, username = "") {
  const value = token.trim();
  try {
    localStorage.setItem(ASMR_DAILY_TOKEN_KEY, value);
    if (username) localStorage.setItem(ASMR_DAILY_USER_KEY, username);
  } catch {
    /* The current session can still use the token in memory. */
  }
}

export function clearAsmrDailySession() {
  try {
    localStorage.removeItem(ASMR_DAILY_TOKEN_KEY);
    localStorage.removeItem(ASMR_DAILY_USER_KEY);
  } catch {
    /* Ignore unavailable storage. */
  }
}

export function readAsmrDailyCachedLibrary(): LibraryData | null {
  try {
    const data = JSON.parse(localStorage.getItem(ASMR_DAILY_LIBRARY_KEY) || "null");
    if (!data || !Array.isArray(data.works) || !data.works.length) return null;
    return {
      ...data,
      source: {
        ...data.source,
        mode: "curated-snapshot",
        note: "上次读取的 ASMR Daily 作品缓存；联网后会尝试刷新。",
      },
    };
  } catch {
    return null;
  }
}

export function readActiveSourceId(): LibrarySourceId {
  try {
    return localStorage.getItem(ACTIVE_SOURCE_KEY) === "asmr-daily"
      ? "asmr-daily"
      : "asmr-one";
  } catch {
    return "asmr-one";
  }
}

export function saveActiveSourceId(id: LibrarySourceId) {
  try {
    localStorage.setItem(ACTIVE_SOURCE_KEY, id);
  } catch {
    /* Ignore unavailable storage. */
  }
}

async function asmrDailyApi(path: string, token: string, init?: RequestInit) {
  const response = await fetch(`${ASMR_DAILY_BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  if (response.status === 401) {
    throw new Error("ASMR Daily Token 无效或已过期");
  }
  if (!response.ok) {
    throw new Error(`ASMR Daily HTTP ${response.status}`);
  }
  return response.json();
}

export async function testAsmrDailyToken(token: string): Promise<number> {
  const payload = await asmrDailyApi(
    "/api/works?page=1&page_size=1&order=created_at",
    token,
  );
  return Number(payload?.pagination?.total) || 0;
}

export async function loginAsmrDaily(
  username: string,
  password: string,
): Promise<{ token: string; username: string }> {
  const response = await fetch(`${ASMR_DAILY_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (response.status === 401) throw new Error("用户名或密码不正确");
  if (!response.ok) throw new Error(`ASMR Daily 登录失败（HTTP ${response.status}）`);
  const payload = (await response.json()) as { token?: string; user?: { name?: string } };
  if (!payload?.token) throw new Error("ASMR Daily 没有返回 Token");
  return { token: payload.token, username: payload.user?.name || username };
}

export async function fetchAsmrDailyLibrary(token: string): Promise<LibraryData> {
  const collected: RawAsmrDailyWork[] = [];
  const seen = new Set<string>();
  let total = 0;

  for (let page = 1; page <= MAX_PAGES && collected.length < MAX_WORKS; page += 1) {
    const payload = (await asmrDailyApi(
      `/api/works?page=${page}&page_size=${PAGE_SIZE}&order=created_at`,
      token,
    )) as AsmrDailyWorksResponse;
    const items = Array.isArray(payload?.data) ? payload.data : [];
    const actualPageSize = Number(payload?.pagination?.page_size) || PAGE_SIZE;
    total = Number(payload?.pagination?.total) || total;
    for (const item of items) {
      const id = String(item.id || "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      collected.push(item);
      if (collected.length >= MAX_WORKS) break;
    }
    if (!items.length) break;
    if (total > 0 && collected.length >= total) break;
    if (items.length < actualPageSize) break;
  }

  if (!collected.length) throw new Error("ASMR Daily 没有返回作品");
  return buildAsmrDailyLibrary(collected);
}
