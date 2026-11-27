import { createHash } from "node:crypto";
import {
  aggregateTags,
  cleanTitle,
  MOODS,
  normaliseWorkWithIndex,
  PLAYLIST_BLUEPRINTS,
  TARGET_WORKS,
} from "../../../shared/asmrCore.mjs";

export { cleanTitle, TARGET_WORKS };

function stableIndex(seed, mod) {
  const hash = createHash("sha1").update(seed).digest();
  return hash.readUInt16BE(0) % mod;
}

export function buildLibrary(rawWorks, mirror, transport) {
  const works = rawWorks
    .slice(0, TARGET_WORKS)
    .map((raw, index) => normaliseWorkWithIndex(raw, index, stableIndex));
  const playlists = PLAYLIST_BLUEPRINTS.map((blueprint) => ({
    ...blueprint,
    curator: "YORU 编辑部",
    workIds: blueprint.picks.map((pick) => works[pick % works.length]?.id).filter(Boolean),
  }));

  return {
    source: {
      name: "asmr.one",
      url: "https://asmr.one/works",
      api: `${mirror}/api/works?order=release&sort=desc`,
      fetchedAt: new Date().toISOString(),
      mode: "live",
      transport,
      note:
        transport === "direct"
          ? "实时抓取 asmr.one 作品，并按原站标签分类；完整音轨通过官方接口播放。"
          : `通过 ${transport} 只读中继抓取 asmr.one 作品，并按原站标签分类；完整音轨通过官方接口播放。`,
    },
    works,
    playlists,
    moods: MOODS,
    tags: aggregateTags(works),
    hasAdult: works.some((work) => Boolean(work.ageRating)),
  };
}
