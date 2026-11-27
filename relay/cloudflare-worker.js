/**
 * YORU read-only relay for Cloudflare Workers.
 *
 * Deploy this file as a Worker, then paste the Worker URL into
 * YORU → avatar → 网络与数据源. The Worker only proxies asmr.one metadata and
 * small subtitle files. Audio is never proxied: the app still streams it from
 * the official media CDN.
 *
 * Usage: https://<worker-host>/?url=<encoded https://api.asmr-200.com/...>
 */

const API_HOSTS = new Set([
  "api.asmr-200.com",
  "api.asmr.one",
  "api.asmr-100.com",
  "api.asmr-300.com",
]);
const FALLBACK_BASE = "https://asmr.furina.in/api";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Range",
  "Access-Control-Expose-Headers":
    "Content-Length, Content-Range, Content-Type, X-Yoru-Relay-Route",
};

function fallbackUrl(target) {
  if (!API_HOSTS.has(target.hostname.toLowerCase())) return null;
  return `${FALLBACK_BASE}${target.pathname.replace(/^\/api/, "")}${target.search}`;
}

const MAX_REDIRECTS = 3;

function isAllowed(target) {
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    target.port
  ) {
    return false;
  }
  const host = target.hostname.toLowerCase();
  if (API_HOSTS.has(host)) {
    return target.pathname.startsWith("/api/");
  }
  // Subtitle/text assets are small and useful when the media CDN is also
  // restricted. Do not allow audio files through the Worker.
  if (host.endsWith(".kiko-play-niptan.one")) {
    return /\.(vtt|srt|lrc|txt)$/i.test(target.pathname);
  }
  return false;
}

async function fetchWithValidatedRedirects(initialUrl, options, timeoutMs) {
  let current = new URL(initialUrl);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const res = await fetch(current.href, {
      ...options,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      await res.body?.cancel().catch(() => {});
      if (!location || redirects === MAX_REDIRECTS) {
        throw new Error("invalid_or_excessive_redirect");
      }
      const next = new URL(location, current);
      if (!isAllowed(next) && next.origin !== new URL(FALLBACK_BASE).origin) {
        throw new Error("forbidden_redirect_target");
      }
      current = next;
      continue;
    }
    return res;
  }
  throw new Error("too_many_redirects");
}

async function fetchUpstream(target, method) {
  const options = {
    method,
    headers: {
      Accept: "application/json, text/plain, */*",
      Origin: "https://asmr.one",
      Referer: "https://asmr.one/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
    cf: { cacheTtl: 300, cacheEverything: true },
  };

  const directTimeout = API_HOSTS.has(target.hostname.toLowerCase()) ? 4_000 : 20_000;
  try {
    const direct = await fetchWithValidatedRedirects(target.href, options, directTimeout);
    if (direct.ok) return { response: direct, route: "direct" };
  } catch {
    /* Try the built-in read-only fallback below. */
  }

  const fallback = fallbackUrl(target);
  if (!fallback) throw new Error("upstream_unreachable");
  return {
    response: await fetchWithValidatedRedirects(fallback, options, 20_000),
    route: "fallback",
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(request, _env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "method_not_allowed" }, 405);
    }

    const requestUrl = new URL(request.url);
    if (requestUrl.pathname === "/health") {
      return json({ ok: true, service: "yoru-relay", fallback: FALLBACK_BASE });
    }

    const rawTarget = requestUrl.searchParams.get("url");
    if (!rawTarget) {
      return json({ error: "missing_url" }, 400);
    }

    let target;
    try {
      target = new URL(rawTarget);
    } catch {
      return json({ error: "invalid_url" }, 400);
    }
    if (!isAllowed(target)) {
      return json({ error: "forbidden_target" }, 403);
    }

    const cacheKey = new Request(
      `https://yoru-relay.cache/${encodeURIComponent(target.href)}`,
      { method: "GET" },
    );
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    let upstream;
    let route = "direct";
    try {
      const result = await fetchUpstream(target, request.method);
      upstream = result.response;
      route = result.route;
    } catch (error) {
      return json({ error: "upstream_unreachable", detail: String(error) }, 502);
    }

    const headers = new Headers(upstream.headers);
    headers.delete("set-cookie");
    headers.delete("content-encoding");
    headers.delete("content-length");
    for (const [key, value] of Object.entries(CORS)) headers.set(key, value);
    headers.set("Cache-Control", "public, max-age=300, s-maxage=300");
    headers.set("X-Yoru-Relay-Route", route);

    const response = new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });

    if (upstream.ok && request.method === "GET") {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }
    return response;
  },
};
