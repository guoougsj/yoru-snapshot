/**
 * Minimal self-hosted relay for a VPS, NAS, or a computer that can reach
 * asmr.one (for example through a VPN). Start it with:
 *
 *   node relay/node-relay.mjs
 *
 * Then open YORU → avatar → 网络与数据源 and enter:
 *   http://<this-machine-LAN-IP>:8788
 *
 * It only proxies asmr.one metadata and subtitle/text files, never audio.
 */

import { createServer } from "node:http";

const port = Number(process.env.PORT) || 8788;
const CACHE_TTL = 5 * 60_000;
const API_HOSTS = new Set([
  "api.asmr-200.com",
  "api.asmr.one",
  "api.asmr-100.com",
  "api.asmr-300.com",
]);
const FALLBACK_BASE = "https://asmr.furina.in/api";

const cache = new Map();

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Range",
    "Access-Control-Expose-Headers":
      "Content-Length, Content-Range, Content-Type, X-Yoru-Relay-Route",
  };
}

function fallbackUrl(target) {
  if (!API_HOSTS.has(target.hostname.toLowerCase())) return null;
  return `${FALLBACK_BASE}${target.pathname.replace(/^\/api/, "")}${target.search}`;
}

async function fetchUpstream(target) {
  const options = {
    redirect: "follow",
    headers: {
      Accept: "application/json, text/plain, */*",
      Origin: "https://asmr.one",
      Referer: "https://asmr.one/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(20_000),
  };

  const directTimeout = API_HOSTS.has(target.hostname.toLowerCase()) ? 4_000 : 20_000;
  try {
    const direct = await fetch(target.href, {
      ...options,
      signal: AbortSignal.timeout(directTimeout),
    });
    if (direct.ok) return { response: direct, route: "direct" };
  } catch {
    /* Try the built-in read-only fallback below. */
  }

  const fallback = fallbackUrl(target);
  if (!fallback) throw new Error("upstream_unreachable");
  return {
    response: await fetch(fallback, {
      ...options,
      signal: AbortSignal.timeout(20_000),
    }),
    route: "fallback",
  };
}

function allowed(target) {
  const host = target.hostname.toLowerCase();
  if (API_HOSTS.has(host)) return target.pathname.startsWith("/api/");
  if (host.endsWith(".kiko-play-niptan.one")) {
    return /\.(vtt|srt|lrc|txt)$/i.test(target.pathname);
  }
  return false;
}

const server = createServer(async (request, response) => {
  const headers = corsHeaders();
  if (request.method === "OPTIONS") {
    response.writeHead(204, headers);
    response.end();
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { ...headers, "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }

  const requestUrl = new URL(request.url || "/", "http://localhost");
  if (requestUrl.pathname === "/health") {
    response.writeHead(200, { ...headers, "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        ok: true,
        service: "yoru-node-relay",
        fallback: FALLBACK_BASE,
      }),
    );
    return;
  }

  const rawTarget = requestUrl.searchParams.get("url");
  let target;
  try {
    target = new URL(String(rawTarget || ""));
  } catch {
    response.writeHead(400, { ...headers, "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "invalid_url" }));
    return;
  }
  if (!/^https?:$/.test(target.protocol) || !allowed(target)) {
    response.writeHead(403, { ...headers, "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "forbidden_target" }));
    return;
  }

  const cached = cache.get(target.href);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    response.writeHead(cached.status, {
      ...headers,
      "Content-Type": cached.type,
      "Cache-Control": "public, max-age=300",
      "X-Yoru-Relay-Route": cached.route,
    });
    response.end(cached.body);
    return;
  }

  try {
    const { response: upstream, route } = await fetchUpstream(target);
    const body = Buffer.from(await upstream.arrayBuffer());
    const type = upstream.headers.get("content-type") || "application/octet-stream";
    if (upstream.ok) {
      cache.set(target.href, {
        at: Date.now(),
        status: upstream.status,
        type,
        body,
        route,
      });
    }
    response.writeHead(upstream.status, {
      ...headers,
      "Content-Type": type,
      "Cache-Control": "public, max-age=300",
      "X-Yoru-Relay-Route": route,
    });
    response.end(body);
  } catch (error) {
    response.writeHead(502, { ...headers, "Content-Type": "application/json" });
    response.end(
      JSON.stringify({ error: "upstream_unreachable", detail: String(error) }),
    );
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`YORU relay listening on http://0.0.0.0:${port}`);
  console.log(`Health: http://127.0.0.1:${port}/health`);
});
