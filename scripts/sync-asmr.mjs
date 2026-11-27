#!/usr/bin/env node
/**
 * Pull the latest asmr.one/works page (no age filter, original tags) into
 * server/cache/live-works.json. Full track URLs are fetched lazily per work.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "../server/lib/asmr/atomicWrite.mjs";
import { scrapeAsmrOne, validateSnapshot } from "../server/lib/asmr/snapshot.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = join(root, "server", "cache");
mkdirSync(cacheDir, { recursive: true });

console.log("→ 正在连接 asmr.one …");
try {
  const library = await scrapeAsmrOne();
  const workCount = validateSnapshot(library);
  writeFileAtomic(
    join(cacheDir, "live-works.json"),
    JSON.stringify(library, null, 2),
  );
  console.log(
    `✓ 已缓存 ${workCount} 个作品、${library.tags.length} 个原站标签（${library.source.api}）`,
  );
  for (const work of library.works.slice(0, 20)) console.log(`  ${work.id}  ${work.title}`);
  if (library.works.length > 20) {
    console.log(`  … 另有 ${library.works.length - 20} 件`);
  }
} catch (error) {
  console.error(`✗ 同步失败：${error.message}`);
  console.error("  应用会继续使用 data/works.json 中的策展快照。");
  process.exitCode = 1;
}
