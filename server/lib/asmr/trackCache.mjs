import { mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "./atomicWrite.mjs";

const DEFAULT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "cache", "tracks");
const MAX_MEMORY_ENTRIES = 128;
const MEMORY_TTL = 5 * 60_000;
const DISK_TTL = 24 * 60 * 60_000;
const DISK_RETENTION = 7 * 24 * 60 * 60_000;
const MAX_DISK_FILES = 500;

export function createTrackCache({ dir = DEFAULT_DIR, now = Date.now } = {}) {
  const memory = new Map();
  const metrics = {
    hits: 0,
    misses: 0,
    memoryHits: 0,
    diskHits: 0,
    staleDiskFallbacks: 0,
    writes: 0,
    writeFailures: 0,
    evictions: 0,
  };

  function readMemory(id) {
    const entry = memory.get(id);
    if (!entry) return undefined;
    if (entry.expires <= now()) {
      memory.delete(id);
      return undefined;
    }
    memory.delete(id);
    memory.set(id, entry);
    return entry.data;
  }

  function writeMemory(id, data) {
    memory.delete(id);
    memory.set(id, { expires: now() + MEMORY_TTL, data });
    while (memory.size > MAX_MEMORY_ENTRIES) {
      memory.delete(memory.keys().next().value);
      metrics.evictions += 1;
    }
  }

  function readDisk(id) {
    try {
      const data = JSON.parse(readFileSync(join(dir, `${id}.json`), "utf8"));
      const age = now() - Number(data.cachedAt || 0);
      if (
        data?.version === 3 &&
        Array.isArray(data.tracks) &&
        data.tracks.length > 0 &&
        age >= 0 &&
        age < DISK_RETENTION
      ) {
        return { data, stale: age >= DISK_TTL };
      }
    } catch {
      return null;
    }
    return null;
  }

  function maintainDisk() {
    try {
      const files = readdirSync(dir)
        .filter((name) => /^\d+\.json$/.test(name))
        .map((name) => {
          const path = join(dir, name);
          try {
            return { path, mtimeMs: statSync(path).mtimeMs };
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      const expired = files.filter((file) => now() - file.mtimeMs >= DISK_RETENTION);
      const expiredSet = new Set(expired);
      for (const file of expired) unlinkSync(file.path);
      const remaining = files
        .filter((file) => !expiredSet.has(file))
        .sort((a, b) => a.mtimeMs - b.mtimeMs);
      const overflow = Math.max(0, remaining.length - MAX_DISK_FILES);
      for (const file of remaining.slice(0, overflow)) unlinkSync(file.path);
    } catch (error) {
      metrics.writeFailures += 1;
      console.warn(
        JSON.stringify({ level: "warn", event: "track_cache_cleanup_failed", message: error.message }),
      );
    }
  }

  function writeDisk(id, data) {
    try {
      mkdirSync(dir, { recursive: true });
      writeFileAtomic(
        join(dir, `${id}.json`),
        JSON.stringify({ ...data, version: 3, cachedAt: now() }, null, 2),
      );
      metrics.writes += 1;
      maintainDisk();
    } catch (error) {
      metrics.writeFailures += 1;
      console.warn(
        JSON.stringify({ level: "warn", event: "track_cache_write_failed", message: error.message }),
      );
    }
  }

  return {
    get(id) {
      const cached = readMemory(id);
      if (cached) {
        metrics.hits += 1;
        metrics.memoryHits += 1;
        return { data: cached, stale: false };
      }

      const disk = readDisk(id);
      if (disk && !disk.stale) {
        writeMemory(id, disk.data);
        metrics.hits += 1;
        metrics.diskHits += 1;
        return disk;
      }

      metrics.misses += 1;
      return disk;
    },

    remember(id, data, { persist = true } = {}) {
      writeMemory(id, data);
      if (persist) writeDisk(id, data);
      return data;
    },

    promoteStale(id, data) {
      writeMemory(id, data);
      metrics.staleDiskFallbacks += 1;
      return data;
    },

    stats() {
      let diskEntries = 0;
      try {
        diskEntries = readdirSync(dir).filter((name) => /^\d+\.json$/.test(name)).length;
      } catch {
        diskEntries = 0;
      }
      return { ...metrics, memoryEntries: memory.size, diskEntries };
    },
  };
}
