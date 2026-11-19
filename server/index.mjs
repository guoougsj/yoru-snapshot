import express from "express";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchSubtitleText, fetchTracks, scrapeAsmrOne } from "./lib/scrape.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = join(root, "server", "cache");
const liveCachePath = join(cacheDir, "live-works.json");
const curatedPath = join(root, "data", "works.json");
const distPath = join(root, "dist");
const port = Number(process.env.PORT) || 8787;

mkdirSync(cacheDir, { recursive: true });

const app = express();
app.use(express.json());
app.disable("x-powered-by");

let syncInFlight = null;
let lastSyncAt = 0;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadLibrary() {
  if (existsSync(liveCachePath)) {
    try {
      const live = readJson(liveCachePath);
      if (live.works?.length) return { ...live, source: { ...live.source, cached: true } };
    } catch (error) {
      console.warn("[yoru] live cache is unreadable, falling back:", error.message);
    }
  }
  return readJson(curatedPath);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "yoru-api", time: new Date().toISOString() });
});

app.get("/api/works", (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(loadLibrary());
  } catch (error) {
    res.status(500).json({ error: "无法读取作品缓存", detail: error.message });
  }
});

app.get("/api/tracks/:id", async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    const data = await fetchTracks(req.params.id);
    res.json(data);
  } catch (error) {
    console.warn("[yoru] tracks failed:", error.message);
    res.status(502).json({
      ok: false,
      message: "无法获取官方音轨，稍后会回退到本地试听。",
      detail: error.message,
    });
  }
});

app.get("/api/subtitles", async (req, res) => {
  try {
    const text = await fetchSubtitleText(String(req.query.url || ""));
    res.set("Cache-Control", "private, max-age=3600");
    res.type("text/plain; charset=utf-8").send(text);
  } catch (error) {
    console.warn("[yoru] subtitle failed:", error.message);
    res.status(502).type("text/plain; charset=utf-8").send("字幕暂不可用");
  }
});

app.post("/api/sync", async (_req, res) => {
  if (syncInFlight) {
    return res.status(202).json({ ok: false, pending: true, message: "同步正在进行中" });
  }
  if (Date.now() - lastSyncAt < 20_000) {
    return res.status(429).json({ ok: false, message: "请稍后再试（20 秒内只允许同步一次）" });
  }

  syncInFlight = scrapeAsmrOne();
  try {
    const library = await syncInFlight;
    writeFileSync(liveCachePath, JSON.stringify(library, null, 2), "utf8");
    lastSyncAt = Date.now();
    res.json({ ok: true, source: library.source, count: library.works.length });
  } catch (error) {
    console.warn("[yoru] sync failed:", error.message);
    res.status(502).json({
      ok: false,
      message: "asmr.one 当前无法访问，已保留现有作品数据。",
      detail: error.message,
    });
  } finally {
    syncInFlight = null;
  }
});

if (existsSync(distPath)) {
  app.use(express.static(distPath, { maxAge: "1h", index: false }));
  app.get("*", (_req, res) => res.sendFile(join(distPath, "index.html")));
}

app.listen(port, "127.0.0.1", () => {
  console.log(`\n  YORU API  http://localhost:${port}`);
  console.log(`  作品数据  ${existsSync(liveCachePath) ? "实时缓存" : "策展快照"}`);
  console.log(`  开发页面  http://localhost:5173\n`);
});
