# YORU 数据中继与静态快照

asmr.one 的官方 API 在 2026 年 8 月起对部分地区（包括中国大陆）不可达，公共 CORS 中继也经常限流。这个目录提供两种只读中继，以及自检与快照制作方法。

中继只转发**作品元数据、音轨列表和小字幕文本**，不代理音频。APK 仍然直接从官方媒体 CDN 播放/缓存音频。

## 一、自检中继

### 1. App 内自检

```text
头像 → 网络与数据源 → 自建中继 → 填入地址 → 测试连接
```

看到「中继可用 · 本页 20 个作品」即通过。静态快照会显示「快照可用 · 24 个作品」。

### 2. 命令行自检

```powershell
# 自建中继
npm.cmd run relay:check -- http://127.0.0.1:8788
npm.cmd run relay:check -- https://你的-worker.workers.dev

# 静态快照
npm.cmd run relay:check -- https://raw.githubusercontent.com/用户/仓库/main/data/live-seed.json
```

通过时会输出类似：

```text
✓ 中继可用  HTTP 200  4841ms
  线路 fallback，本页 20 件作品
✓ 音轨可用  4817ms  audio=10  text=15
✓ /health  {"ok":true,"service":"yoru-node-relay","fallback":"https://asmr.furina.in/api"}
```

`线路 direct` 表示直连官方 API；`线路 fallback` 表示官方 API 不可达，已自动走内置只读中继。

### 3. 直接测 HTTP

```powershell
# 健康检查（Worker / Node 中继都提供）
curl.exe https://你的-worker.workers.dev/health
curl.exe http://127.0.0.1:8788/health

# 作品列表
curl.exe "http://127.0.0.1:8788/?url=https%3A%2F%2Fapi.asmr-200.com%2Fapi%2Fworks%3Fpage%3D1"
```

返回 JSON 且包含 `works` 数组即为正常。

## 二、方案 A：Cloudflare Worker（推荐）

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Workers** → **Start with Hello World**。
2. 把 `relay/cloudflare-worker.js` 的全部内容粘贴到编辑器，替换默认代码。
3. 点击 **Deploy**，复制 `https://<名字>.<账号>.workers.dev` 地址。
4. 先运行命令行自检：
   ```powershell
   npm.cmd run relay:check -- https://你的-worker.workers.dev
   ```
5. 打开 YORU → 头像 → **网络与数据源** → **自建中继** → 填入地址 → **测试连接** → **保存并同步**。

Worker 会先尝试直连官方 API；直连失败时自动回退到内置只读中继。它带 5 分钟边缘缓存。

如果 `workers.dev` 在你的网络也不可达，可以给 Worker 绑定自己的域名，或改用方案 B。

## 三、方案 B：Node 中继

在 VPS、NAS 或电脑上运行：

```powershell
npm.cmd run relay
# 或者
node relay/node-relay.mjs
```

默认监听 `8788`。自检：

```powershell
npm.cmd run relay:check -- http://127.0.0.1:8788
```

手机和电脑在同一 Wi-Fi 时，在 App 内填：

```text
http://<电脑局域网 IP>:8788
```

例如 `http://192.168.1.20:8788`。Windows 防火墙需要放行该端口。这个地址只在局域网内有效，不要暴露到公网。

Node 中继同样先尝试直连，失败后回退到内置只读中继；因此即使本机没有 VPN 也能工作。若本机有 VPN，会优先显示 `线路 direct`。

## 四、创建静态快照

### 现成快照：内置快照

APK 已经自带 `data/live-seed.json` 的 24 件作品。在 App 内选择 **内置快照** 即可完全离线使用，不需要创建任何东西。它不会自动更新，换 APK 时才会更新。

### 方案 1：GitHub Actions（推荐，自动更新）

项目自带 `.github/workflows/sync-asmr.yml`：

1. 把整个项目上传到你的 GitHub 仓库。
2. 打开仓库 **Actions** → 启用 **Sync asmr.one snapshot**。
3. 手动点一次 **Run workflow**。工作流会抓取最新 24 件作品，提交到 `data/live-seed.json`。
4. 使用以下任一地址（把用户名/仓库替换成你的）：
   ```text
   https://raw.githubusercontent.com/<用户名>/<仓库>/main/data/live-seed.json
   https://cdn.jsdelivr.net/gh/<用户名>/<仓库>@main/data/live-seed.json
   ```
5. 先自检：
   ```powershell
   npm.cmd run relay:check -- https://cdn.jsdelivr.net/gh/<用户名>/<仓库>@main/data/live-seed.json
   ```
6. App → 头像 → 网络与数据源 → **静态快照** → 填入地址 → 测试连接 → 保存并同步。

工作流默认每 2 小时运行一次；GitHub 可能会延迟定时任务。

### 方案 2：手动生成

在能访问 asmr.one（或内置中继）的机器上：

```powershell
npm.cmd run sync
```

生成的 `server/cache/live-works.json` 就是快照内容。把它复制成 `live-seed.json`，上传到任意静态托管：

- GitHub Gist / GitHub 仓库 raw
- jsDelivr
- 自己的静态服务器 / 对象存储

然后在 App 内把 URL 填入 **静态快照**。

> URL 路径需要以 `.json` 结尾，或在地址后加 `?snapshot=1`，App 才会按快照模式解析。

快照文件格式是标准的 `LibraryData`：

```json
{
  "source": { "mode": "live", "fetchedAt": "...", "transport": "..." },
  "works": [ ... 24 件作品 ... ],
  "playlists": [ ... ],
  "moods": [ ... ],
  "tags": [ ... ],
  "hasAdult": true
}
```

App 也兼容直接包含 `works` 数组的原始 JSON；缺少 `source`/`playlists` 时会自动补全。

## 五、安全边界

- 只允许 `api.asmr-200.com`、`api.asmr.one`、`api.asmr-100.com`、`api.asmr-300.com` 的 `/api/` 路径。
- 媒体 CDN 只允许 `.vtt` / `.srt` / `.lrc` / `.txt` 字幕文本，不允许音频文件。
- 不转发 Cookie、登录态或任何写操作；只处理 GET/HEAD。
- Cloudflare Worker 边缘缓存最多 5 分钟；Node 中继内存缓存 5 分钟。
- 内置回退地址 `https://asmr.furina.in/api` 是第三方只读服务；不信任第三方时，可在自己网络可直连官方 API 的环境中运行 Node 中继，此时会显示 `线路 direct`。
