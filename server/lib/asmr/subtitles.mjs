import { isAllowedMediaHost } from "./mediaHosts.mjs";
import { USER_AGENTS } from "./transport.mjs";

const MAX_SUBTITLE_BYTES = 1_000_000;
const SUBTITLE_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;
const ALLOWED_CONTENT_TYPES = new Set([
  "application/octet-stream",
  "application/x-subrip",
  "application/srt",
  "application/vtt",
  "application/lrc",
]);

function validateSubtitleUrl(rawUrl) {
  const url = new URL(String(rawUrl || ""));
  if (url.protocol !== "https:") throw new Error("仅支持 HTTPS 字幕地址");
  if (url.username || url.password || url.port) throw new Error("字幕地址不允许凭据或自定义端口");

  if (!isAllowedMediaHost(url.hostname)) throw new Error("不允许的字幕域名");

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    throw new Error("无效的字幕地址");
  }
  if (!/\.(vtt|srt|lrc|txt)$/i.test(pathname)) throw new Error("不支持的字幕格式");
  return url;
}

function validateContentType(response) {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (
    !contentType ||
    (contentType.startsWith("text/") && contentType !== "text/html") ||
    ALLOWED_CONTENT_TYPES.has(contentType)
  ) {
    return;
  }
  throw new Error(`不支持的字幕内容类型 ${contentType}`);
}

async function readLimitedText(response) {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_SUBTITLE_BYTES) throw new Error("字幕文件过大");
  validateContentType(response);

  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_SUBTITLE_BYTES) throw new Error("字幕文件过大");
    return new TextDecoder().decode(bytes);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  let completed = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SUBTITLE_BYTES) throw new Error("字幕文件过大");
      text += decoder.decode(value, { stream: true });
    }
    completed = true;
    return text + decoder.decode();
  } finally {
    if (!completed) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function fetchSubtitleText(rawUrl) {
  let url = validateSubtitleUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUBTITLE_TIMEOUT_MS);

  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
      const response = await fetch(url.href, {
        headers: {
          Origin: "https://asmr.one",
          Referer: "https://asmr.one/",
          "User-Agent": USER_AGENTS[0],
        },
        redirect: "manual",
        signal: controller.signal,
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => {});
        if (!location) throw new Error("字幕重定向缺少目标地址");
        if (redirects === MAX_REDIRECTS) throw new Error("字幕重定向次数过多");
        url = validateSubtitleUrl(new URL(location, url).href);
        continue;
      }

      if (!response.ok) throw new Error(`字幕 HTTP ${response.status}`);
      return await readLimitedText(response);
    }
    throw new Error("字幕重定向次数过多");
  } finally {
    clearTimeout(timeout);
  }
}
