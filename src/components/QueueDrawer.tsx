import { ListMusic, Pause, Play, X } from "lucide-react";
import type { Track, Work } from "../types";
import { originalCoverUrl } from "../lib/covers";
import { formatShortDuration } from "../lib/format";
import { CoverArt } from "./CoverArt";

interface QueueDrawerProps {
  open: boolean;
  current: Work;
  tracks: Track[];
  currentIndex: number;
  label: string;
  isPlaying: boolean;
  onClose: () => void;
  onPlayTrack: (index: number) => void;
  onToggle: () => void;
}

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "—";
  return `${(size / 1048576).toFixed(1)} MB`;
}

export function QueueDrawer({
  open,
  current,
  tracks,
  currentIndex,
  label,
  isPlaying,
  onClose,
  onPlayTrack,
  onToggle,
}: QueueDrawerProps) {
  const coverUrl = originalCoverUrl(current);

  return (
    <>
      <button
        className={`drawer-backdrop ${open ? "is-open" : ""}`}
        onClick={onClose}
        aria-label="关闭播放列表"
        tabIndex={open ? 0 : -1}
      />
      <aside className={`side-drawer queue-drawer ${open ? "is-open" : ""}`} aria-hidden={!open}>
        <div className="drawer-header">
          <div>
            <span className="drawer-kicker">
              <ListMusic size={11} />
              NOW PLAYING
            </span>
            <h2>播放列表</h2>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="queue-now">
          <p className="queue-section-label">当前作品</p>
          <div className="queue-now-card">
            <div className="queue-now-cover">
              <CoverArt art={current.art} title={current.title} showMeta={false} />
              {coverUrl && (
                <img
                  src={coverUrl}
                  alt=""
                  loading="eager"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={(event) => event.currentTarget.remove()}
                />
              )}
            </div>
            <div className="queue-now-copy">
              <span>{label}</span>
              <strong>{current.title}</strong>
              <small>
                {current.circle} · {tracks.length} 段音轨
              </small>
            </div>
            <button
              className="queue-now-toggle"
              onClick={onToggle}
              aria-label={isPlaying ? "暂停" : "播放"}
            >
              {isPlaying ? (
                <Pause size={16} fill="currentColor" strokeWidth={1.4} />
              ) : (
                <Play size={16} fill="currentColor" strokeWidth={1.4} />
              )}
            </button>
          </div>
        </div>

        <div className="queue-next">
          <div className="queue-next-head">
            <p className="queue-section-label">当前作品音轨</p>
            <span>{tracks.length} 段</span>
          </div>

          {tracks.length === 0 ? (
            <div className="queue-empty">
              <span className="queue-empty-icon">
                <ListMusic size={20} />
              </span>
              <p>音轨还在加载</p>
              <small>打开作品详情并稍等片刻，播放列表会显示当前作品的指定格式音轨。</small>
            </div>
          ) : (
            <div className="queue-track-list">
              {tracks.map((track, index) => {
                const active = index === currentIndex;
                return (
                  <button
                    className={`queue-track ${active ? "is-current" : ""}`}
                    key={track.id}
                    onClick={() => (active ? onToggle() : onPlayTrack(index))}
                    aria-label={`${active ? "切换" : "播放"} ${track.title}`}
                  >
                    <span className="queue-track-index">
                      {active ? (
                        <span className="track-eq" aria-hidden="true">
                          <i />
                          <i />
                          <i />
                        </span>
                      ) : (
                        String(index + 1).padStart(2, "0")
                      )}
                    </span>
                    <span className="queue-track-copy">
                      <strong>{track.title}</strong>
                      <small>
                        {track.format ? `${track.format.toUpperCase()} · ` : ""}
                        {track.version ? `${track.version} · ` : ""}
                        {formatShortDuration(track.duration)} · {formatBytes(track.size)}
                      </small>
                    </span>
                    <span className="queue-track-action">
                      {active && isPlaying ? (
                        <Pause size={13} fill="currentColor" />
                      ) : (
                        <Play size={13} fill="currentColor" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="drawer-footer">
          <ListMusic size={13} />
          播放列表只包含当前作品 · {label}
        </div>
      </aside>
    </>
  );
}
