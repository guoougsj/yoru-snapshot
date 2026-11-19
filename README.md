# YORU / 夜音

一个为深夜聆听设计的 ASMR 播放器。作品数据来自 [asmr.one/works](https://asmr.one/works)，按原站标签分类；Web 与 Android 共用 React 界面，Android 版本额外支持完整音轨播放和按需离线缓存。

## 当前状态

- 抓取改为 `order=release&sort=desc` 的最新作品流，**不再做全年龄过滤**；R15 / 成人向作品会一并进入列表。
- 标签直接使用作品 JSON 里的原站 `tags` 聚合，前端展示出现频率最高的 14 个标签，侧栏/详情显示完整标签。
- 完整音轨按需请求 `GET /api/tracks/{id}?v=2`，播放官方返回的 `mediaStreamUrl`；YORU 不代理、不转存音轨到自己的服务器。
- 同一作品通常同时提供 mp3 / wav / flac 多种格式。音轨列表会按“去掉扩展名的文件名”分组，**只保留体积最小的版本（通常是 mp3）**，避免误缓存 1 GB 的 wav。
- Android 端使用内置 Java `AudioCachePlugin`（避免 Kotlin 构建依赖）把用户选择的音轨下载到应用私有 `files/yoru-audio` 目录，`localStorage` 记录缓存索引；离线播放通过 `Capacitor.convertFileSrc` 读取本地文件。
- 缓存是用户主动触发的单曲或单作品操作，不提供服务器端批量下载，也不提供缓存文件导出/分发。
- 第一次遇到成人向作品时会显示 18+ 内容确认；确认后展示全部内容，不做额外过滤。
- 内置种子为最近一次成功同步的 **500 件作品**快照（含成人内容）。同步成功后会替换为更新后的 500 件作品；如果中继不可用，界面会明确显示 `SNAPSHOT`，不会把旧数据标成实时。

## 数据与版权说明

- **作品元数据**：来自 asmr.one 的公开 API。`server/cache/live-works.json` 是 Web 实时缓存，`data/live-seed.json` 是 Android 内置快照。
- **完整音轨**：只使用官方 API 返回的 `mediaStreamUrl` / `mediaDownloadUrl`；YORU 不搭建音轨代理、不绕过登录或付费流程、不把音轨写入项目服务器。
- **离线缓存**：仅限用户在 Android 客户端主动缓存的音轨，保存在应用私有目录，卸载应用即删除；请只用于个人收听，不要传播缓存文件。
- **封面**：全部由 `CoverArt` 组件在本地程序化绘制，不加载 asmr.one 的图片资源。
- **本地试听**：`public/audio/ambient-*.wav` 是本地合成环境音，只在官方音轨尚未取到或播放失败时作为 fallback，**不是**作品原音轨。
- **中继**：asmr.one 官方 API 在部分地区（包括中国大陆）不可达。客户端会对冲 `furina-relay`、官方直连、`allorigins-raw`、AllOrigins `/get`、`cors.lol`，首个有效响应获胜；也可在 App 内换成自己的 Cloudflare Worker / Node 中继或静态快照。中继只转发元数据和小字幕文本，不代理音频。
- `furina-relay` 是第三方只读反代，不是 asmr.one 官方服务；请求会经过该服务。如果不希望依赖第三方，请按 `relay/README.md` 部署自己的中继，或在 App 内改用静态快照。
- 作品版权归原作者与社团所有；本项目不声明对作品音频的任何权利。

## 运行

需要 Node.js 18+（开发环境使用 Node 22 验证）。

```bash
npm install
npm run dev        # API :8787 + Vite :5173
```

生产预览与实时同步：

```bash
npm run build
npm start          # Express 同时托管 dist 与 API，http://localhost:8787
npm run sync       # 抓取最新作品与原站标签，写入实时缓存
```

> Windows PowerShell 如果拦截 `npm.ps1`，请改用 `npm.cmd run dev` / `npm.cmd run build` / `npm.cmd run sync`。

## Android APK

安装包：`release/YORU-夜音-1.3.0.apk`（Android 7.0+，minSdk 24 / targetSdk 36，包名 `com.yoru.asmr`）。

```bash
npm.cmd run android:build     # 构建 dist、同步到 android/、产出 debug APK
npm.cmd run android:release   # 同上，产出已签名的 release APK
```

需要 JDK 21 与 Android SDK 36（platform-tools、platforms;android-36、build-tools;36.0.0）。
`android/local.properties` 中的 `sdk.dir` 指向本机 SDK，可由 Android Studio 自动生成。

> 当前工程位于含中文的路径 `E:\项目\localproject`。AGP 会因此给出路径警告，项目已在
> `android/gradle.properties` 中设置 `android.overridePathCheck=true`；Gradle Wrapper 使用
> `gradle-8.14.3-bin.zip` 以减少下载体积。

APK 的播放与缓存策略：

- 打开作品详情时按需拉取官方音轨树；拿到后播放器自动从本地试听切换到完整音轨，并支持逐段播放、上一段/下一段、进度拖动。
- 详情页列出每段音轨的格式、时长、大小和缓存状态；单段缓存按钮、整部作品缓存按钮均可用。整部作品超过 200 MB 时会先弹出确认。
- 缓存文件位于应用私有 `files/yoru-audio/<作品>/<音轨>`，应用卸载即清除；`localStorage` 只保存索引和文件 URI。下载进度通过原生 `progress` 事件回传，详情页会显示百分比。
- 音轨元数据会在服务端磁盘缓存 24 小时、客户端本地缓存 24 小时，减少中继请求；媒体 URL 仍直接指向官方 CDN。
- 官方音轨加载失败时自动回退到本地 `ambient-*.wav`，并在详情页提示“完整音轨加载失败，已切换本地试听”。
- 首次出现成人作品时显示 18+ 确认；不提供“仅全年龄”过滤模式，符合“不需要过滤”的要求。

### 网络、数据源与分页（1.2.3 → 1.2.9）

2026 年 8 月起，asmr.one 的官方 API 域名在部分地区被阻断；公共 CORS 中继又经常返回 429/500。1.2.3 把同步改成三层，1.2.4 把线路做成**一键预设**，1.2.5 补上完全离线的**内置快照**，1.2.6 把静态快照默认指向本项目的 GitHub Actions 快照，1.2.8 扩到 **500 件作品，每页 20 条分页**：

- **自动选择**：内置中继 + 直连 + 公共中继（默认）
- **内置中继**：固定使用 `asmr.furina.in`
- **仅直连**：只走官方 API，适合开启 VPN/海外网络时
- **公共中继**：AllOrigins + cors.lol
- **自建中继**：Cloudflare Worker / Node；点击时会预填可用的内置地址，可直接保存或替换
- **静态快照**：默认 `https://raw.githubusercontent.com/guoougsj/yoru-snapshot/main/data/live-seed.json`（可替换）
- **内置快照**：APK 自带 500 件作品，完全离线，不发起网络请求
- **作品分页**：500 件作品按每页 20 条展示，支持页码、上一页/下一页

点击预设即保存并触发同步，无需再点“保存”；静态快照已预置本项目地址，点击即用。具体三层能力：

1. **内置只读中继**：`https://asmr.furina.in/api`（Cloudflare Pages 上的透明 API 反代）作为首选线路，同时并行对冲官方直连、AllOrigins `/raw` `/get`、`cors.lol`。首个有效响应获胜，失败两次的线路进入 10 分钟冷却，成功的线路下次优先。
2. **自己的中继**：`relay/cloudflare-worker.js` 可部署到 Cloudflare Workers；`relay/node-relay.mjs` 可跑在 VPS 或局域网电脑。把地址填进 App → 头像 → **网络与数据源** → 测试连接 → 保存并同步。详见 `relay/README.md`。
3. **静态快照**：`.github/workflows/sync-asmr.yml` 定时在 GitHub 海外 runner 抓取并提交 `data/live-seed.json`；App 可填 `raw.githubusercontent.com` 或 `jsDelivr` 的快照地址。快照模式会明确标注为快照，不冒充实时。

其他行为：

- 快照状态下每 30 秒 ~ 5 分钟自动重试，成功后停止；切回前台、恢复联网或修改数据源也会重试。
- 手动“同步”按钮仍会立即尝试。
- 中继只转发作品/音轨元数据和小字幕文本；音频仍直连官方媒体 CDN。
- 所有线路都失败时保留上次成功数据并显示 `SNAPSHOT`，不会清空内容。
- 自定义数据源保存在本机 `localStorage`，不会上传。
- 自建中继与静态快照的制作、自检步骤见 `relay/README.md`；也可以直接运行：
  ```powershell
  npm.cmd run relay:check -- http://127.0.0.1:8788
  npm.cmd run relay:check -- https://raw.githubusercontent.com/<用户名>/<仓库>/main/data/live-seed.json
  ```
- 内置快照完全离线；静态快照需要你自己的 JSON 地址；自建中继可以先点预设自动填入可用地址，再替换成自己的 Worker/Node 地址。
- GitHub Actions 自动快照的完整步骤（建仓库、权限、运行、自检、填地址、常见问题）见 [`GITHUB_SNAPSHOT.md`](./GITHUB_SNAPSHOT.md)。

### 外部资源站（1.3.0）

新增 [ASMR Daily](https://asmrdaily.drive2dav.top) 资源站入口：

- 侧栏新增 `RESOURCES` 区块，显示 **ASMR Daily · Neokikoeru 资源库**
- 顶栏个人资料面板新增“ASMR Daily 资源站”快捷入口
- 作品详情抽屉新增“在 ASMR Daily 查看作品”，按当前 RJ 号直达对应页面
- 站点需要登录；这些入口会在浏览器中打开，不会把该站账号、Token 或作品数据写入 APK
- 该站的 `/api/works` 在未登录时返回 `401 Unauthorized`，因此目前只做外部资源入口，不作为第二个自动抓取数据源。若要做成应用内作品源，需要你提供该站账号/Token 后再接入登录流程。

### 顶栏个人资料与通知（1.2.2）

- 右上角头像和通知按钮不再是无响应的装饰，均可点开：
  - **个人资料**：显示收藏数、队列数、缓存段数、缓存总大小；可直接进入“我的收藏”“播放队列”“播放详情与字幕”，或同步 asmr.one；支持一键清除全部离线缓存（有确认）。
  - **数据通知**：显示当前是实时数据还是本地快照、同步时间与传输通道、离线缓存状态，并提供“立即同步 asmr.one”。
- 两个面板互斥显示；点击面板外部或按 Esc 关闭；移动端自动收窄到屏幕宽度。
- 小屏（≤560px）下隐藏通知面板，保留个人资料面板，避免顶栏过挤。

### 播放详情页与滚动字幕（1.2.1 / 1.2.9）

- 播放器右侧新增展开按钮，打开全屏播放详情页：大封面、当前音轨、播放进度、上一段/下一段、循环、收藏和音量。
- **原站封面（1.2.9）**：页内方形封面和全屏背景都优先加载 asmr.one 原站封面，通过内置只读中继访问；加载失败时自动回退到 YORU 程序化封面。
- **字幕不再被演示内容干扰（1.2.9）**：
  - 默认不显示演示字幕；没有官方字幕或导入字幕时，显示“暂无可用字幕”的空状态。
  - 空状态提供“导入字幕”和“查看演示字幕”两个按钮；演示字幕只在主动点击后出现，并可随时“关闭演示”。
  - 切换作品时自动关闭演示字幕；导入字幕后也会自动关闭演示模式。
- 页内字幕按当前播放时间自动高亮，并平滑滚动到当前行；过去/当前/未到的行有明显层级。
- **官方字幕**：如果 tracks 里同一音轨有 `.vtt` / `.srt` / `.lrc` 文本资源（`has_subtitle: true` 的作品），App 会自动拉取并显示“官方字幕 · VTT”；用户导入的字幕优先。
- 支持导入用户自己的 `.srt` / `.lrc` / `.txt` 字幕：
  - SRT/VTT 解析标准时间轴；LRC 解析 `[mm:ss.xx]` 标签；TXT 按行均匀分配到当前音轨时长。
  - 导入文件按“作品 + 音轨”保存在 `localStorage`，下次播放同一段仍可用；可一键清除导入内容。
  - 文件上限 512 KB，导入失败会明确提示。
- 播放详情页打开时，Android 返回键优先收起该页面，再处理详情抽屉/队列/首页。

### 字幕数据实测（纠正之前的说法）

之前“asmr.one 的作品元数据里没有可直接使用的官方字幕轨”是**笼统且不准确的**。实测：

- `/api/works` 的作品对象包含 `has_subtitle` 字段。
- 抽查 `RJ01683351`（数值 id `1683351`，`has_subtitle: true`）：
  - `/api/tracks/1683351?v=2` 返回 5 个唯一音轨、15 个 `text` 资源：5 个 `.txt` 台本 + 10 个 `.vtt`。
  - 每个音轨都有同名的 `.wav.vtt`；其中一个 VTT 以 `WEBVTT` 开头，包含 62 条带时间戳的 cue。
  - 服务端 `/api/subtitles` 拉取该 VTT 返回 `200`、3,113 字节，验证通过。
- 抽查 `RJ01712782`（`1712782`）：只有 1 个 `text`，内容是“购买感谢”说明 `.txt`，没有 VTT。
- 抽查 `RJ01699055`（`1699055`）：1 个 `.txt` 台本（53,552 B）+ 1 个 PDF 特典，没有 VTT。

结论：**有字幕的作品确实提供官方 WebVTT 字幕，但不是所有作品都有**；之前直接否定官方字幕轨是错的。现在已经把官方 `.vtt/.srt/.lrc` 自动配对并接入播放详情页。

### 后台播放（1.2.0）

- Android 端新增原生 `PlaybackService` 前台服务，类型为 `mediaPlayback`；完整音轨不再依赖 WebView 的 `<audio>`，锁屏或切到后台后由原生 `MediaPlayer` 继续播放。
- 通知栏与锁屏提供上一段/播放暂停/下一段/停止控制，基于 `MediaSession`；支持耳机按键。
- 服务自带播放队列：一首播完自动切换到当前作品的下一段，直到整部作品结束；`repeat` 会循环当前音轨。
- 处理音频焦点（来电/其他应用抢占时暂停，恢复后继续）、耳机拔出自动暂停、Wi-Fi/CPU WakeLock（后台流式播放）。
- Android 13+ 首次播放会请求通知权限；如果没有通知权限，播放仍可继续，但通知栏控制可能不可见。
- 返回应用时通过 `getState` 同步原生服务的播放位置、音轨和状态。
- 从应用内开始播放后，按 Home 或锁屏仍会继续；如果系统强行停止应用，后台服务也会停止。

### 网络与使用体验优化（1.1.1 起）

- **对冲式请求（hedged requests）**：直连立即开始，AllOrigins `/raw`、`cors.lol`、AllOrigins `/get` 在 0.5–1.7 秒内错峰启动；第一个有效响应获胜，其余请求立即中止。之前串行等待 45 秒的情况，现在通常是 1–10 秒。
- 启动同步最多 25 秒，手动同步最多 45 秒；单个音轨请求最多 25 秒，并带内存/本地元数据缓存。
- 同一作品/同一次同步的并发请求会去重，避免重复打中继。
- 断网时跳过请求并显示“当前处于离线状态，正在使用本地缓存”；恢复联网后自动重试一次同步。
- 播放状态持久化：上次作品、队列、音量、单曲循环、音轨序号会在下次启动时恢复。
- Android 返回键：先关闭作品详情，再关闭播放队列，再回到首页，最后才退出应用。
- 播放时保持屏幕常亮（`FLAG_KEEP_SCREEN_ON`），暂停/退出时清除。
- 下载进度实时回传（每 ~400ms），缓存按钮显示百分比；整部作品缓存仍会先确认大小。

签名说明：`android/keystore.properties` 指向本机自签名密钥 `android/keystore/yoru-release.jks`，
两者均已被 `.gitignore` 排除。若要上架应用商店，请替换为自己的密钥并妥善保管。

APK 图标与启动图由 `assets/logo.svg` 生成，可重新执行：

```bash
npx capacitor-assets generate --android --iconBackgroundColor '#0c0d0f' --iconBackgroundColorDark '#0c0d0f' --splashBackgroundColor '#0c0d0f' --splashBackgroundColorDark '#0c0d0f' --logoSplashScale 0.22
```

## 可用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 同时启动 API 与 Vite 开发服务器 |
| `npm run dev:web` | 仅启动 Vite（需要单独启动 API） |
| `npm run dev:api` | 仅启动 Express API |
| `npm run build` | TypeScript 检查并构建 `dist/` |
| `npm start` | 启动 Express 生产服务（端口 8787） |
| `npm run sync` | 抓取最新作品与原站标签并更新缓存 |
| `npm run relay` | 启动只读 Node 中继（端口 8788，供 App 自定义数据源使用） |
| `npm run relay:check -- <地址>` | 自检中继或静态快照，检查作品/音轨是否可用 |
| `npm run android:build` | 构建并同步 Web 资源，生成 debug APK |
| `npm run android:release` | 构建并同步 Web 资源，生成已签名的 release APK |
| `npm run generate:audio` | 重新生成 12 段本地环境音 fallback |

## API

- `GET /api/health` — 服务健康检查。
- `GET /api/works` — 返回作品、歌单、原站标签与数据源状态（优先实时缓存，否则快照）。
- `GET /api/tracks/:id` — 按需获取官方音轨树，归一化为可直接播放的 mp3 列表；服务端会做 5 分钟内存缓存和 24 小时磁盘缓存。
- `GET /api/subtitles?url=...` — 代理官方 CDN 上的 `.vtt/.srt/.lrc/.txt` 字幕文本（仅白名单域名，1 MB 上限）。
- `POST /api/sync` — 触发一次实时抓取（20 秒限流）。失败时返回 502，保留现有缓存/快照。

## 安装 APK

```bash
adb install -r release/YORU-夜音-1.3.0.apk
```

也可以把 APK 复制到手机后手动安装（需允许“安装未知来源应用”）。

## 目录

```
.github/         GitHub Actions 定时快照工作流
android/         Capacitor Android 原生工程
assets/          APK 图标/启动图源文件
data/            策展快照、Android 内置作品种子
public/audio/    本地环境音 fallback
relay/           Cloudflare Worker / Node 只读中继
release/         最终签名的 APK（本地生成，不纳入版本控制）
scripts/         同步与音频生成脚本
server/          Express API、asmr.one 抓取、音轨缓存
src/             React 界面、组件与样式
```

## 已验证

- `npm run build` 通过（TypeScript + Vite，v1.3.0）。
- **新中继链路实测**：`furina-relay` 分 25 页抓取 500 件作品耗时 14.9 秒，每页 20 件；`RJ01683351` 的 5 段音轨在约 1 秒内返回，5/5 带官方 VTT 字幕。`/api/works` 返回 500 件作品、18 个原站标签、含成人内容。
- **服务端快路径实测**：重启服务后 `POST /api/sync` 21.18 秒返回 500 件；`GET /api/works` 返回 500 件、18 个标签；`GET /api/tracks/1683351` 命中缓存 11ms 返回 5 段音轨、5 个字幕 URL，传输标记为 `furina-relay`。
- **一键预设实测**：面板列出 7 个预设；点击“内置中继 / 仅直连 / 公共中继 / 自动选择 / 内置快照 / 静态快照”会立即写入 `yoru.data-source-v2` 并标记当前项；点击“自建中继”会预填内置地址。重新打开面板后选择保持，控制台无错误。
- **GitHub Actions 已跑通**：`guoougsj/yoru-snapshot` 的 `Sync asmr.one snapshot` 运行 `44508706141` 成功，并提交 `8d1a5e7`；raw 快照返回 `200`、500 件作品、抓取时间 `2026-11-19T10:46:22Z`。jsDelivr 分支地址有缓存，commit 固定地址 `@8d1a5e7` 已验证为 500 件。
- **静态快照已预置**：点击“静态快照”会自动填入并保存 `https://raw.githubusercontent.com/guoougsj/yoru-snapshot/main/data/live-seed.json`，无需手动粘贴；Node 模拟中 341ms 返回 500 件作品，状态为 `curated-snapshot` / `snapshot`。
- **500 件作品实测**：`furina-relay` 分 25 页抓取 500 件作品耗时 14.9 秒，18 个原站标签；音轨接口约 1 秒返回 5 段、5 个字幕。Web 每页 20 张卡片，共 25 页；第 1 页显示 20 张，第 25 页显示 20 张且“下一页”禁用。
- **内置种子已升级**：`data/live-seed.json` 500 件作品、500 个唯一 ID、18 个标签，文件 535,354 bytes；APK 也内置了构建时抓取的 500 件快照。
- **预设路由实测**：Node 模拟中 `auto` 走 `furina-relay` 返回 500 件（14.9 秒）；`furina` 固定走 `furina-relay`；`bundled` 在 0ms 内返回 500 件内置快照，状态为 `curated-snapshot` / `bundled`；`custom` 走本地模拟 Worker 返回 24 件；`direct` 在无 VPN 网络下 6 秒内明确失败，不会偷偷回退到内置中继。
- **自定义数据源实测**：App 内“测试连接”对 `https://asmr.furina.in/api` 返回「中继可用 · 本页 20 个作品」；本地快照 URL 返回「快照可用 · 500 个作品」；保存/清除地址后面板状态正确切换，控制台无错误。
- **静态快照链路实测**：用本地 HTTP 服务托管 `data/live-seed.json`，`fetchNativeLibrary` 毫秒级返回 500 件作品，状态为 `curated-snapshot` / `snapshot`，提示“这是快照，不是实时抓取”。
- 原站标签聚合已在 Web 界面实际显示（双声道立体声/人头麦、掏耳、治愈、ASMR、萌、低语、系列作品等）。
- **真实完整音轨播放已验证**：`/api/tracks/RJ01712782` 通过 `allorigins-raw` 返回 16 段 mp3；播放器成功加载官方 `raw.kiko-play-niptan.one` 音频（第一段 56:21，51.6 MB），时间轴从 `0:00/56:21` 推进到 `0:01/56:21`，无媒体错误。
- **真实音轨切换已验证**：点击第 2 段后播放器显示 `第 2/16 段`，音频源切换到第二段官方 CDN URL，`FULL TRACK` 状态正确。
- 音轨去重逻辑通过真实数据与合成数据测试：原始 32 个格式条目归并为 16 个 mp3（约 850 MB），避免缓存 1 GB 的 wav；同名 mp3/wav 只保留 mp3。
- **对冲网络测试**：模拟直连阻断、AllOrigins `/raw` 延迟 60ms、`cors.lol` 429、`allorigins-get` 429；音轨请求在 602ms 内完成，作品列表 24 件在 1169ms 内完成，标签与成人标记正确。
- **播放详情页/滚动字幕已验证**：展开后显示大封面、当前音轨、80 行演示字幕和“演示字幕 · 非原作品台本”；切换到 0:06 时高亮第二行；导入 2 行测试 SRT 后显示“已导入 · test.srt”，清除后恢复演示字幕；全过程无控制台错误。
- Web 端已验证离线横幅、恢复联网、Android 返回事件（关闭详情）、播放状态持久化；浏览器控制台无错误。
- Web 端点击缓存会明确提示“离线缓存目前仅在 Android 客户端可用”，不会静默失败；整部作品缓存超过 200 MB 时会先确认。
- **官方字幕链路已验证**：`RJ01683351` 的音轨树有 5 个唯一音轨、10 个 VTT；归一化后 5/5 个音轨都带上 `subtitleUrl`；真实 VTT 以 `WEBVTT` 开头、含 62 条 cue；`/api/subtitles` 返回 `200`、3,113 字节。
- **顶栏面板已验证**：浏览器内点击头像可打开个人资料，点击铃铛可打开数据通知；两面板互斥、点击外部关闭、快捷入口可跳转，控制台无错误。
- **原站封面背景已验证（1.2.9）**：播放详情页的方形封面和全屏背景都使用原站封面 `https://asmr.furina.in/api/cover/1714306.jpg?type=main`，图片实际加载为 560×420；背景应用 `blur(30px) saturate(1.15) brightness(0.52)`，控制台无图片错误。
- **字幕空状态已验证（1.2.9）**：打开播放详情页默认 0 行演示字幕，显示“暂无可用字幕”与“导入字幕 / 查看演示字幕”；点击“查看演示字幕”出现 8 行并显示“关闭演示”，关闭后恢复空状态且隐藏字幕元信息；控制台无错误。
- **ASMR Daily 入口已验证（1.3.0）**：侧栏 RESOURCES 链接为 `https://asmrdaily.drive2dav.top/`；作品详情新增 `https://asmrdaily.drive2dav.top/works/<RJ号>`；顶栏个人资料面板显示“ASMR Daily 资源站 · 外部”。浏览器控制台无错误。
- ASMR Daily 的 `/api/works` 在未登录时返回 `401 Unauthorized`，因此未把该站作品抓取混入 asmr.one 库；入口按外部站点处理。
- APK：`release/YORU-夜音-1.3.0.apk`，21,697,735 bytes，SHA-256 `07AD40860047F29290CF1C1107156CCAA4A33A6B3D53446B09505746E3EAF158`；versionCode 14 / versionName 1.3.0；APK Signature Scheme v2 校验通过，zipalign 通过；包含 500 件作品种子、12 段本地 fallback 音频、`AudioCachePlugin`、`PlaybackService`、`BackgroundAudioPlugin`、官方字幕解析、原站封面背景、播放详情/字幕页面、顶栏个人资料/通知面板、7 个一键数据源预设与 ASMR Daily 外部资源入口。
- APK 静态校验：Manifest 中 `PlaybackService` 的 `foregroundServiceType=mediaPlayback`，已声明 `WAKE_LOCK`、`FOREGROUND_SERVICE`、`FOREGROUND_SERVICE_MEDIA_PLAYBACK`、`POST_NOTIFICATIONS`；`classes.dex` 含 `PlaybackService`、`BackgroundAudioPlugin`、`MediaSession`；打包 JS 含 `BackgroundAudio`、`AudioCache`、播放详情页/字幕解析、网络对冲和离线状态逻辑。
- **本次已通过 `furina-relay` 成功同步 500 件真实作品**，并写入 `server/cache/live-works.json` 与 `data/live-seed.json`；不再使用旧的 12/24/200 件种子。

## 最终验证的边界

- 最终打包前已通过 `furina-relay` 完成一次真实作品列表同步：500 件作品、18 个标签、含成人内容。APK 首屏直接使用这份 500 件快照；联网且中继可用时会自动刷新。`allorigins` / `cors.lol` 仍可能限流，但不再是唯一线路。
- 音轨接口后来通过 `allorigins-raw` 成功，`server/cache/tracks/` 已缓存 3 个作品的真实音轨；该目录不纳入版本控制。
- 本环境没有 Android 真机或模拟器，APK 未做设备启动测试；已完成构建、签名、对齐与静态内容/自定义插件校验。离线缓存的 `AudioCachePlugin` 下载链路、后台播放的 `PlaybackService`（通知栏/锁屏控制、音频焦点、锁屏续播）都需要在真机上确认。
- 首次播放某个作品时，对冲请求通常几秒内完成，最坏 25 秒；之后会使用服务端 5 分钟内存缓存、24 小时磁盘缓存和客户端 24 小时音轨元数据缓存。
