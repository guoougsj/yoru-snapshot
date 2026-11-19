import { Capacitor } from "@capacitor/core";
import type { Track, Work } from "../types";

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface StoredSubtitles {
  name: string;
  content: string;
  importedAt: string;
}

const STORE_KEY = "yoru.subtitles-v1";

export function subtitleKey(workId: string, trackId: string): string {
  return `${workId}::${trackId}`;
}

export function readSubtitleStore(): Record<string, StoredSubtitles> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Record<
      string,
      StoredSubtitles
    >;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

export function writeSubtitleStore(store: Record<string, StoredSubtitles>) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* Imported subtitles are still available for this session. */
  }
}

function parseTime(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  const parts = normalized.split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  const numbers = parts.map(Number);
  if (numbers.some((part) => !Number.isFinite(part))) return null;
  if (numbers.length === 3) {
    return numbers[0] * 3600 + numbers[1] * 60 + numbers[2];
  }
  return numbers[0] * 60 + numbers[1];
}

function parseTimedBlocks(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const blocks = content.replace(/\r/g, "").trim().split(/\n{2,}/);
  for (const block of blocks) {
    if (/^(WEBVTT|NOTE|STYLE|REGION)\b/i.test(block.trim())) continue;
    const lines = block.split("\n");
    const timeIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeIndex < 0) continue;
    const [rawStart, rawEnd] = lines[timeIndex].split("-->");
    // VTT cue settings (align/position) may follow the end timestamp.
    const start = parseTime((rawStart ?? "").trim().split(/\s+/)[0] ?? "");
    const end = parseTime((rawEnd ?? "").trim().split(/\s+/)[0] ?? "");
    if (start === null || end === null) continue;
    const text = lines
      .slice(timeIndex + 1)
      .join("\n")
      .trim();
    if (text) cues.push({ start, end: Math.max(end, start + 0.5), text });
  }
  return cues;
}

function parseLrc(content: string): SubtitleCue[] {
  const entries: Array<{ start: number; text: string }> = [];
  for (const line of content.replace(/\r/g, "").split("\n")) {
    const tags = [...line.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!tags.length) continue;
    const text = line.replace(/\[[^\]]+\]/g, "").trim();
    if (!text) continue;
    for (const tag of tags) {
      const minutes = Number(tag[1]);
      const seconds = Number(tag[2]);
      const fraction = tag[3] ? Number(`0.${tag[3]}`) : 0;
      entries.push({ start: minutes * 60 + seconds + fraction, text });
    }
  }
  entries.sort((a, b) => a.start - b.start);
  return entries.map((entry, index) => ({
    start: entry.start,
    end: entries[index + 1]?.start ?? entry.start + 5,
    text: entry.text,
  }));
}

function parsePlainText(content: string, duration: number): SubtitleCue[] {
  const lines = content
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && !/^\d+$/.test(line));
  if (!lines.length) return [];
  const total = duration > 0 ? duration : Math.max(12, lines.length * 4);
  const step = total / lines.length;
  return lines.map((text, index) => ({
    start: index * step,
    end: (index + 1) * step,
    text,
  }));
}

export function parseSubtitleText(content: string, duration: number): SubtitleCue[] {
  const trimmed = content.trim();
  if (!trimmed) return [];
  const timed = parseTimedBlocks(trimmed);
  if (timed.length) return timed.sort((a, b) => a.start - b.start);
  const lrc = parseLrc(trimmed);
  if (lrc.length) return lrc;
  return parsePlainText(trimmed, duration);
}

export function activeCueIndex(cues: SubtitleCue[], currentTime: number): number {
  let active = -1;
  for (let index = 0; index < cues.length; index += 1) {
    if (cues[index].start <= currentTime + 0.05) active = index;
    else break;
  }
  return active;
}

const DEMO_LINES = [
  "把灯关掉，让耳朵先醒来。",
  "呼吸慢一点，房间会比刚才更大。",
  "声音从左边靠近，又从右边离开。",
  "听见雨落在窗沿，也听见自己的心跳。",
  "今天不需要完成什么，只需要在这里。",
  "低一点，再低一点。",
  "耳机里的空间，比现实更柔软。",
  "让这段声音替你守住夜晚。",
  "不必说话，也不必解释。",
  "把注意力放在最细小的声音上。",
  "像有人坐在床边，轻声翻开一页书。",
  "困意来的时候，就顺着它走。",
  "世界暂时静音，只留下这一段。",
  "晚安之前，先听一会儿。",
  "下一次呼吸，会和这一次一样慢。",
];

export async function fetchSubtitleContent(url: string): Promise<string> {
  if (!url) throw new Error("字幕地址为空");

  if (Capacitor.isNativePlatform()) {
    const controller = new AbortController();
    let timer = 0;
    const deadline = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => {
        controller.abort();
        reject(new Error("字幕请求超时"));
      }, 15_000);
    });
    try {
      const response = await Promise.race([
        fetch(url, {
          signal: controller.signal,
          cache: "no-store",
          headers: {
            Origin: "https://asmr.one",
            Referer: "https://asmr.one/",
          },
        }),
        deadline,
      ]);
      if (!response.ok) throw new Error(`字幕 HTTP ${response.status}`);
      return await response.text();
    } finally {
      window.clearTimeout(timer);
    }
  }

  const response = await fetch(`/api/subtitles?url=${encodeURIComponent(url)}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("字幕接口暂不可用");
  return response.text();
}

export function buildDemoSubtitles(
  work: Work,
  track: Track | null,
  duration: number,
): SubtitleCue[] {
  const total = duration > 0 ? duration : track?.duration || 20;
  const count = Math.min(80, Math.max(8, Math.floor(total / 8)));
  const interval = total / count;
  const seedLines = [
    `《${work.title}》`,
    `${work.circle}${work.tags.length ? ` · ${work.tags.slice(0, 3).join("、")}` : ""}`,
    ...DEMO_LINES,
  ];

  return Array.from({ length: count }, (_, index) => ({
    start: index * interval,
    end: (index + 1) * interval - 0.1,
    text: seedLines[index % seedLines.length],
  }));
}
