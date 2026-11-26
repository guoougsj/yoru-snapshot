import { isAllowedMediaHost } from "./mediaHosts.mjs";
import { createTrackCache } from "./trackCache.mjs";
import { fetchJson, MIRRORS, RELAYS, RELAY_MIRRORS } from "./transport.mjs";
const SUBTITLE_FORMATS = new Set(["vtt", "srt", "lrc"]);
const MEDIA_EXTENSIONS = /\.(mp3|wav|flac|m4a|ogg|opus|mp4|mkv|webm|aac)$/i;
const VERSION_RULES = [
  ["试听版", /試聴版|试听版|プレビュー|preview|sample|ダイジェスト|お試し/i],
  ["体验版", /体験版|体验版|trial/i],
  ["完整版", /完整版|完全版|full|本編|本篇|main/i],
];

const trackCache = createTrackCache();

function absoluteMediaUrl(value) {
  if (!value || typeof value !== "string") return undefined;
  try {
    const url = new URL(value, "https://api.asmr-200.com");
    if (
      !isAllowedMediaHost(url.hostname) ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port
    ) {
      return undefined;
    }
    return url.href;
  } catch {
    return undefined;
  }
}

function detectTrackVersion(text) {
  for (const [label, rule] of VERSION_RULES) {
    if (rule.test(text)) return label;
  }
  return "正篇";
}

function logicalTrackTitle(title) {
  return (
    title
      .replace(
        /[（(【\[]?\s*(?:試聴版|试听版|体験版|体验版|プレビュー|preview|sample|ダイジェスト|お試し|完整版|完全版|full)\s*[）)】\]]?/gi,
        "",
      )
      .replace(/\s+/g, " ")
      .trim() || title
  );
}

export function normaliseTrackTree(raw) {
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
    const url = absoluteMediaUrl(node.mediaDownloadUrl) || absoluteMediaUrl(node.mediaStreamUrl);
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
  const walk = (nodes, folders = []) => {
    for (const node of Array.isArray(nodes) ? nodes : []) {
      const nextFolders =
        node?.type === "folder" ? [...folders, String(node.title || "")].filter(Boolean) : folders;
      if (node?.type === "text") {
        collectText(node);
      } else if (node?.type === "audio") {
        audioNodes.push({ node, folders });
      }
      if (Array.isArray(node?.children)) walk(node.children, nextFolders);
    }
  };

  walk(Array.isArray(raw) ? raw : raw?.children);

  for (const { node, folders } of audioNodes) {
    const streamUrl = absoluteMediaUrl(node.mediaStreamUrl);
    const downloadUrl = absoluteMediaUrl(node.mediaDownloadUrl);
    if (!streamUrl && !downloadUrl) continue;

    sequence += 1;
    const rawTitle = String(node.title || `Track ${sequence}`);
    const formatMatch = rawTitle.match(/\.([a-z0-9]{2,5})$/i);
    const format = formatMatch ? formatMatch[1].toLowerCase() : "";
    const title = rawTitle.replace(/\.[a-z0-9]{2,5}$/i, "").trim() || rawTitle;
    const version = detectTrackVersion([...folders, rawTitle].join(" / "));
    const groupKey = logicalTrackTitle(title);
    const subtitle = findSubtitle(rawTitle, title);
    const candidate = {
      id: String(node.hash || node.id || `track-${sequence}`),
      title,
      format,
      version,
      groupKey,
      path: [...folders, rawTitle].join("/"),
      duration: Number(node.duration) || 0,
      size: Number(node.size) || 0,
      streamUrl: streamUrl || downloadUrl,
      downloadUrl: downloadUrl || undefined,
      downloadable: Boolean(downloadUrl),
      subtitleUrl: subtitle?.url,
      subtitleFormat: subtitle?.format,
    };

    const key = `${groupKey}::${version}::${format}`;
    const existing = groups.get(key);
    const candidateScore = candidate.size || Number.MAX_SAFE_INTEGER;
    const existingScore = existing ? existing.size || Number.MAX_SAFE_INTEGER : Infinity;
    if (!existing || candidateScore < existingScore) groups.set(key, candidate);
  }

  return [...groups.values()];
}

export function getTrackCacheStats() {
  return trackCache.stats();
}

export async function fetchTracks(workId) {
  const rawId = String(workId || "").trim();
  if (!/^RJ?\d+$/i.test(rawId)) throw new Error("无效的作品编号");
  const numericId = Number(rawId.replace(/^RJ/i, ""));
  if (!Number.isSafeInteger(numericId) || numericId <= 0) {
    throw new Error("无效的作品编号");
  }
  const id = String(numericId);

  const cached = trackCache.get(id);
  if (cached && !cached.stale) return cached.data;

  const errors = [];
  const deadline = Date.now() + 45_000;
  const url = (base) => `${base}/api/tracks/${id}?v=2`;
  const result = (raw, transport, mirror) => ({
    workId: id,
    tracks: normaliseTrackTree(raw),
    transport,
    mirror,
  });

  try {
    const raw = await fetchJson(url(MIRRORS[0]), { relay: RELAYS[0], timeout: 10_000 });
    return trackCache.remember(id, result(raw, RELAYS[0].name, MIRRORS[0]));
  } catch (error) {
    errors.push(`${RELAYS[0].name} ${new URL(MIRRORS[0]).host}: ${error.message}`);
  }

  for (const mirror of MIRRORS) {
    if (Date.now() >= deadline) break;
    try {
      const raw = await fetchJson(url(mirror), {
        timeout: Math.min(5000, deadline - Date.now()),
      });
      return trackCache.remember(id, result(raw, "direct", mirror));
    } catch (error) {
      errors.push(`direct ${new URL(mirror).host}: ${error.message}`);
    }
  }

  for (const relay of RELAYS) {
    for (const mirror of RELAY_MIRRORS) {
      if (Date.now() >= deadline) break;
      const remaining = deadline - Date.now();
      if (remaining < 100) break;
      try {
        const raw = await fetchJson(url(mirror), {
          relay,
          timeout: Math.min(20_000, remaining),
        });
        return trackCache.remember(id, result(raw, relay.name, mirror));
      } catch (error) {
        errors.push(`${relay.name} ${new URL(mirror).host}: ${error.message}`);
      }
    }
  }

  if (cached) return trackCache.promoteStale(id, cached.data);
  throw new Error(`无法获取作品音轨（${errors.slice(-2).join("；")}）`);
}
