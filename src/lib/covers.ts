import type { Work } from "../types";

/**
 * The official asmr.one cover endpoint is often blocked together with the API.
 * The Furina relay exposes the same image path, so use it as the display URL.
 * Works without a numeric RJ id fall back to the generated YORU cover art.
 */
export function originalCoverUrl(work: Work): string | undefined {
  if (work.coverUrl) return work.coverUrl;
  const match = String(work.id).match(/^RJ0*(\d+)$/i);
  if (!match) return undefined;
  return `https://asmr.furina.in/api/cover/${Number(match[1])}.jpg?type=main`;
}
