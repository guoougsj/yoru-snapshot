import { ArrowUpRight, Play } from "lucide-react";
import type { Playlist, Work } from "../types";
import { formatHours } from "../lib/format";
import { CoverArt } from "./CoverArt";

interface PlaylistCardProps {
  playlist: Playlist;
  index: number;
  works: Work[];
  onPlay: (playlist: Playlist) => void;
}

export function PlaylistCard({ playlist, index, works, onPlay }: PlaylistCardProps) {
  const items = playlist.workIds
    .map((id) => works.find((work) => work.id === id))
    .filter(Boolean) as Work[];
  const total = items.reduce((sum, work) => sum + work.duration, 0);
  const bg = `linear-gradient(145deg, ${playlist.art.base} 0%, #0b0d0f 85%)`;

  return (
    <article
      className="playlist-card"
      style={{ animationDelay: `${60 + index * 55}ms` }}
      onClick={() => onPlay(playlist)}
    >
      <div className="playlist-visual" style={{ background: bg }}>
        <span className="playlist-visual-grid" aria-hidden="true" />
        <span className="playlist-big-tag" style={{ color: playlist.art.ink }}>
          {playlist.tag}
        </span>
        <span className="playlist-pl-index">PL. {String(index + 1).padStart(2, "0")}</span>

        <div className="playlist-stack-a">
          {items[0] && <CoverArt art={items[0].art} title={items[0].title} showMeta={false} />}
        </div>
        <div className="playlist-stack-b">
          {items[1] && <CoverArt art={items[1].art} title={items[1].title} showMeta={false} />}
        </div>

        <button
          className="playlist-play"
          onClick={(event) => {
            event.stopPropagation();
            onPlay(playlist);
          }}
          aria-label={`播放歌单 ${playlist.title}`}
        >
          <Play size={16} fill="currentColor" strokeWidth={1.7} />
        </button>

        <span className="playlist-corner" style={{ borderColor: playlist.art.glow }} />
      </div>

      <div className="playlist-info">
        <div className="playlist-title-row">
          <h3>{playlist.title}</h3>
          <ArrowUpRight size={15} strokeWidth={1.6} />
        </div>
        <p>{playlist.subtitle}</p>
        <div className="playlist-meta">
          <span>{playlist.workIds.length} 段声音</span>
          <i />
          <span>{formatHours(total)}</span>
          <span className="playlist-curator">{playlist.curator}</span>
        </div>
      </div>
    </article>
  );
}
