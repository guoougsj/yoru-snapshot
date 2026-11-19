# GitHub Actions 自动快照：当前配置

仓库已经发布并成功运行过：

```text
https://github.com/guoougsj/yoru-snapshot
```

- 仓库：公开
- 默认分支：`main`
- 工作流：`Sync asmr.one snapshot`
- 最近成功运行：`44508706141`（2026-11-19）
- 快照提交：`8d1a5e7 chore: sync asmr.one snapshot`
- 当前快照：500 件作品

## 现成快照地址

优先使用 raw（更新最快）：

```text
https://raw.githubusercontent.com/guoougsj/yoru-snapshot/main/data/live-seed.json
```

备用 jsDelivr：

```text
https://cdn.jsdelivr.net/gh/guoougsj/yoru-snapshot@main/data/live-seed.json
```

jsDelivr 的 `@main` 地址有缓存，刚更新后可能仍返回上一版。需要立即拿到最新版时，用 commit 固定地址：

```text
https://cdn.jsdelivr.net/gh/guoougsj/yoru-snapshot@8d1a5e7/data/live-seed.json
```

App 的 **静态快照** 预设已经默认填入 raw 地址，直接点击即可，不需要手动粘贴。想换成 jsDelivr 时，在静态快照输入框替换后保存。

## 自检

```powershell
npm.cmd run relay:check -- https://raw.githubusercontent.com/guoougsj/yoru-snapshot/main/data/live-seed.json
```

通过时：

```text
✓ 快照可用  HTTP 200  645ms
  作品 500 件，来源 live
  抓取时间 2026-11-19T10:46:22.529Z
```

## 自动更新

工作流触发条件：

- 每 2 小时定时运行
- 修改 `.github/workflows/sync-asmr.yml`、`scripts/sync-asmr.mjs`、`server/lib/scrape.mjs` 时运行
- 手动 **Run workflow**

工作流会：

1. 抓取最新 asmr.one 作品（失败自动重试 3 次）
2. 校验至少 12 件作品
3. 写入并提交 `data/live-seed.json`
4. 在运行摘要中打印 raw / jsDelivr 地址

## 手动触发

仓库 → **Actions** → **Sync asmr.one snapshot** → **Run workflow** → 选择 `main` → 运行。

## 修改后如何推送

本地仓库已经配置好 GitHub 连接，并且针对当前网络把 `github.com` 固定到可用 IP：

```powershell
cd "E:\项目\localproject"
git add .
git commit -m "你的修改说明"
git push origin main
```

如果以后 GitHub 的 IP 失效，重新设置：

```powershell
git config http.curloptResolve github.com:443:<可用IP>
```

## 常见问题

### Actions 运行失败

查看失败步骤日志。工作流已带 3 次重试。常见原因是官方 API 与内置中继同时不可用，等几分钟重新运行即可。

### 快照 URL 404

- 确认仓库公开
- 确认 `data/live-seed.json` 已提交
- 确认分支是 `main`
- raw.githubusercontent.com 有缓存，刚提交后等 1~2 分钟

### jsDelivr 不更新

加版本参数强制刷新：

```text
https://cdn.jsdelivr.net/gh/guoougsj/yoru-snapshot@main/data/live-seed.json?v=2
```

路径仍以 `.json` 结尾，App 会按快照解析。

### 仓库私有

raw 和 jsDelivr 无法匿名读取。保持公开，或改用其他公开静态托管。

## 安全

`.gitignore` 已排除 `node_modules/`、`dist/`、`release/`、Android 构建输出、`server/cache/`、`keystore` 和 `local.properties`。当前 150 个受版本控制的文件里没有签名密钥或 APK。
