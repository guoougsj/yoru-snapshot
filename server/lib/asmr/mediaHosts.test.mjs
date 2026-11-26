import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedMediaHost } from "./mediaHosts.mjs";

test("media host allowlist accepts official API and CDN hosts only", () => {
  for (const host of [
    "asmr.one",
    "www.asmr.one",
    "raw.kiko-play-niptan.one",
    "api.asmr-200.com",
    "api.asmr.one",
    "api.asmr-100.com",
    "api.asmr-300.com",
  ]) {
    assert.equal(isAllowedMediaHost(host), true, host);
  }
  for (const host of [
    "evil.example",
    "asmr.one.evil.example",
    "evilasmr.one",
    "kiko-play-niptan.one.evil.example",
    "api.asmr-200.com.evil.example",
  ]) {
    assert.equal(isAllowedMediaHost(host), false, host);
  }
});
