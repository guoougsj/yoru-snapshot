import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  SNAPSHOT_ALERT_HOURS,
  getSnapshotStatus,
  isSnapshotStale,
  snapshotAgeHours,
} from "./snapshot-status.mjs";

const scriptPath = fileURLToPath(new URL("./snapshot-status.mjs", import.meta.url));
const fetchedAt = "2026-11-20T00:00:00.000Z";
const snapshot = { source: { fetchedAt } };

function runCli(filePath) {
  return spawnSync(process.execPath, [scriptPath, filePath], {
    encoding: "utf8",
  });
}

test("snapshot age is calculated from source.fetchedAt", () => {
  const now = Date.parse("2026-11-22T00:00:00.000Z");
  assert.equal(snapshotAgeHours(snapshot, now), 48);
  assert.equal(
    snapshotAgeHours(snapshot, Date.parse("2026-11-22T00:00:00.001Z")),
    48 + 1 / 3_600_000,
  );
});

test("the alert starts only after 48 hours", () => {
  const exactly48Hours = Date.parse("2026-11-22T00:00:00.000Z");
  assert.equal(SNAPSHOT_ALERT_HOURS, 48);
  assert.equal(isSnapshotStale(snapshot, exactly48Hours), false);
  assert.equal(
    isSnapshotStale(snapshot, exactly48Hours + 1),
    true,
  );
});

test("status includes normalized timestamps and the configured threshold", () => {
  const status = getSnapshotStatus(
    snapshot,
    Date.parse("2026-11-23T12:00:00.000Z"),
    60,
  );
  assert.equal(status.fetchedAt, fetchedAt);
  assert.equal(status.now, "2026-11-23T12:00:00.000Z");
  assert.equal(status.ageHours, 84);
  assert.equal(status.thresholdHours, 60);
  assert.equal(status.stale, true);
});

test("future timestamps are not stale and invalid metadata is rejected", () => {
  assert.equal(
    isSnapshotStale(snapshot, Date.parse("2026-11-19T23:00:00.000Z")),
    false,
  );
  assert.throws(
    () => snapshotAgeHours({ source: {} }, Date.now()),
    /fetchedAt/,
  );
  assert.throws(
    () => getSnapshotStatus(snapshot, Date.now(), -1),
    /thresholdHours/,
  );
});

test("CLI prints JSON and uses distinct fresh, stale, and invalid exit codes", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "yoru-snapshot-status-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const hourMs = 3_600_000;
  const freshPath = join(directory, "fresh.json");
  const stalePath = join(directory, "stale.json");
  const invalidPath = join(directory, "invalid.json");
  writeFileSync(
    freshPath,
    JSON.stringify({ source: { fetchedAt: new Date().toISOString() } }),
  );
  writeFileSync(
    stalePath,
    JSON.stringify({
      source: { fetchedAt: new Date(Date.now() - 49 * hourMs).toISOString() },
    }),
  );
  writeFileSync(invalidPath, JSON.stringify({ source: {} }));

  const fresh = runCli(freshPath);
  assert.equal(fresh.status, 0, fresh.stderr);
  assert.equal(JSON.parse(fresh.stdout).stale, false);

  const stale = runCli(stalePath);
  assert.equal(stale.status, 1, stale.stderr);
  assert.equal(JSON.parse(stale.stdout).stale, true);

  const invalid = runCli(invalidPath);
  assert.equal(invalid.status, 2, invalid.stderr);
  assert.equal(JSON.parse(invalid.stdout).stale, null);
  assert.match(JSON.parse(invalid.stdout).error, /fetchedAt/);
});
