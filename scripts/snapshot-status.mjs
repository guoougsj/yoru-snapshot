#!/usr/bin/env node
/** Report the age of the committed static snapshot without network access. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const SNAPSHOT_ALERT_HOURS = 48;
const HOUR_MS = 60 * 60 * 1000;

function timestamp(value, label) {
  const milliseconds = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(milliseconds)) {
    throw new TypeError(`${label} is invalid`);
  }
  return milliseconds;
}

/** Pure age calculation based on snapshot.source.fetchedAt. */
export function snapshotAgeHours(snapshot, now = Date.now()) {
  const fetchedAt = snapshot?.source?.fetchedAt;
  if (typeof fetchedAt !== "string") {
    throw new TypeError("snapshot.source.fetchedAt is missing or invalid");
  }
  const fetchedAtMs = Date.parse(fetchedAt);
  if (!Number.isFinite(fetchedAtMs)) {
    throw new TypeError("snapshot.source.fetchedAt is missing or invalid");
  }
  return (timestamp(now, "now") - fetchedAtMs) / HOUR_MS;
}

/** Pure freshness decision. Exactly 48 hours old is not yet stale. */
export function getSnapshotStatus(
  snapshot,
  now = Date.now(),
  thresholdHours = SNAPSHOT_ALERT_HOURS,
) {
  const threshold = Number(thresholdHours);
  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new TypeError("thresholdHours must be a non-negative finite number");
  }
  const fetchedAt = snapshot?.source?.fetchedAt;
  const ageHours = snapshotAgeHours(snapshot, now);
  return {
    fetchedAt: new Date(Date.parse(fetchedAt)).toISOString(),
    now: new Date(timestamp(now, "now")).toISOString(),
    ageHours,
    thresholdHours: threshold,
    stale: ageHours > threshold,
  };
}

export function isSnapshotStale(
  snapshot,
  now = Date.now(),
  thresholdHours = SNAPSHOT_ALERT_HOURS,
) {
  return getSnapshotStatus(snapshot, now, thresholdHours).stale;
}

export async function readSnapshotStatus(filePath, now = Date.now()) {
  const contents = await readFile(resolve(filePath), "utf8");
  const snapshot = JSON.parse(contents);
  return { path: filePath, ...getSnapshotStatus(snapshot, now) };
}

async function main() {
  const filePath = process.argv[2] || "data/live-seed.json";
  try {
    const status = await readSnapshotStatus(filePath);
    process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
    // 0: fresh, 1: stale, 2: unreadable or invalid snapshot metadata.
    process.exitCode = status.stale ? 1 : 0;
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify(
        { path: filePath, stale: null, error: error.message },
        null,
        2,
      )}\n`,
    );
    process.exitCode = 2;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
