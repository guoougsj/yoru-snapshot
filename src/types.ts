export type ArtMotif =
  | "moon"
  | "cloud"
  | "rain"
  | "wave"
  | "ember"
  | "garden"
  | "window"
  | "cafe"
  | "mountain"
  | "cat"
  | "book"
  | "horizon";

export interface CoverArtSpec {
  motif: ArtMotif;
  base: string;
  glow: string;
  ink: string;
  glyph: string;
}

export type AgeRating = "R15" | "ADULT";

export interface Track {
  id: string;
  title: string;
  format?: string;
  duration: number;
  size: number;
  streamUrl: string;
  downloadUrl?: string;
  downloadable: boolean;
  /** Official WebVTT/SRT/LRC asset returned by asmr.one, when available. */
  subtitleUrl?: string;
  subtitleFormat?: string;
}

export interface TagCategory {
  id: string;
  label: string;
  count: number;
}

export interface Work {
  id: string;
  title: string;
  subtitle: string;
  circle: string;
  cvs: string[];
  tags: string[];
  moods: string[];
  duration: number;
  releaseDate: string;
  rating: number;
  reviewCount: number;
  sourceUrl: string;
  /** Bundled local fallback preview. Full tracks come from /api/tracks. */
  audio: string;
  art: CoverArtSpec;
  description: string;
  ageRating?: AgeRating;
}

export interface Playlist {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  curator: string;
  tag: string;
  moods: string[];
  workIds: string[];
  art: { base: string; glow: string; ink: string };
}

export interface Mood {
  id: string;
  label: string;
  caption: string;
}

export interface SourceInfo {
  name: string;
  url: string;
  api: string;
  fetchedAt: string;
  mode: "live" | "curated-snapshot" | string;
  note: string;
  transport?: string;
  cached?: boolean;
}

export interface LibraryData {
  source: SourceInfo;
  works: Work[];
  playlists: Playlist[];
  moods: Mood[];
  /** Aggregated from the tags returned by asmr.one. */
  tags?: TagCategory[];
  hasAdult?: boolean;
}

export interface Toast {
  id: number;
  message: string;
  tone: "neutral" | "success" | "error";
}
