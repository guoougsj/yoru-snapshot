import assert from "node:assert/strict";
import test from "node:test";
import { fetchSubtitleText } from "./subtitles.mjs";

function installFetch(t, fetchImpl) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
}

test("subtitle proxy accepts a small HTTPS text asset", async (t) => {
  let requested;
  installFetch(t, async (url, options) => {
    requested = { url, options };
    return new Response("WEBVTT\n\n00:00.000 --> 00:01.000\nHello", {
      status: 200,
      headers: { "content-type": "text/vtt; charset=utf-8" },
    });
  });

  const text = await fetchSubtitleText("https://cdn.kiko-play-niptan.one/audio/sub.vtt?token=abc");
  assert.match(text, /^WEBVTT/);
  assert.equal(requested.url, "https://cdn.kiko-play-niptan.one/audio/sub.vtt?token=abc");
  assert.equal(requested.options.redirect, "manual");
});

test("subtitle proxy rejects insecure, credentialed and lookalike URLs before fetching", async (t) => {
  let calls = 0;
  installFetch(t, async () => {
    calls += 1;
    throw new Error("unexpected fetch");
  });

  const urls = [
    "http://asmr.one/sub.vtt",
    "https://user:pass@asmr.one/sub.vtt",
    "https://asmr.one:8443/sub.vtt",
    "https://asmr.one.evil.example/sub.vtt",
    "https://evilasmr.one/sub.vtt",
    "https://asmr.one/sub.html",
  ];
  for (const url of urls) await assert.rejects(() => fetchSubtitleText(url));
  assert.equal(calls, 0);
});

test("subtitle proxy revalidates every redirect", async (t) => {
  const requested = [];
  installFetch(t, async (url) => {
    requested.push(url);
    if (requested.length === 1) {
      return new Response(null, { status: 302, headers: { location: "/safe.srt" } });
    }
    return new Response("1\n00:00,000 --> 00:01,000\nHello", {
      headers: { "content-type": "application/x-subrip" },
    });
  });

  const text = await fetchSubtitleText("https://asmr.one/start.vtt");
  assert.match(text, /^1\n/);
  assert.deepEqual(requested, ["https://asmr.one/start.vtt", "https://asmr.one/safe.srt"]);

  requested.length = 0;
  globalThis.fetch = async (url) => {
    requested.push(url);
    return new Response(null, { status: 302, headers: { location: "https://evil.example/sub.vtt" } });
  };
  await assert.rejects(() => fetchSubtitleText("https://asmr.one/start.vtt"), /不允许/);
  assert.equal(requested.length, 1);
});

test("subtitle proxy limits redirect chains", async (t) => {
  let calls = 0;
  installFetch(t, async () => {
    calls += 1;
    return new Response(null, { status: 302, headers: { location: "/next.vtt" } });
  });
  await assert.rejects(() => fetchSubtitleText("https://asmr.one/start.vtt"), /次数过多/);
  assert.equal(calls, 4);
});

test("subtitle proxy caps declared and streamed response sizes", async (t) => {
  installFetch(t, async () => {
    return new Response("small", { headers: { "content-length": "1000001" } });
  });
  await assert.rejects(() => fetchSubtitleText("https://asmr.one/sub.txt"), /过大/);

  const bytes = new Uint8Array(1_000_001);
  globalThis.fetch = async () => new Response(bytes, { headers: { "content-type": "text/plain" } });
  await assert.rejects(() => fetchSubtitleText("https://asmr.one/sub.txt"), /过大/);
});

test("subtitle proxy rejects non-text content types", async (t) => {
  installFetch(t, async () => {
    return new Response("<html></html>", { headers: { "content-type": "text/html" } });
  });
  await assert.rejects(() => fetchSubtitleText("https://asmr.one/sub.txt"), /不支持/);

  globalThis.fetch = async () => {
    return new Response("{}", { headers: { "content-type": "application/json" } });
  };
  await assert.rejects(() => fetchSubtitleText("https://asmr.one/sub.txt"), /不支持/);
});
