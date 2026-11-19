import { ArrowDownRight, Headphones, Play, Sparkles } from "lucide-react";
import type { Playlist, Work } from "../types";
import { CoverArt } from "./CoverArt";
import { formatHours } from "../lib/format";

interface HeroProps {
  playlist: Playlist;
  works: Work[];
  onPlay: (playlist: Playlist) => void;
  onExplore: () => void;
}

export function Hero({ playlist, works, onPlay, onExplore }: HeroProps) {
  const featured = playlist.workIds
    .map((id) => works.find((work) => work.id === id))
    .filter(Boolean) as Work[];
  const main = featured[0] ?? works[0];
  const backA = featured[1] ?? works[1];
  const backB = featured[2] ?? works[2];
  const total = featured.reduce((sum, work) => sum + (work?.duration ?? 0), 0);
  const voices = new Set(featured.flatMap((work) => work?.cvs ?? [])).size;

  return (
    <section className="hero" aria-labelledby="hero-heading">
      <div className="hero-glow hero-glow-a" />
      <div className="hero-glow hero-glow-b" />
      <span className="hero-watermark" aria-hidden="true">
        夜
      </span>

      <div className="hero-copy">
        <div className="hero-eyebrow">
          <span className="hero-eyebrow-badge">
            <Sparkles size={12} />
            WEEKLY CURATION
          </span>
          <span className="hero-eyebrow-line" />
          <span>NO. 028</span>
        </div>

        <h1 id="hero-heading">
          把夜晚，
          <br />
          <em>留给耳朵。</em>
        </h1>

        <p className="hero-lede">
          从 asmr.one 的海量作品里，拣出适合此刻的低声、雨声与呼吸。
          今晚的播放列表，是一场从喧闹到安静的缓慢降落。
        </p>

        <div className="hero-actions">
          <button className="primary-button" onClick={() => onPlay(playlist)}>
            <span className="primary-button-icon">
              <Play size={16} fill="currentColor" strokeWidth={1.6} />
            </span>
            播放本周歌单
          </button>
          <button className="ghost-button" onClick={onExplore}>
            查看作品集
            <ArrowDownRight size={16} strokeWidth={1.7} />
          </button>
        </div>

        <div className="hero-meta">
          <div>
            <strong>{featured.length || playlist.workIds.length}</strong>
            <span>段作品</span>
          </div>
          <i />
          <div>
            <strong>{voices || 4}</strong>
            <span>位声音</span>
          </div>
          <i />
          <div>
            <strong>{formatHours(total)}</strong>
            <span>总时长</span>
          </div>
          <div className="hero-headphones">
            <Headphones size={15} strokeWidth={1.6} />
            <span>建议佩戴耳机</span>
          </div>
        </div>
      </div>

      <div className="hero-stage" aria-label="本周推荐歌单封面">
        <span className="stage-orbit stage-orbit-a" aria-hidden="true" />
        <span className="stage-orbit stage-orbit-b" aria-hidden="true" />
        <span className="stage-cross stage-cross-a" aria-hidden="true">
          +
        </span>
        <span className="stage-cross stage-cross-b" aria-hidden="true">
          +
        </span>

        {backA && (
          <div className="hero-sleeve hero-sleeve-back-a">
            <CoverArt art={backA.art} title={backA.title} showMeta={false} />
          </div>
        )}
        {backB && (
          <div className="hero-sleeve hero-sleeve-back-b">
            <CoverArt art={backB.art} title={backB.title} showMeta={false} />
          </div>
        )}

        {main && (
          <div className="hero-main-sleeve">
            <CoverArt art={main.art} title={playlist.title} />
            <span className="hero-sleeve-badge">CURATED · 028</span>
            <span className="hero-sleeve-caption">
              <small>{playlist.tag}</small>
              <strong>{playlist.title}</strong>
            </span>
          </div>
        )}

        <div className="hero-now-card">
          <div className="hero-now-icon">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div>
            <small>NOW CURATING</small>
            <strong>{main?.title ?? "深夜声音"}</strong>
            <span>{main?.circle ?? "asmr.one"}</span>
          </div>
          <button onClick={() => onPlay(playlist)} aria-label="播放本周歌单">
            <Play size={13} fill="currentColor" strokeWidth={1.5} />
          </button>
        </div>

        <span className="hero-track-index" aria-hidden="true">
          01 / 04
        </span>
      </div>
    </section>
  );
}
