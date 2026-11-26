import assert from "node:assert/strict";
import test from "node:test";
import { MIN_SNAPSHOT_WORKS, scrapeAsmrOne, validateSnapshot } from "./snapshot.mjs";

function makeWorks(count, start = 1) {
  return Array.from({ length: count }, (_, index) => ({
    source_id: `RJ${String(start + index).padStart(8, "0")}`,
    title: `Work ${start + index}`,
    tags: [],
  }));
}

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function requestedPage(rawUrl) {
  const url = new URL(rawUrl);
  const target = url.searchParams.get("url");
  return Number(new URL(target || url.href).searchParams.get("page"));
}

function installClockAndFetch(t, fetchImpl) {
  const originalNow = Date.now;
  const originalFetch = globalThis.fetch;
  let now = 0;
  Date.now = () => now;
  globalThis.fetch = async (...args) => fetchImpl(...args, (elapsed) => {
    now += elapsed;
  });
  t.after(() => {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
  });
  return () => now;
}

test("scrape stops at the deadline after a partial first page", async (t) => {
  let calls = 0;
  const now = installClockAndFetch(t, async (_url, _options, advance) => {
    calls += 1;
    if (calls === 1) return jsonResponse({ works: makeWorks(12) });
    advance(5000);
    throw new Error("timeout");
  });

  await assert.rejects(() => scrapeAsmrOne(), /无法连接|deadline|Only/i);
  assert.ok(now() <= 150_000, `sync exceeded its deadline: ${now()}ms`);
});

test("scrape rejects snapshots below the workflow minimum and tries another route", async (t) => {
  let calls = 0;
  installClockAndFetch(t, async (url) => {
    calls += 1;
    const page = requestedPage(url);
    return jsonResponse({ works: page === 1 ? makeWorks(12) : [] });
  });

  await assert.rejects(() => scrapeAsmrOne(), /Only 12 works found/i);
  assert.ok(calls > 2, "scrape returned the first undersized snapshot without fallback");
});

test("scrape keeps a valid partial snapshot without exhausting the deadline", async (t) => {
  const now = installClockAndFetch(t, async (url, _options, advance) => {
    const page = requestedPage(url);
    if (page <= 15) return jsonResponse({ works: makeWorks(20, (page - 1) * 20 + 1) });
    advance(20_000);
    throw new Error("timeout");
  });

  const library = await scrapeAsmrOne();
  assert.equal(library.works.length, MIN_SNAPSHOT_WORKS);
  assert.ok(now() <= 150_000, `sync exceeded its deadline: ${now()}ms`);
});

function makeSnapshot(count) {
  return {
    source: { fetchedAt: "2026-11-26T00:00:00.000Z" },
    tags: [],
    works: Array.from({ length: count }, (_, index) => ({ id: `RJ${index + 1}` })),
  };
}

test("snapshot validation enforces the shared minimum", () => {
  assert.throws(
    () => validateSnapshot(makeSnapshot(MIN_SNAPSHOT_WORKS - 1)),
    /minimum is 300/,
  );
  assert.equal(validateSnapshot(makeSnapshot(MIN_SNAPSHOT_WORKS)), MIN_SNAPSHOT_WORKS);
});

test("snapshot validation rejects duplicate work ids", () => {
  const snapshot = makeSnapshot(MIN_SNAPSHOT_WORKS);
  snapshot.works[1].id = snapshot.works[0].id;
  assert.throws(() => validateSnapshot(snapshot), /duplicate work id/);
});

test("snapshot validation rejects missing ids and invalid metadata", () => {
  const missingId = makeSnapshot(MIN_SNAPSHOT_WORKS);
  missingId.works[0].id = "";
  assert.throws(() => validateSnapshot(missingId), /without an id/);

  const invalidDate = makeSnapshot(MIN_SNAPSHOT_WORKS);
  invalidDate.source.fetchedAt = "invalid";
  assert.throws(() => validateSnapshot(invalidDate), /fetchedAt is invalid/);

  const invalidTags = makeSnapshot(MIN_SNAPSHOT_WORKS);
  invalidTags.tags = {};
  assert.throws(() => validateSnapshot(invalidTags), /tags must be an array/);
});
