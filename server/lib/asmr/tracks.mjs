import { normaliseTrackTree } from "../../../shared/asmrCore.mjs";
import { createTrackCache } from "./trackCache.mjs";
import { fetchJson, MIRRORS, RELAYS, RELAY_MIRRORS } from "./transport.mjs";

export { normaliseTrackTree };

const trackCache = createTrackCache();

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
