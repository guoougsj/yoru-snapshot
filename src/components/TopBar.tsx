import { useEffect, useRef, useState } from "react";
import {
  Bell,
  ExternalLink,
  Heart,
  ListMusic,
  Maximize2,
  RadioTower,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { LibraryData, SourceInfo } from "../types";
import { formatSyncDate } from "../lib/format";
import {
  DEFAULT_SNAPSHOT_URL,
  forgetRouteHealth,
  FURINA_RELAY,
  parseCustomSource,
  presetLabel,
  readDataSource,
  saveDataSource,
  SOURCE_PRESETS,
  type DataSourcePreset,
} from "../lib/netSettings";
import { testCustomSource } from "../lib/nativeSource";
import { isSecureStorageMemoryOnly } from "../lib/secureStorage";
import { ASMR_DAILY } from "../lib/resources";
import {
  clearAsmrDailySession,
  loginAsmrDaily,
  saveAsmrDailySession,
  testAsmrDailyToken,
  type LibrarySourceId,
} from "../lib/asmrDaily";

interface TopBarProps {
  query: string;
  onQuery: (value: string) => void;
  source: SourceInfo;
  library: LibraryData;
  syncing: boolean;
  searchRef: React.RefObject<HTMLInputElement>;
  onSync: () => void;
  favoritesCount: number;
  queueCount: number;
  cacheCount: number;
  cacheSize: number;
  onFavorites: () => void;
  onQueue: () => void;
  onExpand: () => void;
  onClearCache: () => void;
  onSourceChanged: () => void;
  activeSourceId: LibrarySourceId;
  asmrDailyToken: string;
  asmrDailyUser: string;
  asmrDailySessionReady: boolean;
  onSwitchSource: (id: LibrarySourceId) => void;
  onAsmrDailySessionChanged: () => void | Promise<void>;
}

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0 MB";
  return `${(size / 1048576).toFixed(1)} MB`;
}

export function TopBar({
  query,
  onQuery,
  source,
  syncing,
  searchRef,
  onSync,
  favoritesCount,
  queueCount,
  cacheCount,
  cacheSize,
  onFavorites,
  onQueue,
  onExpand,
  onClearCache,
  onSourceChanged,
  activeSourceId,
  asmrDailyToken,
  asmrDailyUser,
  asmrDailySessionReady,
  onSwitchSource,
  onAsmrDailySessionChanged,
}: TopBarProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [sourcePreset, setSourcePreset] = useState<DataSourcePreset>(
    () => readDataSource().preset,
  );
  const [sourceDraft, setSourceDraft] = useState(() => readDataSource().raw);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourceMessage, setSourceMessage] = useState("");
  const [dailyUsername, setDailyUsername] = useState("");
  const [dailyPassword, setDailyPassword] = useState("");
  const [dailyTokenDraft, setDailyTokenDraft] = useState("");
  const [dailyBusy, setDailyBusy] = useState(false);
  const [dailyMessage, setDailyMessage] = useState("");
  const actionsRef = useRef<HTMLDivElement>(null);
  const dailyMemoryOnly = isSecureStorageMemoryOnly();

  useEffect(() => {
    if (!profileOpen && !notificationsOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) {
        setProfileOpen(false);
        setNotificationsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileOpen(false);
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [profileOpen, notificationsOpen]);

  function runAndClose(action: () => void) {
    action();
    setProfileOpen(false);
    setNotificationsOpen(false);
  }

  function expectedKind(preset: DataSourcePreset) {
    return preset === "snapshot" ? "snapshot" : "relay";
  }

  async function handleTestSource() {
    const raw = sourceDraft.trim();
    const parsed = parseCustomSource(raw);
    if (!parsed) {
      setSourceMessage("地址无效，请填写 http(s) 地址");
      return;
    }
    if (parsed.kind !== expectedKind(sourcePreset)) {
      setSourceMessage(
        sourcePreset === "snapshot"
          ? "这不是快照 JSON 地址"
          : "这是快照地址，请选择“静态快照”",
      );
      return;
    }
    setSourceBusy(true);
    setSourceMessage("正在测试…");
    try {
      setSourceMessage(await testCustomSource(raw));
    } catch (error) {
      setSourceMessage(error instanceof Error ? error.message : "测试失败");
    } finally {
      setSourceBusy(false);
    }
  }

  function handleSaveSource() {
    const raw = sourceDraft.trim();
    const parsed = parseCustomSource(raw);
    if (!parsed) {
      setSourceMessage("地址无效，请填写 http(s) 地址");
      return;
    }
    if (parsed.kind !== expectedKind(sourcePreset)) {
      setSourceMessage(
        sourcePreset === "snapshot"
          ? "这不是快照 JSON 地址"
          : "这是快照地址，请选择“静态快照”",
      );
      return;
    }
    saveDataSource(sourcePreset, raw);
    forgetRouteHealth();
    setSourceDraft(raw);
    setSourceMessage("已保存，正在同步");
    onSourceChanged();
  }

  function handlePreset(preset: DataSourcePreset) {
    if (preset === "snapshot") {
      const parsed = parseCustomSource(sourceDraft);
      const raw = parsed?.kind === "snapshot" ? sourceDraft : DEFAULT_SNAPSHOT_URL;
      saveDataSource("snapshot", raw);
      setSourceDraft(raw);
      setSourcePreset("snapshot");
      forgetRouteHealth();
      setSourceMessage("已使用你的 GitHub 快照，正在同步");
      onSourceChanged();
      return;
    }

    if (preset === "custom") {
      const parsed = parseCustomSource(sourceDraft);
      const usable = parsed?.kind === "relay";
      saveDataSource("custom", usable ? sourceDraft : "");
      setSourcePreset("custom");
      if (usable) {
        forgetRouteHealth();
        setSourceMessage("已切换到自建中继，正在同步");
        onSourceChanged();
      } else if (!sourceDraft.trim()) {
        setSourceDraft(FURINA_RELAY);
        setSourceMessage("已填入可用的内置中继地址，可直接保存或替换成自己的");
      } else {
        setSourceMessage("填入中继地址后保存");
      }
      return;
    }

    const saved = saveDataSource(preset, sourceDraft);
    if (!saved) {
      setSourceMessage("切换失败，请重试");
      return;
    }
    forgetRouteHealth();
    setSourcePreset(preset);
    setSourceMessage(`已切换到${presetLabel(preset)}，正在同步`);
    onSourceChanged();
  }

  async function handleDailyLogin() {
    const username = dailyUsername.trim();
    if (!username || !dailyPassword) {
      setDailyMessage("请填写 ASMR Daily 用户名和密码");
      return;
    }
    setDailyBusy(true);
    setDailyMessage("正在登录 ASMR Daily…");
    try {
      const session = await loginAsmrDaily(username, dailyPassword);
      await saveAsmrDailySession(session.token, session.username);
      setDailyPassword("");
      setDailyTokenDraft("");
      setDailyMessage(`已登录 · ${session.username}`);
      await onAsmrDailySessionChanged();
    } catch (error) {
      setDailyMessage(error instanceof Error ? error.message : "登录失败");
    } finally {
      setDailyBusy(false);
    }
  }

  async function handleDailyTokenTest() {
    const token = dailyTokenDraft.trim() || asmrDailyToken;
    if (!token) {
      setDailyMessage("请先粘贴 ASMR Daily Token");
      return;
    }
    setDailyBusy(true);
    setDailyMessage("正在验证 Token…");
    try {
      const total = await testAsmrDailyToken(token);
      setDailyMessage(`Token 可用 · 站点共 ${total} 件作品`);
    } catch (error) {
      setDailyMessage(error instanceof Error ? error.message : "Token 验证失败");
    } finally {
      setDailyBusy(false);
    }
  }

  async function handleDailyTokenSave() {
    const token = dailyTokenDraft.trim();
    if (!token) {
      setDailyMessage("请先粘贴 ASMR Daily Token");
      return;
    }
    setDailyBusy(true);
    setDailyMessage("正在验证 Token…");
    try {
      const total = await testAsmrDailyToken(token);
      await saveAsmrDailySession(token);
      setDailyTokenDraft("");
      setDailyMessage(
        `${dailyMemoryOnly ? "Token 已载入当前会话" : "Token 已安全保存"} · 站点共 ${total} 件作品`,
      );
      await onAsmrDailySessionChanged();
    } catch (error) {
      setDailyMessage(error instanceof Error ? error.message : "Token 保存失败");
    } finally {
      setDailyBusy(false);
    }
  }

  async function handleDailyClear() {
    setDailyBusy(true);
    setDailyMessage("正在清除 ASMR Daily Token…");
    try {
      await clearAsmrDailySession();
      await onAsmrDailySessionChanged();
      setDailyMessage("已清除 ASMR Daily Token");
    } catch (error) {
      setDailyMessage(error instanceof Error ? error.message : "Token 清除失败");
    } finally {
      setDailyBusy(false);
    }
  }

  return (
    <header className="topbar">
      <div className="topbar-context">
        <span className="context-kicker">你的夜间声音档案</span>
        <span className="context-date">
          {new Intl.DateTimeFormat("zh-CN", {
            month: "long",
            day: "numeric",
            weekday: "long",
          }).format(new Date())}
        </span>
      </div>

      <label className="search-box">
        <Search size={15} strokeWidth={1.8} />
        <input
          ref={searchRef}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="搜索作品、社团、声优"
          aria-label="搜索作品、社团、声优"
        />
        {query ? (
          <button type="button" onClick={() => onQuery("")} aria-label="清空搜索">
            <X size={13} />
          </button>
        ) : (
          <kbd>/</kbd>
        )}
      </label>

      <div className="topbar-actions" ref={actionsRef}>
        <div className={`connection-pill ${source.mode === "live" ? "live" : ""}`}>
          <span className="connection-dot" />
          <span>{source.mode === "live" ? `${source.name} · 实时` : `${source.name} · 快照`}</span>
          <small>{formatSyncDate(source.fetchedAt)}</small>
        </div>
        <button
          className={`sync-button ${syncing ? "is-syncing" : ""}`}
          onClick={onSync}
          disabled={syncing}
        >
          <RefreshCw size={14} />
          <span>{syncing ? "同步中" : "同步"}</span>
        </button>
        <button
          className="icon-button notification"
          aria-label="数据通知"
          aria-expanded={notificationsOpen}
          onClick={() => {
            setProfileOpen(false);
            setNotificationsOpen((open) => !open);
          }}
        >
          <Bell size={17} strokeWidth={1.6} />
          <span className="notification-dot" />
        </button>
        <button
          className={`avatar ${profileOpen ? "is-open" : ""}`}
          aria-label="个人资料"
          aria-expanded={profileOpen}
          onClick={() => {
            setNotificationsOpen(false);
            setProfileOpen((open) => !open);
          }}
        >
          <span>夜</span>
          <i />
        </button>

        {profileOpen && (
          <div className="profile-popover" role="dialog" aria-label="个人资料">
            <div className="profile-head">
              <span className="profile-avatar">夜</span>
              <div className="profile-identity">
                <strong>夜行听众</strong>
                <small>YORU · 夜音 v1.4.3</small>
              </div>
              <button
                className="popover-close"
                onClick={() => setProfileOpen(false)}
                aria-label="关闭个人资料"
              >
                <X size={15} />
              </button>
            </div>

            <div className="profile-stats">
              <div>
                <strong>{favoritesCount}</strong>
                <span>收藏</span>
              </div>
              <div>
                <strong>{queueCount}</strong>
                <span>音轨</span>
              </div>
              <div>
                <strong>{cacheCount}</strong>
                <span>缓存</span>
              </div>
            </div>

            <div className="profile-cache">
              <div>
                <span>离线缓存</span>
                <strong>{formatBytes(cacheSize)}</strong>
              </div>
              <button onClick={onClearCache} disabled={cacheCount === 0}>
                <Trash2 size={12} />
                清除
              </button>
            </div>

            <div className="profile-source-switch">
              <button
                className={activeSourceId === "asmr-one" ? "is-active" : ""}
                onClick={() => onSwitchSource("asmr-one")}
              >
                asmr.one
              </button>
              <button
                className={activeSourceId === "asmr-daily" ? "is-active" : ""}
                onClick={() => onSwitchSource("asmr-daily")}
              >
                ASMR Daily
              </button>
            </div>

            <details className="source-config daily-config">
              <summary>
                <span>
                  <RadioTower size={13} />
                  ASMR Daily 账号
                </span>
                <small>
                  {!asmrDailySessionReady
                    ? "正在恢复…"
                    : asmrDailyUser ||
                      (asmrDailyToken
                        ? dailyMemoryOnly
                          ? "当前会话已配置"
                          : "已安全保存"
                        : "未配置")}
                </small>
              </summary>
              <p>
                ASMR Daily 没有公开注册入口，账号由站点管理员创建；不保存密码。Android
                上 Token 通过 Keystore 加密保存；Web 上仅保存在当前页面内存中，刷新后需重新登录。
              </p>
              <input
                value={dailyUsername}
                onChange={(event) => {
                  setDailyUsername(event.target.value);
                  setDailyMessage("");
                }}
                placeholder="ASMR Daily 用户名"
                autoComplete="username"
              />
              <input
                value={dailyPassword}
                onChange={(event) => {
                  setDailyPassword(event.target.value);
                  setDailyMessage("");
                }}
                placeholder="密码"
                type="password"
                autoComplete="current-password"
              />
              <div className="source-config-actions">
                <button
                  type="button"
                  onClick={handleDailyLogin}
                  disabled={dailyBusy || !asmrDailySessionReady}
                >
                  {dailyBusy ? "处理中…" : "登录并切换"}
                </button>
                <button
                  type="button"
                  onClick={handleDailyTokenTest}
                  disabled={dailyBusy || !asmrDailySessionReady}
                >
                  测试 Token
                </button>
              </div>
              <input
                value={dailyTokenDraft}
                onChange={(event) => {
                  setDailyTokenDraft(event.target.value);
                  setDailyMessage("");
                }}
                placeholder="或粘贴 auth.token"
                type="password"
                autoComplete="off"
              />
              <div className="source-config-actions">
                <button
                  type="button"
                  onClick={handleDailyTokenSave}
                  disabled={dailyBusy || !asmrDailySessionReady}
                >
                  {dailyMemoryOnly ? "使用 Token" : "保存 Token"}
                </button>
                <button
                  type="button"
                  onClick={handleDailyClear}
                  disabled={dailyBusy || !asmrDailySessionReady}
                >
                  清除
                </button>
              </div>
              {dailyMessage && <small className="source-config-message">{dailyMessage}</small>}
            </details>

            <details className="source-config">
              <summary>
                <span>
                  <RadioTower size={13} />
                  网络与数据源
                </span>
                <small>{presetLabel(sourcePreset)}</small>
              </summary>
              <p>选择线路后立即保存并同步；只有自建中继和静态快照需要填地址。</p>
              <div className="source-presets">
                {SOURCE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={sourcePreset === preset.id ? "is-active" : ""}
                    onClick={() => handlePreset(preset.id)}
                  >
                    <strong>{preset.label}</strong>
                    <small>{preset.detail}</small>
                  </button>
                ))}
              </div>
              {(sourcePreset === "custom" || sourcePreset === "snapshot") && (
                <div className="source-custom">
                  <input
                    value={sourceDraft}
                    onChange={(event) => {
                      setSourceDraft(event.target.value);
                      setSourceMessage("");
                    }}
                    placeholder={
                      sourcePreset === "snapshot"
                        ? "https://raw.githubusercontent.com/.../live-seed.json"
                        : "https://your-worker.workers.dev"
                    }
                    spellCheck={false}
                  />
                  <div className="source-config-actions">
                    <button type="button" onClick={handleSaveSource} disabled={sourceBusy}>
                      保存并同步
                    </button>
                    <button type="button" onClick={handleTestSource} disabled={sourceBusy}>
                      {sourceBusy ? "测试中…" : "测试连接"}
                    </button>
                  </div>
                </div>
              )}
              {sourceMessage && <small className="source-config-message">{sourceMessage}</small>}
            </details>

            <div className="profile-actions">
              <button onClick={() => runAndClose(onFavorites)}>
                <Heart size={15} />
                我的收藏
                {favoritesCount > 0 && <small>{favoritesCount}</small>}
              </button>
              <button onClick={() => runAndClose(onQueue)}>
                <ListMusic size={15} />
                播放列表
                <small>{queueCount}</small>
              </button>
              <button onClick={() => runAndClose(onExpand)}>
                <Maximize2 size={15} />
                播放详情与字幕
              </button>
              <button
                onClick={() =>
                  runAndClose(() =>
                    window.open(ASMR_DAILY.url, "_blank", "noopener,noreferrer"),
                  )
                }
              >
                <ExternalLink size={15} />
                {ASMR_DAILY.name} 资源站
                <small>外部</small>
              </button>
              <button onClick={onSync} disabled={syncing}>
                <RefreshCw size={15} />
                {syncing ? "正在同步…" : `同步 ${source.name}`}
              </button>
            </div>

            <div className="profile-foot">
              <span className={source.mode === "live" ? "is-live" : ""}>
                <i />
                {source.mode === "live" ? "实时数据" : "本地快照"}
              </span>
              <small>{formatSyncDate(source.fetchedAt)}</small>
            </div>
          </div>
        )}

        {notificationsOpen && (
          <div className="notification-popover" role="dialog" aria-label="数据通知">
            <div className="popover-head">
              <strong>通知</strong>
              <button
                className="popover-close"
                onClick={() => setNotificationsOpen(false)}
                aria-label="关闭通知"
              >
                <X size={15} />
              </button>
            </div>
            <div className="notification-row">
              <span className={`notification-badge ${source.mode === "live" ? "is-live" : ""}`} />
              <div>
                <strong>{source.mode === "live" ? "实时数据已连接" : "正在使用本地快照"}</strong>
                <small>{formatSyncDate(source.fetchedAt)} · {source.transport || "local"}</small>
              </div>
            </div>
            <div className="notification-row">
              <span className={`notification-badge ${cacheCount ? "is-cache" : ""}`} />
              <div>
                <strong>{cacheCount ? `${cacheCount} 段音轨已缓存` : "暂无离线缓存"}</strong>
                <small>{formatBytes(cacheSize)} · 仅保存在本机</small>
              </div>
            </div>
            <button className="notification-sync" onClick={onSync} disabled={syncing}>
              <RefreshCw size={13} />
              {syncing ? "同步中…" : "立即同步 asmr.one"}
            </button>
            <p className="popover-note">通知只反映当前设备的数据状态，不会上传任何内容。</p>
          </div>
        )}
      </div>
    </header>
  );
}
