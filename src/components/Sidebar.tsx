import {
  Clock3,
  Compass,
  Disc3,
  ExternalLink,
  Headphones,
  Heart,
  Home,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import type { Playlist, SourceInfo } from "../types";
import { formatSyncDate } from "../lib/format";
import { EXTERNAL_RESOURCES } from "../lib/resources";

interface SidebarProps {
  playlists: Playlist[];
  source: SourceInfo;
  activeView: "home" | "favorites" | "recent";
  favoritesCount: number;
  syncing: boolean;
  onHome: () => void;
  onExplore: () => void;
  onFavorites: () => void;
  onRecent: () => void;
  onPlaylist: (playlist: Playlist) => void;
  onSync: () => void;
}

export function Sidebar({
  playlists,
  source,
  activeView,
  favoritesCount,
  syncing,
  onHome,
  onExplore,
  onFavorites,
  onRecent,
  onPlaylist,
  onSync,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <button className="brand" onClick={onHome} aria-label="回到 YORU 首页">
        <span className="brand-mark" aria-hidden="true">
          <span className="brand-moon" />
          <span className="brand-orbit" />
        </span>
        <span className="brand-word">
          <strong>YORU</strong>
          <small>夜音 · ASMR ROOM</small>
        </span>
      </button>

      <div className="sidebar-section">
        <p className="sidebar-label">LISTEN</p>
        <nav className="side-nav" aria-label="主导航">
          <button className={activeView === "home" ? "active" : ""} onClick={onHome}>
            <Home size={16} strokeWidth={1.7} />
            <span>首页</span>
            <i className="nav-dot" />
          </button>
          <button onClick={onExplore}>
            <Compass size={16} strokeWidth={1.7} />
            <span>探索作品</span>
          </button>
          <button className={activeView === "favorites" ? "active" : ""} onClick={onFavorites}>
            <Heart size={16} strokeWidth={1.7} />
            <span>我的收藏</span>
            {favoritesCount > 0 && <em>{favoritesCount}</em>}
          </button>
          <button className={activeView === "recent" ? "active" : ""} onClick={onRecent}>
            <Clock3 size={16} strokeWidth={1.7} />
            <span>播放队列</span>
          </button>
        </nav>
      </div>

      <div className="sidebar-section sidebar-playlists">
        <div className="sidebar-heading">
          <p className="sidebar-label">MY PLAYLISTS</p>
          <span className="tiny-count">{playlists.length}</span>
        </div>
        {playlists.map((playlist, index) => (
          <button
            className="playlist-link"
            key={playlist.id}
            onClick={() => onPlaylist(playlist)}
            title={`播放「${playlist.title}」`}
          >
            <span className="playlist-link-index">{String(index + 1).padStart(2, "0")}</span>
            <span className="playlist-link-copy">
              <strong>{playlist.title}</strong>
              <small>{playlist.tag}</small>
            </span>
            <span className="playlist-link-play">
              <Disc3 size={14} strokeWidth={1.7} />
            </span>
          </button>
        ))}
      </div>

      <div className="sidebar-section sidebar-resources">
        <p className="sidebar-label">RESOURCES</p>
        {EXTERNAL_RESOURCES.map((resource) => (
          <a
            className="resource-link"
            key={resource.id}
            href={resource.url}
            target="_blank"
            rel="noreferrer"
            title={`打开 ${resource.name}`}
          >
            <span className="resource-icon">
              <ExternalLink size={14} strokeWidth={1.7} />
            </span>
            <span className="resource-copy">
              <strong>{resource.name}</strong>
              <small>{resource.description}</small>
            </span>
            <ExternalLink className="resource-arrow" size={12} strokeWidth={1.7} />
          </a>
        ))}
      </div>

      <div className="sidebar-spacer" />

      <div className={`source-card ${source.mode === "live" ? "is-live" : ""}`}>
        <div className="source-top">
          <span className="source-logo">
            <span className="source-dot" />
            <Headphones size={15} strokeWidth={1.7} />
          </span>
          <span>
            <strong>asmr.one</strong>
            <small>{source.mode === "live" ? "实时作品流" : "作品快照"}</small>
          </span>
          <button
            className={syncing ? "syncing" : ""}
            onClick={onSync}
            disabled={syncing}
            aria-label="同步 asmr.one"
            title="抓取最新作品"
          >
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="source-foot">
          <span>{source.mode === "live" ? "LIVE" : "SNAPSHOT"}</span>
          <span>同步于 {formatSyncDate(source.fetchedAt)}</span>
        </div>
      </div>

      <div className="sidebar-foot">
        <span>
          <SlidersHorizontal size={12} />
          HIGH · 48kHz
        </span>
        <span className="ver">v1.3.0</span>
      </div>
    </aside>
  );
}
