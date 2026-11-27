import type { CoverArtSpec, Mood, TagCategory, Track, Work } from "../src/types";

export interface RawTag {
  name?: string;
  i18n?: Record<string, { name?: string } | undefined>;
}

export interface RawVa {
  name?: string;
}

export interface RawWork {
  id?: number;
  source_id?: string;
  title?: string;
  circle?: { name?: string };
  name?: string;
  tags?: RawTag[];
  vas?: RawVa[];
  duration?: number;
  release?: string;
  create_date?: string;
  rate_average_2dp?: number;
  review_count?: number;
  age_category_string?: string;
  nsfw?: boolean;
}

export interface RawTrackNode {
  type?: string;
  title?: string;
  hash?: string;
  id?: string | number;
  size?: number;
  duration?: number;
  mediaStreamUrl?: string | null;
  mediaDownloadUrl?: string | null;
  children?: RawTrackNode[];
}

export const API_HOSTS: Set<string>;
export const TARGET_WORKS: number;
export const MOOD_RULES: Array<[string, RegExp]>;
export const ART: CoverArtSpec[];
export const MOODS: Mood[];
export const PLAYLIST_BLUEPRINTS: Array<{
  id: string;
  title: string;
  subtitle: string;
  description: string;
  tag: string;
  moods: string[];
  picks: number[];
  art: { base: string; glow: string; ink: string };
}>;

export function isAllowedMediaHost(value: string): boolean;
export function safeMediaUrl(value?: string | null): string | undefined;
export function cleanTitle(value?: string): string;
export function deriveMoods(raw: RawWork): string[];
export function normaliseWorkWithIndex(
  raw: RawWork,
  index: number,
  stableIndex: (seed: string, mod: number) => number,
): Work;
export function aggregateTags(works: Work[]): TagCategory[];
export function normaliseTrackTree(
  raw: RawTrackNode[] | { children?: RawTrackNode[] },
): Track[];
