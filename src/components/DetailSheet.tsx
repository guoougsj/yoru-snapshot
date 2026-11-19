import {
  CalendarDays,
  Check,
  Clock3,
  Disc3,
  Download,
  ExternalLink,
  HardDriveDownload,
  Heart,
  Mic2,
  Pause,
  Play,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { CachedTrack } from "../lib/audioCache";
import { cacheKey } from "../lib/audioCache";
import { formatLongDuration, formatShortDuration } from "../lib/format";
import { ASMR_DAILY, resourceWorkUrl } from "../lib/resources";
import type { Track, Work } from "../types";
import { CoverArt } from "./CoverArt";

interface DetailSheetProps {
  work: Work | null;
  favorite: boolean;
  isActive: boolean;
  isPlaying: boolean;
  tracks?: Track[];
  tracksLoading?: boolean;
  trackError?: string;
  currentTrackIndex?: number;
  cacheIndex: Record<string, CachedTrack>;
  trackCacheProgress?: Record<string, number>;
  workCacheProgress?: { done: number; total: number; title?: string };
  onClose: () => void;
  onPlay: (work: Work) => void;
  onFavorite: (id: string) => void;
  onAddQueue: (work: Work) => void;
  onPlayTrack: (work: Work, index: number) => void;
  onCacheTrack: (work: Work, track: Track) => void;
  onCacheWork: (work: Work) => void;
  onRemoveCache: (work: Work) => void;
  onRetryTracks: (work: Work) => void;
}

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "—";
  return `${(size / 1048576).toFixed(1)} MB`;
}

export function DetailSheet({
  work,
  favorite,
  isActive,
  isPlaying,
  tracks,
  tracksLoading,
  trackError,
  currentTrackIndex = -1,
  cacheIndex,
  trackCacheProgress,
  workCacheProgress,
  onClose,
  onPlay,
  onFavorite,
  onAddQueue,
  onPlayTrack,
  onCacheTrack,
  onCacheWork,
  onRemoveCache,
  onRetryTracks,
}: DetailSheetProps) {
  const cachedCount = work
    ? Object.values(cacheIndex).filter((entry) => entry.workId === work.id).length
    : 0;
  const hasTracks = Boolean(tracks?.length);

  return (
    <>
      <button
        className={`drawer-backdrop ${work ? "is-open" : ""}`}
        onClick={onClose}
        aria-label="关闭作品详情"
        tabIndex={work ? 0 : -1}
      />
      <aside className={`side-drawer detail-drawer ${work ? "is-open" : ""}`} aria-hidden={!work}>
        {work && (
          <>
            <div className="drawer-header detail-header">
              <span className="detail-id">{work.id}</span>
              <button className="drawer-close" onClick={onClose} aria-label="关闭">
                <X size={18} />
              </button>
            </div>

            <div className="detail-scroll">
              <div className="detail-art">
                <CoverArt art={work.art} title={work.title} />
                <span className="detail-art-stamp">YORU SELECTED</span>
              </div>

              <div className="detail-topline">
                <span className={`detail-status ${work.ageRating ? "is-adult" : ""}`}>
                  <span />
                  {work.ageRating ? `${work.ageRating} · 成人向` : "全年龄 · 环境声音"}
                </span>
                <span className="detail-rating">
                  <Star size={12} fill="currentColor" strokeWidth={0} />
                  {work.rating ? work.rating.toFixed(1) : "NEW"}
                  <small>({work.reviewCount})</small>
                </span>
              </div>

              <h2>{work.title}</h2>
              <p className="detail-subtitle">{work.subtitle}</p>
              <p className="detail-description">{work.description}</p>

              <div className="detail-facts">
                <div>
                  <Disc3 size={15} />
                  <span>
                    <small>社团</small>
                    {work.circle}
                  </span>
                </div>
                <div>
                  <Mic2 size={15} />
                  <span>
                    <small>声优</small>
                    {work.cvs.length ? work.cvs.join(" / ") : "—"}
                  </span>
                </div>
                <div>
                  <Clock3 size={15} />
                  <span>
                    <small>收录时长</small>
                    {formatLongDuration(work.duration)}
                  </span>
                </div>
                <div>
                  <CalendarDays size={15} />
                  <span>
                    <small>发行</small>
                    {work.releaseDate}
                  </span>
                </div>
              </div>

              <div className="detail-tags">
                {work.tags.map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </div>

              <div className="detail-actions">
                <button className="detail-play" onClick={() => onPlay(work)}>
                  {isActive && isPlaying ? (
                    <Pause size={16} fill="currentColor" />
                  ) : (
                    <Play size={16} fill="currentColor" />
                  )}
                  {isActive && isPlaying
                    ? "暂停"
                    : hasTracks
                      ? "播放完整音轨"
                      : "播放本地试听"}
                </button>
                <button
                  className={`detail-icon-button ${favorite ? "is-favorite" : ""}`}
                  onClick={() => onFavorite(work.id)}
                  aria-label={favorite ? "取消收藏" : "收藏"}
                >
                  <Heart size={17} fill={favorite ? "currentColor" : "none"} />
                </button>
                <button
                  className="detail-icon-button"
                  onClick={() => onAddQueue(work)}
                  aria-label="加入队列"
                  title="加入队列"
                >
                  <Plus size={18} />
                </button>
              </div>

              <section className="detail-tracks">
                <div className="detail-tracks-head">
                  <div>
                    <span className="detail-tracks-kicker">OFFICIAL TRACKS</span>
                    <h3>
                      完整音轨 <small>{tracks?.length ?? 0}</small>
                    </h3>
                  </div>
                  <button
                    className="cache-work-button"
                    onClick={() => onCacheWork(work)}
                    disabled={!hasTracks || Boolean(workCacheProgress)}
                    title={hasTracks ? "缓存全部音轨到本机" : "暂无可用音轨"}
                  >
                    <HardDriveDownload size={14} />
                    {workCacheProgress
                      ? `${workCacheProgress.done}/${workCacheProgress.total}`
                      : "缓存全部"}
                  </button>
                </div>

                {tracksLoading && <p className="detail-tracks-note">正在连接 asmr.one 获取音轨…</p>}
                {!tracksLoading && trackError && (
                  <div className="detail-tracks-note is-error">
                    <span>{trackError}</span>
                    <button onClick={() => onRetryTracks(work)}>重新获取</button>
                  </div>
                )}
                {!tracksLoading && !trackError && hasTracks && (
                  <div className="track-list">
                    {tracks!.map((track, index) => {
                      const key = cacheKey(work.id, track.id);
                      const cached = Boolean(cacheIndex[key]);
                      const progress = trackCacheProgress?.[key];
                      const active = currentTrackIndex === index;
                      return (
                        <div className={`track-row ${active ? "is-current" : ""}`} key={track.id}>
                          <button
                            className="track-row-main"
                            onClick={() => onPlayTrack(work, index)}
                            aria-label={`播放 ${track.title}`}
                          >
                            <span className="track-index">
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
                            <span className="track-copy">
                              <strong>{track.title}</strong>
                              <small>
                                {track.format ? `${track.format.toUpperCase()} · ` : ""}
                                {formatShortDuration(track.duration)} · {formatBytes(track.size)}
                              </small>
                            </span>
                          </button>
                          <button
                            className={`track-cache ${cached ? "is-cached" : ""}`}
                            onClick={() => onCacheTrack(work, track)}
                            disabled={!track.downloadable || cached || progress !== undefined}
                            aria-label={
                              cached
                                ? "已缓存"
                                : track.downloadable
                                  ? "缓存到本机"
                                  : "官方未提供下载地址"
                            }
                            title={
                              cached
                                ? "已缓存"
                                : track.downloadable
                                  ? "缓存到本机，离线收听"
                                  : "官方未提供下载地址"
                            }
                          >
                            {cached ? (
                              <Check size={14} />
                            ) : progress !== undefined ? (
                              <span className="cache-percent">
                                {progress > 0 ? `${Math.round(progress * 100)}%` : "…"}
                              </span>
                            ) : (
                              <Download size={14} />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {!tracksLoading && !trackError && !hasTracks && (
                  <p className="detail-tracks-note">
                    暂时拿不到官方音轨，播放器会使用安装包内的本地试听。
                  </p>
                )}

                {cachedCount > 0 && (
                  <button className="cache-clear-button" onClick={() => onRemoveCache(work)}>
                    <Trash2 size={13} />
                    清除本作品的 {cachedCount} 段缓存
                  </button>
                )}
              </section>

              <a
                className="detail-source"
                href={work.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                <span>
                  <small>原始页面</small>
                  在 asmr.one 查看作品
                </span>
                <ExternalLink size={15} />
              </a>

              <a
                className="detail-source detail-source-alt"
                href={resourceWorkUrl(ASMR_DAILY, work.id)}
                target="_blank"
                rel="noreferrer"
              >
                <span>
                  <small>外部资源站 · 需登录</small>
                  在 ASMR Daily 查看作品
                </span>
                <ExternalLink size={15} />
              </a>

              <p className="detail-disclaimer">
                封面为 YORU 生成的策展视觉。完整音轨通过 asmr.one 官方接口播放；离线缓存仅限个人收听，请勿传播。
              </p>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
