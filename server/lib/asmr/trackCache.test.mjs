import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createTrackCache } from "./trackCache.mjs";

function tempCache(t) {
  const dir = mkdtempSync(join(tmpdir(), "yoru-track-cache-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function trackData(id) {
  return { workId: id, tracks: [{ id: `track-${id}`, title: "Track" }] };
}

test("track memory cache expires entries and evicts the least recently used id", (t) => {
  let now = Date.now();
  const cache = createTrackCache({ dir: tempCache(t), now: () => now });
  cache.remember("1", trackData("1"), { persist: false });
  assert.equal(cache.get("1").data.workId, "1");

  now += 5 * 60_000 + 1;
  assert.equal(cache.get("1"), null);

  for (let id = 1; id <= 130; id++) {
    cache.remember(String(id), trackData(String(id)), { persist: false });
  }
  const stats = cache.stats();
  assert.equal(stats.memoryEntries, 128);
  assert.equal(stats.evictions, 2);
  assert.equal(cache.get("1"), null);
  assert.equal(cache.get("130").data.workId, "130");
});

test("track disk cache distinguishes fresh data from stale fallback data", (t) => {
  const dir = tempCache(t);
  let now = Date.now();
  const cache = createTrackCache({ dir, now: () => now });
  cache.remember("42", trackData("42"));

  const restarted = createTrackCache({ dir, now: () => now });
  assert.equal(restarted.get("42").data.workId, "42");
  assert.equal(restarted.stats().diskHits, 1);

  now += 24 * 60 * 60_000;
  const stale = restarted.get("42");
  assert.equal(stale.stale, true);
  restarted.promoteStale("42", stale.data);
  assert.equal(restarted.stats().staleDiskFallbacks, 1);
  assert.equal(restarted.get("42").stale, false);
  assert.equal(restarted.stats().memoryHits, 1);
  assert.equal(restarted.stats().hits + restarted.stats().misses, 3);
});

test("track disk cache removes expired files and enforces its file cap", (t) => {
  const dir = tempCache(t);
  const old = new Date(Date.now() - 8 * 24 * 60 * 60_000);
  for (let id = 1; id <= 501; id++) {
    writeFileSync(join(dir, `${id}.json`), "{}");
  }
  utimesSync(join(dir, "1.json"), old, old);

  const cache = createTrackCache({ dir });
  cache.remember("999", trackData("999"));
  const files = readdirSync(dir).filter((name) => /^\d+\.json$/.test(name));
  assert.equal(files.length, 500);
  assert.equal(files.includes("1.json"), false);
  assert.equal(files.includes("999.json"), true);
});
