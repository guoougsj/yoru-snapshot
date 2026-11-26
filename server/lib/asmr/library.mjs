import { createHash } from "node:crypto";

export const TARGET_WORKS = 500;

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
  const corpus = [raw.title, ...(raw.tags ?? []).map((tag) => tag?.name ?? "")].join(" ");
  const picks = MOOD_RULES.filter(([, rule]) => rule.test(corpus)).map(([id]) => id);
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

export function buildLibrary(rawWorks, mirror, transport) {
  const works = rawWorks.slice(0, TARGET_WORKS).map(normaliseWork);
  const playlists = PLAYLIST_BLUEPRINTS.map((blueprint) => ({
    ...blueprint,
    curator: "YORU 编辑部",
    workIds: blueprint.picks.map((pick) => works[pick % works.length]?.id).filter(Boolean),
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
