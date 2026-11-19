#!/usr/bin/env node
/**
 * Pull the latest asmr.one/works page (no age filter, original tags) into
 * server/cache/live-works.json. Full track URLs are fetched lazily per work.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scrapeAsmrOne } from "../server/lib/scrape.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = join(root, "server", "cache");
mkdirSync(cacheDir, { recursive: true });

console.log("→ 正在连接 asmr.one …");
try {
  const library = await scrapeAsmrOne();
  writeFileSync(
    join(cacheDir, "live-works.json"),
    JSON.stringify(library, null, 2),
    "utf8",
  );
  console.log(
    `✓ 已缓存 ${library.works.length} 个作品、${library.tags?.length ?? 0} 个原站标签（${library.source.api}）`,
  );
  for (const work of library.works) console.log(`  ${work.id}  ${work.title}`);
} catch (error) {
  console.error(`✗ 同步失败：${error.message}`);
  console.error("  应用会继续使用 data/works.json 中的策展快照。");
  process.exitCode = 1;
}
