import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ChevronDown,
  FileText,
  Heart,
  Pause,
  Play,
  Repeat2,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
} from "lucide-react";
import { originalCoverUrl } from "../lib/covers";
import { formatShortDuration } from "../lib/format";
import type { SubtitleCue } from "../lib/subtitles";
import type { Track, Work } from "../types";
import { CoverArt } from "./CoverArt";

interface NowPlayingPageProps {
  open: boolean;
  work: Work;
  track: Track | null;
  trackIndex: number;
  trackCount: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  repeat: boolean;
  favorite: boolean;
  cues: SubtitleCue[];
  activeCue: number;
  subtitleLabel: string;
  subtitleIsDemo: boolean;
  subtitleCanClear: boolean;
  onClose: () => void;
  onToggle: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (value: number) => void;
  onVolume: (value: number) => void;
  onToggleRepeat: () => void;
  onFavorite: () => void;
  onImportSubtitles: (file: File) => void;
  onClearSubtitles: () => void;
  onUseDemo: () => void;
  onHideDemo: () => void;
}

export function NowPlayingPage({
  open,
  work,
  track,
  trackIndex,
  trackCount,
  isPlaying,
  currentTime,
  duration,
  volume,
  repeat,
  favorite,
  cues,
  activeCue,
  subtitleLabel,
  subtitleIsDemo,
  subtitleCanClear,
  onClose,
  onToggle,
  onNext,
  onPrev,
  onSeek,
  onVolume,
  onToggleRepeat,
  onFavorite,
  onImportSubtitles,
  onClearSubtitles,
  onUseDemo,
  onHideDemo,
}: NowPlayingPageProps) {
  const activeRef = useRef<HTMLParagraphElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [coverFailed, setCoverFailed] = useState(false);
  const coverUrl = originalCoverUrl(work);

  useEffect(() => {
    setCoverFailed(false);
  }, [work.id]);

  useEffect(() => {
    if (!open) return;
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeCue, open]);

  if (!open) return null;

  return (
    <div className="nowplaying-overlay" role="dialog" aria-modal="true" aria-label="播放详情">
      {coverUrl && !coverFailed && (
        <div
          className="nowplaying-backdrop"
          style={{ backgroundImage: `url("${coverUrl}")` }}
          aria-hidden="true"
        />
      )}
      <div className="nowplaying-backdrop-shade" aria-hidden="true" />
      <div className="nowplaying-glow" aria-hidden="true" />

      <header className="nowplaying-top">
        <button className="nowplaying-close" onClick={onClose} aria-label="收起播放详情">
          <ChevronDown size={20} />
        </button>
        <div className="nowplaying-heading">
          <span className="nowplaying-kicker">NOW PLAYING</span>
          <strong>{work.title}</strong>
          <small>
            {work.circle}
            {track ? ` · 第 ${trackIndex + 1}/${trackCount} 段` : " · 本地试听"}
          </small>
        </div>
        <button
          className="nowplaying-import"
          onClick={() => fileRef.current?.click()}
          title="导入 SRT / LRC / TXT 字幕"
        >
          <FileText size={14} />
          导入字幕
        </button>
        <input
          ref={fileRef}
          className="nowplaying-file"
          type="file"
          accept=".srt,.lrc,.txt,text/plain"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onImportSubtitles(file);
            event.target.value = "";
          }}
        />
      </header>

      <div className="nowplaying-main">
        <div className="nowplaying-art">
          {coverUrl && !coverFailed ? (
            <img
              className="nowplaying-cover-image"
              src={coverUrl}
              alt={`${work.title} 封面`}
              referrerPolicy="no-referrer"
              loading="eager"
              decoding="async"
              onError={() => setCoverFailed(true)}
            />
          ) : (
            <CoverArt art={work.art} title={work.title} />
          )}
          <span className="nowplaying-format">
            {track?.format?.toUpperCase() ?? "PREVIEW"}
          </span>
        </div>

        <div className="nowplaying-copy">
          <div className="nowplaying-track">
            <strong>{track?.title ?? work.title}</strong>
            <span>
              {work.circle}
              {track?.duration ? ` · ${formatShortDuration(track.duration)}` : ""}
            </span>
          </div>

          <div className="nowplaying-subtitles" aria-live="polite">
            {cues.length ? (
              cues.map((cue, index) => (
                <p
                  key={`${cue.start}-${index}`}
                  ref={index === activeCue ? activeRef : undefined}
                  className={`lyric-line ${index === activeCue ? "is-active" : ""} ${
                    index < activeCue ? "is-past" : ""
                  }`}
                >
                  {cue.text}
                </p>
              ))
            ) : (
              <div className="lyric-empty-state">
                <FileText size={20} strokeWidth={1.5} />
                <strong>暂无可用字幕</strong>
                <span>
                  如果作品带官方 VTT 会自动显示；也可导入 SRT / LRC / TXT，或查看演示字幕。
                </span>
                <div className="lyric-empty-actions">
                  <button type="button" onClick={() => fileRef.current?.click()}>
                    导入字幕
                  </button>
                  <button type="button" onClick={onUseDemo}>
                    查看演示字幕
                  </button>
                </div>
              </div>
            )}
          </div>

          {(cues.length > 0 || subtitleIsDemo) && (
            <div className="nowplaying-subtitle-meta">
              <span className={subtitleIsDemo ? "is-demo" : ""}>{subtitleLabel}</span>
              {subtitleIsDemo ? (
                <button onClick={onHideDemo}>关闭演示</button>
              ) : subtitleCanClear ? (
                <button onClick={onClearSubtitles}>
                  <Trash2 size={11} />
                  清除导入
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <footer className="nowplaying-controls">
        <div className="nowplaying-progress">
          <span>{formatShortDuration(currentTime)}</span>
          <input
            className="progress-range"
            type="range"
            min={0}
            max={Math.max(duration, 0.1)}
            step={0.05}
            value={Math.min(currentTime, duration || 0)}
            onChange={(event) => onSeek(Number(event.target.value))}
            style={
              {
                "--range-fill": `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
              } as CSSProperties
            }
            aria-label="播放进度"
          />
          <span>{formatShortDuration(duration)}</span>
        </div>

        <div className="nowplaying-buttons">
          <button onClick={onPrev} aria-label="上一段">
            <SkipBack size={19} fill="currentColor" strokeWidth={1.4} />
          </button>
          <button className="nowplaying-play" onClick={onToggle} aria-label={isPlaying ? "暂停" : "播放"}>
            {isPlaying ? (
              <Pause size={21} fill="currentColor" strokeWidth={1.4} />
            ) : (
              <Play size={21} fill="currentColor" strokeWidth={1.4} />
            )}
          </button>
          <button onClick={onNext} aria-label="下一段">
            <SkipForward size={19} fill="currentColor" strokeWidth={1.4} />
          </button>
          <button
            className={repeat ? "is-active" : ""}
            onClick={onToggleRepeat}
            aria-label={repeat ? "关闭单曲循环" : "单曲循环"}
          >
            <Repeat2 size={17} strokeWidth={1.7} />
          </button>
          <button
            className={favorite ? "is-active" : ""}
            onClick={onFavorite}
            aria-label={favorite ? "取消收藏" : "收藏"}
          >
            <Heart size={17} fill={favorite ? "currentColor" : "none"} strokeWidth={1.7} />
          </button>
        </div>

        <div className="nowplaying-volume">
          <Volume2 size={15} strokeWidth={1.7} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(event) => onVolume(Number(event.target.value))}
            aria-label="音量"
          />
        </div>
      </footer>
    </div>
  );
}
