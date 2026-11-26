const API_HOSTS = new Set([
  "api.asmr-200.com",
  "api.asmr.one",
  "api.asmr-100.com",
  "api.asmr-300.com",
]);
const MAX_SUBTITLE_BYTES = 1_000_000;
const MAX_SUBTITLE_REDIRECTS = 3;
const ALLOWED_SUBTITLE_TYPES = new Set([
  "application/octet-stream",
  "application/x-subrip",
  "application/srt",
  "application/vtt",
  "application/lrc",
]);

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "asmr.one" ||
    host.endsWith(".asmr.one") ||
    host === "kiko-play-niptan.one" ||
    host.endsWith(".kiko-play-niptan.one") ||
    API_HOSTS.has(host)
  );
}

function parseHttpsUrl(value: string, base?: string | URL): URL {
  const url = new URL(value, base);
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error("媒体地址必须使用 HTTPS，且不能包含凭据或自定义端口");
  }
  if (!isAllowedHost(url.hostname)) throw new Error("不允许的媒体域名");
  return url;
}

export function safeMediaUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    return parseHttpsUrl(value, "https://api.asmr-200.com").href;
  } catch {
    return undefined;
  }
}

function parseSubtitleUrl(value: string, base?: string | URL): URL {
  const url = parseHttpsUrl(value, base);
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    throw new Error("无效的字幕地址");
  }
  if (!/\.(vtt|srt|lrc|txt)$/i.test(pathname)) throw new Error("不支持的字幕格式");
  return url;
}

async function readLimitedText(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_SUBTITLE_BYTES) throw new Error("字幕文件过大");
  const contentType = response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (
    contentType &&
    !(contentType.startsWith("text/") && contentType !== "text/html") &&
    !ALLOWED_SUBTITLE_TYPES.has(contentType)
  ) {
    throw new Error("不支持的字幕内容类型");
  }

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

export async function fetchSafeSubtitleText(rawUrl: string): Promise<string> {
  let url = parseSubtitleUrl(rawUrl);
  const controller = new AbortController();
  let timer = 0;
  const deadline = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      controller.abort();
      reject(new Error("字幕请求超时"));
    }, 15_000);
  });

  try {
    for (let redirects = 0; redirects <= MAX_SUBTITLE_REDIRECTS; redirects++) {
      const response = await Promise.race([
        fetch(url.href, {
          signal: controller.signal,
          cache: "no-store",
          redirect: "manual",
          headers: {
            Origin: "https://asmr.one",
            Referer: "https://asmr.one/",
          },
        }),
        deadline,
      ]);
      if (response.url) parseSubtitleUrl(response.url);

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => {});
        if (!location) throw new Error("字幕重定向缺少目标地址");
        if (redirects === MAX_SUBTITLE_REDIRECTS) throw new Error("字幕重定向次数过多");
        url = parseSubtitleUrl(location, url);
        continue;
      }
      if (!response.ok) throw new Error(`字幕 HTTP ${response.status}`);
      return await Promise.race([readLimitedText(response), deadline]);
    }
    throw new Error("字幕重定向次数过多");
  } finally {
    window.clearTimeout(timer);
  }
}
