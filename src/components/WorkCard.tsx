import { Heart, Pause, Play, Star } from "lucide-react";
import type { Work } from "../types";
import { CoverArt } from "./CoverArt";
import { workDurationLabel } from "../lib/format";

interface WorkCardProps {
  work: Work;
  index: number;
  active: boolean;
  playing: boolean;
  favorite: boolean;
  onPlay: (work: Work) => void;
  onOpen: (work: Work) => void;
  onFavorite: (id: string) => void;
}

export function WorkCard({
  work,
  index,
  active,
  playing,
  favorite,
  onPlay,
  onOpen,
  onFavorite,
}: WorkCardProps) {
  return (
    <article
      className={`work-card ${active ? "is-active" : ""}`}
      style={{ animationDelay: `${120 + index * 40}ms` }}
    >
      <div className="work-cover-wrap">
        <button
          className="work-cover-button"
          onClick={() => onOpen(work)}
          aria-label={`查看 ${work.title}`}
        >
          <CoverArt art={work.art} title={work.title} index={index} />
          {work.coverUrl && (
            <img
              className="work-cover-image"
              src={work.coverUrl}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={(event) => event.currentTarget.remove()}
            />
          )}
        </button>

        <span className="work-duration">{workDurationLabel(work.duration)}</span>

        {work.ageRating && (
          <span className={`work-age-badge ${work.ageRating === "ADULT" ? "is-adult" : ""}`}>
            {work.ageRating}
          </span>
        )}

        <button
          className={`work-favorite ${favorite ? "is-favorite" : ""}`}
          onClick={() => onFavorite(work.id)}
          aria-label={favorite ? "取消收藏" : "收藏作品"}
          aria-pressed={favorite}
        >
          <Heart size={14} fill={favorite ? "currentColor" : "none"} strokeWidth={1.8} />
        </button>

        {active && (
          <span className="playing-indicator" aria-label="正在播放">
            {playing ? (
              <span className="equalizer">
                <i />
                <i />
                <i />
              </span>
            ) : (
              <span className="paused-dot" />
            )}
          </span>
        )}

        <button
          className={`work-play ${active ? "visible" : ""}`}
          onClick={() => onPlay(work)}
          aria-label={active && playing ? `暂停 ${work.title}` : `播放 ${work.title}`}
        >
          {active && playing ? (
            <Pause size={16} fill="currentColor" strokeWidth={1.5} />
          ) : (
            <Play size={16} fill="currentColor" strokeWidth={1.5} />
          )}
        </button>
      </div>

      <div className="work-info">
        <button className="work-title" onClick={() => onOpen(work)}>
          {work.title}
        </button>
        <p className="work-byline">
          <span>{work.circle}</span>
          {work.cvs.length > 0 && (
            <>
              <i />
              <span>CV {work.cvs[0]}</span>
            </>
          )}
        </p>
        <div className="work-footer">
          <span className="work-tag">{work.tags[0] ?? "环境音"}</span>
          <span className="work-rating">
            <Star size={11} fill="currentColor" strokeWidth={0} />
            {work.rating ? work.rating.toFixed(1) : "NEW"}
          </span>
        </div>
      </div>
    </article>
  );
}
