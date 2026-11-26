import { buildLibrary, cleanTitle, TARGET_WORKS } from "./library.mjs";
import { fetchJson, MIRRORS, RELAYS, RELAY_MIRRORS } from "./transport.mjs";

export const MIN_SNAPSHOT_WORKS = 300;
const SYNC_DEADLINE_MS = 150_000;
const ROUTE_DEADLINE_MS = 45_000;

export function validateSnapshot(snapshot) {
  const works = Array.isArray(snapshot?.works) ? snapshot.works : [];
  if (works.length < MIN_SNAPSHOT_WORKS) {
    throw new Error(`snapshot has only ${works.length} works; minimum is ${MIN_SNAPSHOT_WORKS}`);
  }

  const ids = new Set();
  for (const work of works) {
    const id = String(work?.id || "");
    if (!id) throw new Error("snapshot contains a work without an id");
    if (ids.has(id)) throw new Error(`snapshot contains duplicate work id ${id}`);
    ids.add(id);
  }

  if (!Array.isArray(snapshot.tags)) throw new Error("snapshot tags must be an array");
  const fetchedAt = Date.parse(snapshot.source?.fetchedAt || "");
  if (!Number.isFinite(fetchedAt)) throw new Error("snapshot source.fetchedAt is invalid");
  return works.length;
}

async function collectWorks(base, transport, deadline) {
  const collected = [];
  const seenIds = new Set();
  const seenTitles = new Set();

  for (let page = 1; page <= 40 && collected.length < TARGET_WORKS; page++) {
    if (Date.now() >= deadline) {
      if (collected.length >= MIN_SNAPSHOT_WORKS) return collected;
      throw new Error(`snapshot deadline exceeded with ${collected.length} works`);
    }

    const url = `${base}/api/works?order=release&sort=desc&page=${page}&subtitle=0`;
    const remaining = deadline - Date.now();
    let payload;
    try {
      payload = await fetchJson(url, {
        ...transport,
        timeout: Math.min(transport.timeout ?? 9000, remaining),
      });
    } catch (error) {
      if (collected.length >= MIN_SNAPSHOT_WORKS) return collected;
      if (Date.now() >= deadline) {
        throw new Error(`snapshot deadline exceeded with ${collected.length} works: ${error.message}`);
      }
      throw error;
    }
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

async function scrapeMirror(base, transport, deadline) {
  const collected = await collectWorks(base, transport, deadline);
  if (collected.length < MIN_SNAPSHOT_WORKS) {
    throw new Error(`Only ${collected.length} works found; minimum is ${MIN_SNAPSHOT_WORKS}`);
  }
  return collected;
}

export async function scrapeAsmrOne() {
  const errors = [];
  const deadline = Date.now() + SYNC_DEADLINE_MS;
  const routes = [
    ...RELAY_MIRRORS.map((mirror) => ({ mirror, relay: RELAYS[0], timeout: 20_000 })),
    ...MIRRORS.map((mirror) => ({ mirror, relay: null, timeout: 6000 })),
    ...RELAYS.slice(1).flatMap((relay) =>
      RELAY_MIRRORS.map((mirror) => ({ mirror, relay, timeout: 20_000 })),
    ),
  ];

  for (const route of routes) {
    if (Date.now() >= deadline) break;
    const routeDeadline = Math.min(deadline, Date.now() + ROUTE_DEADLINE_MS);
    try {
      const rawWorks = await scrapeMirror(
        route.mirror,
        { relay: route.relay, timeout: route.timeout, attempts: 1 },
        routeDeadline,
      );
      return buildLibrary(rawWorks, route.mirror, route.relay?.name ?? "direct");
    } catch (error) {
      errors.push(`${route.relay?.name ?? "direct"} ${new URL(route.mirror).hostname}: ${error.message}`);
    }
  }

  throw new Error(`asmr.one 暂时无法连接（${errors.join("；")}）`);
}
