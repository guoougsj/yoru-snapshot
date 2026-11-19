import { ListMusic, Pause, Play, Trash2, X } from "lucide-react";
import type { Work } from "../types";
import { CoverArt } from "./CoverArt";
import { formatLongDuration, formatShortDuration } from "../lib/format";

interface QueueDrawerProps {
  open: boolean;
  current: Work;
  queue: Work[];
  isPlaying: boolean;
  onClose: () => void;
  onPlay: (work: Work) => void;
  onToggle: () => void;
  onRemove: (id: string) => void;
}

export function QueueDrawer({
  open,
  current,
  queue,
  isPlaying,
  onClose,
  onPlay,
  onToggle,
  onRemove,
}: QueueDrawerProps) {
  const upcoming = queue.filter((work) => work.id !== current.id);

  return (
    <>
      <button
        className={`drawer-backdrop ${open ? "is-open" : ""}`}
        onClick={onClose}
        aria-label="关闭播放队列"
        tabIndex={open ? 0 : -1}
      />
      <aside className={`side-drawer queue-drawer ${open ? "is-open" : ""}`} aria-hidden={!open}>
        <div className="drawer-header">
          <div>
            <span className="drawer-kicker">
              <ListMusic size={11} />
              UP NEXT
            </span>
            <h2>播放队列</h2>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="queue-now">
          <p className="queue-section-label">正在播放</p>
          <div className="queue-now-card">
            <div className="queue-now-cover">
              <CoverArt art={current.art} title={current.title} showMeta={false} />
            </div>
            <div className="queue-now-copy">
              <span>{current.subtitle || "NOW PLAYING"}</span>
              <strong>{current.title}</strong>
              <small>
                {current.circle} · {formatLongDuration(current.duration)}
              </small>
            </div>
            <button className="queue-now-toggle" onClick={onToggle} aria-label={isPlaying ? "暂停" : "播放"}>
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
            <p className="queue-section-label">接下来</p>
            <span>{upcoming.length} 项</span>
          </div>

          {upcoming.length === 0 ? (
            <div className="queue-empty">
              <span className="queue-empty-icon">
                <ListMusic size={20} />
              </span>
              <p>队列已经空了</p>
              <small>从作品集里挑一段，加入今晚的声音。</small>
            </div>
          ) : (
            <div className="queue-list">
              {upcoming.map((work, index) => (
                <div className="queue-row" key={work.id}>
                  <button className="queue-row-main" onClick={() => onPlay(work)}>
                    <span className="queue-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className="queue-thumb">
                      <CoverArt art={work.art} title={work.title} showMeta={false} />
                    </span>
                    <span className="queue-row-copy">
                      <strong>{work.title}</strong>
                      <small>
                        {work.circle} · {formatShortDuration(work.duration)}
                      </small>
                    </span>
                    <Play className="queue-row-play" size={13} fill="currentColor" />
                  </button>
                  <button
                    className="queue-remove"
                    onClick={() => onRemove(work.id)}
                    aria-label={`从队列移除 ${work.title}`}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="drawer-footer">
          <Trash2 size={13} />
          队列只保存在本次会话中 · 试听为 YORU 本地环境音
        </div>
      </aside>
    </>
  );
}
