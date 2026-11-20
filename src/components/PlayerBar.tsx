import {
  Heart,
  ListMusic,
  Maximize2,
  Pause,
  Play,
  Repeat2,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { CSSProperties } from "react";
import type { Track, Work } from "../types";
import { CoverArt } from "./CoverArt";
import { formatShortDuration } from "../lib/format";

interface PlayerBarProps {
  work: Work;
  track: Track | null;
  trackIndex: number;
  trackCount: number;
  isPreview: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  repeat: boolean;
  favorite: boolean;
  queueCount: number;
  queueOpen: boolean;
  onToggle: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (value: number) => void;
  onVolume: (value: number) => void;
  onToggleMute: () => void;
  onToggleRepeat: () => void;
  onQueue: () => void;
  onFavorite: () => void;
  onExpand: () => void;
}

export function PlayerBar({
  work,
  track,
  trackIndex,
  trackCount,
  isPreview,
  isPlaying,
  currentTime,
  duration,
  volume,
  repeat,
  favorite,
  queueCount,
  queueOpen,
  onToggle,
  onNext,
  onPrev,
  onSeek,
  onVolume,
  onToggleMute,
  onToggleRepeat,
  onQueue,
  onFavorite,
  onExpand,
}: PlayerBarProps) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.45 ? Volume1 : Volume2;

  return (
    <footer className="player-bar">
      <div className="player-track">
        <div className="player-cover">
          <CoverArt art={work.art} title={work.title} showMeta={false} />
          {work.coverUrl && (
            <img
              className="player-cover-image"
              src={work.coverUrl}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={(event) => event.currentTarget.remove()}
            />
          )}
        </div>
        <div className="player-copy">
          <div className="player-title-line">
            <strong>{work.title}</strong>
            {isPlaying && (
              <span className="mini-eq" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            )}
          </div>
          <span>
            {work.circle}
            <i />
            {work.cvs[0] ?? "asmr.one"}
          </span>
          {track && !isPreview && (
            <small className="player-track-label">
              第 {trackIndex + 1}/{trackCount} 段 · {track.title}
            </small>
          )}
        </div>
        <button
          className={`player-fav ${favorite ? "is-favorite" : ""}`}
          onClick={onFavorite}
          aria-label={favorite ? "取消收藏" : "收藏当前作品"}
        >
          <Heart size={16} fill={favorite ? "currentColor" : "none"} strokeWidth={1.7} />
        </button>
      </div>

      <div className="player-center">
        <div className="player-controls">
          <button className="small-control" onClick={onPrev} aria-label="上一段">
            <SkipBack size={16} fill="currentColor" strokeWidth={1.4} />
          </button>
          <button
            className="main-play"
            onClick={onToggle}
            aria-label={isPlaying ? "暂停" : "播放"}
          >
            {isPlaying ? (
              <Pause size={18} fill="currentColor" strokeWidth={1.4} />
            ) : (
              <Play size={18} fill="currentColor" strokeWidth={1.4} />
            )}
          </button>
          <button className="small-control" onClick={onNext} aria-label="下一段">
            <SkipForward size={16} fill="currentColor" strokeWidth={1.4} />
          </button>
          <button
            className={`small-control repeat ${repeat ? "active" : ""}`}
            onClick={onToggleRepeat}
            aria-label={repeat ? "关闭单曲循环" : "单曲循环"}
            aria-pressed={repeat}
          >
            <Repeat2 size={15} />
            {repeat && <span className="repeat-dot" />}
          </button>
        </div>

        <div className="player-timeline">
          <span>{formatShortDuration(currentTime)}</span>
          <input
            className="progress-range"
            type="range"
            min={0}
            max={Math.max(duration, 0.1)}
            step={0.05}
            value={Math.min(currentTime, duration || 0)}
            onChange={(event) => onSeek(Number(event.target.value))}
            style={{ "--range-fill": `${progress}%` } as CSSProperties}
            aria-label="播放进度"
          />
          <span>{formatShortDuration(duration)}</span>
        </div>
      </div>

      <div className="player-extra">
        <button className="expand-button" onClick={onExpand} aria-label="打开播放详情" title="播放详情">
          <Maximize2 size={15} strokeWidth={1.7} />
        </button>
        <span className={`preview-chip ${isPreview ? "" : "is-full"}`}>
          {isPreview ? "LOCAL PREVIEW" : "FULL TRACK"}
        </span>
        <div className="volume-control">
          <button onClick={onToggleMute} aria-label={volume === 0 ? "打开声音" : "静音"}>
            <VolumeIcon size={16} strokeWidth={1.7} />
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(event) => onVolume(Number(event.target.value))}
            style={{ "--range-fill": `${volume * 100}%` } as CSSProperties}
            aria-label="音量"
          />
        </div>
        <button
          className={`queue-button ${queueOpen ? "active" : ""}`}
          onClick={onQueue}
          aria-label="播放列表"
        >
          <ListMusic size={17} strokeWidth={1.7} />
          <span>{queueCount}</span>
        </button>
      </div>
    </footer>
  );
}
