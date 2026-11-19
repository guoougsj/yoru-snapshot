# GitHub Actions 自动快照：逐步设置

这个方案让 GitHub 的海外 runner 定时抓取 asmr.one 作品，提交到仓库里的 `data/live-seed.json`。APK 再从 GitHub raw / jsDelivr 读取这个 JSON，不需要你长期开服务器。

> 推荐公开仓库：raw.githubusercontent.com 和 jsDelivr 对私有仓库支持有限。

## 1. 创建 GitHub 仓库

在 GitHub 新建一个仓库，例如 `yoru-snapshot`。不要勾选自动生成 README，保持空仓库。

## 2. 上传项目

### 方式 A：GitHub Desktop

1. 打开 GitHub Desktop → **File** → **Add local repository**
2. 选择 `E:\项目\localproject`
3. 如果提示不是 Git 仓库，点 **create a repository**
4. 提交后点 **Publish repository**
5. 取消勾选 “Keep this code private”（推荐公开）

### 方式 B：命令行

```powershell
cd "E:\项目\localproject"
git init
git add .
git commit -m "Initial YORU project"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

如果 Git 提示没有身份：

```powershell
git config user.name "你的名字"
git config user.email "你的邮箱"
```

项目 `.gitignore` 已排除 `node_modules/`、`dist/`、`release/`、Android 构建输出、`server/cache/` 和签名文件，不会把 APK 密钥传到 GitHub。

## 3. 启用 Actions 写权限

仓库 → **Settings** → **Actions** → **General**：

- 找到 **Workflow permissions**
- 选择 **Read and write permissions**
- 保存

否则工作流抓取成功，但最后 `git push` 会失败。

## 4. 手动运行一次

1. 打开仓库的 **Actions** 标签
2. 左侧选择 **Sync asmr.one snapshot**
3. 点 **Run workflow** → 选择分支（通常是 `main`）→ **Run workflow**

等待 1~3 分钟。成功后会：

- 更新并提交 `data/live-seed.json`
- 在本次运行页面的 **Summary** 里打印两个快照地址

## 5. 复制快照地址

Summary 里会显示类似：

```text
https://raw.githubusercontent.com/<用户名>/<仓库>/main/data/live-seed.json
https://cdn.jsdelivr.net/gh/<用户名>/<仓库>@main/data/live-seed.json
```

优先用 jsDelivr；如果它不可达，再换 raw.githubusercontent.com。

## 6. 自检快照

在项目目录运行：

```powershell
npm.cmd run relay:check -- https://cdn.jsdelivr.net/gh/<用户名>/<仓库>@main/data/live-seed.json
```

通过时显示：

```text
✓ 快照可用  HTTP 200  48ms
  作品 24 件，来源 live
  抓取时间 2026-...
  前三个 RJ01714306, RJ01699648, RJ01683351
```

## 7. 填进 App

```text
头像 → 网络与数据源 → 静态快照 → 粘贴地址 → 测试连接 → 保存并同步
```

成功后作品列表来自 GitHub 快照。快照模式不会冒充实时数据。

## 8. 自动更新

工作流默认每 2 小时运行一次：

```yaml
schedule:
  - cron: "17 */2 * * *"
```

GitHub 的定时任务可能延迟几分钟到几十分钟。想立即更新时，随时手动 **Run workflow**。

## 常见问题

### 工作流失败

打开失败的 run 查看日志。常见原因：

- 官方 API 与内置中继都暂时不可用：等几分钟重新运行
- GitHub Actions 被禁用：Actions 页面点启用
- 没有写权限：按第 3 步设置 Read and write permissions
- 分支保护阻止 push：临时允许 Actions 推送，或改用手动快照

工作流已经带 3 次重试。

### 快照地址 404

- 确认仓库是公开的
- 确认工作流已经成功提交过 `data/live-seed.json`
- 确认分支名是 `main`，或把 URL 里的 `main` 换成实际分支名
- raw.githubusercontent.com 有缓存，刚提交后等 1~2 分钟

### jsDelivr 不更新

jsDelivr 会缓存 GitHub 文件。可以加版本号强制刷新：

```text
https://cdn.jsdelivr.net/gh/<用户名>/<仓库>@main/data/live-seed.json?v=2
```

只要路径仍以 `.json` 结尾即可；如果地址没有 `.json` 结尾，追加 `?snapshot=1` 让 App 按快照解析。

### 私有仓库

raw.githubusercontent.com 需要 token，App 不会带 token。建议把仓库设为公开，或改用任意公开静态托管。

### 不想公开整个项目

可以只建一个专门放快照的公开仓库，把工作流和 `data/live-seed.json` 放进去。工作流只依赖：

```text
.github/workflows/sync-asmr.yml
scripts/sync-asmr.mjs
server/lib/scrape.mjs
data/live-seed.json
```

其余源码不必上传。
