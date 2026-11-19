#!/usr/bin/env node
/**
 * Self-check a YORU relay or a static snapshot.
 *
 *   node relay/check-relay.mjs https://your-worker.workers.dev
 *   node relay/check-relay.mjs http://192.168.1.20:8788
 *   node relay/check-relay.mjs https://raw.githubusercontent.com/user/repo/main/data/live-seed.json
 *
 * Exits with 0 when the source returns a usable works list; 1 otherwise.
 */

const input = process.argv[2];
if (!input) {
  console.error("用法: node relay/check-relay.mjs <中继地址或快照 JSON 地址>");
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(input);
} catch {
  console.error("地址无效，请填写 http(s) 地址");
  process.exit(1);
}
if (!/^https?:$/.test(parsed.protocol)) {
  console.error("只支持 http(s) 地址");
  process.exit(1);
}

const SNAPSHOT = /\.json$/i.test(parsed.pathname) || parsed.searchParams.get("snapshot") === "1";

function buildRelayUrl(base, target) {
  if (base.includes("{url}")) return base.replace("{url}", encodeURIComponent(target));
  const baseUrl = new URL(base);
  if (baseUrl.searchParams.has("url")) baseUrl.searchParams.delete("url");
  const cleanBase = baseUrl.toString().replace(/\/+$/, "");
  if (/\/api\/?$/.test(baseUrl.pathname)) {
    const targetUrl = new URL(target);
    return `${cleanBase}${targetUrl.pathname.replace(/^\/api/, "")}${targetUrl.search}`;
  }
  return `${cleanBase}?url=${encodeURIComponent(target)}`;
}

async function getText(url, timeout = 25_000) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json, text/plain, */*" },
    signal: AbortSignal.timeout(timeout),
  });
  const text = await response.text();
  return { response, text };
}

function parsePayload(text) {
  const payload = JSON.parse(text);
  if (typeof payload?.contents === "string") {
    return JSON.parse(payload.contents);
  }
  return payload;
}

function countNodeTypes(nodes, counts = { audio: 0, text: 0, folder: 0 }) {
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const type = String(node?.type || "other");
    counts[type] = (counts[type] || 0) + 1;
    if (Array.isArray(node?.children)) countNodeTypes(node.children, counts);
  }
  return counts;
}

async function main() {
  const started = Date.now();
  if (SNAPSHOT) {
    const { response, text } = await getText(input);
    const data = parsePayload(text);
    const works = Array.isArray(data?.works) ? data.works : [];
    if (!response.ok || !works.length) {
      throw new Error(`快照不可用：HTTP ${response.status}，作品 ${works.length} 件`);
    }
    console.log(`✓ 快照可用  HTTP ${response.status}  ${Date.now() - started}ms`);
    console.log(`  作品 ${works.length} 件，来源 ${data?.source?.mode || "unknown"}`);
    console.log(`  抓取时间 ${data?.source?.fetchedAt || "unknown"}`);
    console.log(`  前三个 ${works.slice(0, 3).map((work) => work.id || work.source_id).join(", ")}`);
    return;
  }

  const worksTarget =
    "https://api.asmr-200.com/api/works?order=release&sort=desc&page=1&subtitle=0";
  const worksUrl = buildRelayUrl(input, worksTarget);
  const worksResult = await getText(worksUrl);
  const worksPayload = parsePayload(worksResult.text);
  const works = Array.isArray(worksPayload?.works) ? worksPayload.works : [];
  if (!worksResult.response.ok || !works.length) {
    throw new Error(
      `中继不可用：HTTP ${worksResult.response.status}，作品 ${works.length} 件`,
    );
  }
  const route = worksResult.response.headers.get("x-yoru-relay-route") || "unknown";
  console.log(`✓ 中继可用  HTTP ${worksResult.response.status}  ${Date.now() - started}ms`);
  console.log(`  线路 ${route}，本页 ${works.length} 件作品`);

  const tracksStarted = Date.now();
  const tracksUrl = buildRelayUrl(
    input,
    "https://api.asmr-200.com/api/tracks/1683351?v=2",
  );
  try {
    const tracksResult = await getText(tracksUrl);
    const tracksPayload = parsePayload(tracksResult.text);
    if (!tracksResult.response.ok || !Array.isArray(tracksPayload)) {
      throw new Error(`HTTP ${tracksResult.response.status}`);
    }
    const counts = countNodeTypes(tracksPayload);
    console.log(
      `✓ 音轨可用  ${Date.now() - tracksStarted}ms  audio=${counts.audio}  text=${counts.text}`,
    );
  } catch (error) {
    console.log(`△ 音轨检查失败：${error.message}`);
    console.log("  作品列表可用，但当前作品可能没有公开音轨");
  }

  try {
    const healthUrl = new URL(parsed.origin + "/health");
    const health = await getText(healthUrl.href, 8_000);
    if (health.response.ok) {
      console.log(`✓ /health  ${health.text.trim()}`);
    }
  } catch {
    console.log("△ /health 未提供（不影响中继使用）");
  }

  console.log(`\n在 App 内填入：${input.replace(/\/+$/, "")}`);
  console.log("路径：头像 → 网络与数据源 → 自建中继 / 静态快照 → 测试连接");
}

main().catch((error) => {
  console.error(`✗ 自检失败：${error.message}`);
  process.exit(1);
});
