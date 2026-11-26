import assert from "node:assert/strict";
import test from "node:test";
import { fetchTracks, normaliseTrackTree } from "./tracks.mjs";

test("track normalization keeps variants and chooses the smallest exact duplicate", () => {
  const tracks = normaliseTrackTree([
    {
      type: "folder",
      title: "正篇",
      children: [
        {
          type: "audio",
          hash: "large",
          title: "01.会話.flac",
          duration: 120,
          size: 500,
          mediaStreamUrl: "/media/large.flac",
          mediaDownloadUrl: "https://raw.kiko-play-niptan.one/large.flac",
        },
        {
          type: "audio",
          hash: "small",
          title: "01.会話.flac",
          duration: 120,
          size: 300,
          mediaStreamUrl: "/media/small.flac",
          mediaDownloadUrl: "https://raw.kiko-play-niptan.one/small.flac",
        },
        {
          type: "audio",
          hash: "mp3",
          title: "01.会話.mp3",
          duration: 120,
          size: 100,
          mediaStreamUrl: "https://raw.kiko-play-niptan.one/talk.mp3",
        },
        { type: "text", title: "01.会話.lrc", mediaDownloadUrl: "/subs/talk.lrc" },
        { type: "text", title: "01.会話.vtt", mediaDownloadUrl: "/subs/talk.vtt" },
      ],
    },
    {
      type: "folder",
      title: "試聴版",
      children: [
        {
          type: "audio",
          hash: "preview",
          title: "01.会話 プレビュー.mp3",
          duration: 30,
          size: 50,
          mediaStreamUrl: "/media/preview.mp3",
        },
      ],
    },
  ]);

  assert.equal(tracks.length, 3);
  const fullFlac = tracks.find((track) => track.format === "flac");
  assert.equal(fullFlac.id, "small");
  assert.equal(fullFlac.size, 300);
  assert.equal(fullFlac.subtitleFormat, "vtt");
  assert.equal(fullFlac.subtitleUrl, "https://api.asmr-200.com/subs/talk.vtt");
  assert.equal(fullFlac.version, "正篇");
  assert.ok(tracks.some((track) => track.id === "mp3" && track.version === "正篇"));
  assert.ok(tracks.some((track) => track.id === "preview" && track.version === "试听版"));
});

test("track lookup rejects invalid work ids before network access", async () => {
  await assert.rejects(() => fetchTracks("not-a-work"), /无效的作品编号/);
  await assert.rejects(() => fetchTracks("RJ123abc"), /无效的作品编号/);
  await assert.rejects(() => fetchTracks("9".repeat(400)), /无效的作品编号/);
  await assert.rejects(() => fetchTracks("RJ00000000"), /无效的作品编号/);
});

test("track normalization drops insecure and credentialed media URLs", () => {
  const tracks = normaliseTrackTree([
    { type: "audio", title: "http.mp3", mediaStreamUrl: "http://raw.kiko-play-niptan.one/a.mp3" },
    { type: "audio", title: "script.mp3", mediaStreamUrl: "javascript:alert(1)" },
    { type: "audio", title: "evil.mp3", mediaStreamUrl: "https://evil.example/a.mp3" },
    {
      type: "audio",
      title: "auth.mp3",
      mediaStreamUrl: "https://user:pass@raw.kiko-play-niptan.one/a.mp3",
    },
    { type: "audio", title: "safe.mp3", mediaStreamUrl: "https://raw.kiko-play-niptan.one/a.mp3" },
  ]);
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].title, "safe");
});
