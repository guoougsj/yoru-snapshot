# GitHub Actions 自动快照

快照工作流位于公开仓库：

```text
https://github.com/guoougsj/yoru-snapshot
```

## 快照地址

App 的“静态快照”默认使用固定 Release 地址：

```text
https://github.com/guoougsj/yoru-snapshot/releases/download/snapshot-latest/live-seed.json
```

工作流每 2 小时抓取成功后，都会用 `gh release upload --clobber` 更新 `snapshot-latest` Release 中的 `live-seed.json`，不创建新的 tag。首次成功运行后该地址即可下载。

Git 中的 `data/live-seed.json` 是 Android 内置种子和匿名下载备用源，只在快照的 UTC 日期变化时提交，避免每 2 小时把约 544 KB 的数据写入 Git 历史：

```text
https://raw.githubusercontent.com/guoougsj/yoru-snapshot/main/data/live-seed.json
```

可选的 jsDelivr 备用地址（`@main` 可能有缓存）：

```text
https://cdn.jsdelivr.net/gh/guoougsj/yoru-snapshot@main/data/live-seed.json
```

已经手动保存旧 raw 地址的用户，可在 App 的静态快照输入框中替换为上面的 Release 地址。

## 自检

```powershell
npm.cmd run relay:check -- https://github.com/guoougsj/yoru-snapshot/releases/download/snapshot-latest/live-seed.json
```

Release 尚未创建或返回 404 时，App 会自动尝试 Git 内置种子；也可手动检查：

```powershell
npm.cmd run relay:check -- https://raw.githubusercontent.com/guoougsj/yoru-snapshot/main/data/live-seed.json
```

也可以在本地检查 Git 种子的年龄：

```bash
node scripts/snapshot-status.mjs data/live-seed.json
```

脚本输出 JSON：退出码 `0` 表示不超过 48 小时，`1` 表示超过 48 小时，`2` 表示文件或 `source.fetchedAt` 无效。年龄计算是纯函数，回归测试位于 `scripts/snapshot-status.test.mjs`。

## 自动更新

工作流触发条件：

- 每 2 小时定时运行（`17 */2 * * *`）
- 修改快照工作流、同步/年龄检查脚本，或 `server/lib/asmr/` 下的抓取模块与测试时运行
- 手动 **Run workflow**

成功路径：

1. 运行 `node --test server/lib/asmr/*.test.mjs`
2. 抓取最新 asmr.one 作品，并从 `./server/lib/asmr/snapshot.mjs` 导入 `validateSnapshot` 校验
3. 把有效快照上传到固定 `snapshot-latest` Release 的 `live-seed.json` asset
4. 比较新旧快照的 UTC 日期；只有日期变化时才提交 `data/live-seed.json`
5. 在运行摘要中打印 Release 地址和 raw / jsDelivr 备用地址

失败路径：

- 抓取或校验失败时保留上一份已提交的 `data/live-seed.json`，不清空现有数据
- 通过 `scripts/snapshot-status.mjs` 检查旧快照的 `source.fetchedAt`
- 超过 48 小时时，创建或复用标题固定为 `Snapshot alert: live-seed.json is older than 48 hours` 的 open issue，不重复刷屏；快照恢复且 Release 发布成功后自动关闭该 issue
- 工作流需要 `contents: write`（提交种子、更新 Release）和 `issues: write`（告警）；发布使用 Ubuntu runner 自带的 `gh` CLI

## CI 与依赖更新

`.github/workflows/ci.yml` 在每次 push 和 PR 上运行：

- `npm ci`、`npm test`、`npm run build`
- `actionlint` 检查 GitHub Actions YAML
- 使用 Ubuntu runner 自带 Android SDK、JDK 21 和 Gradle Wrapper 执行 `testDebugUnitTest` 与 `assembleDebug`

CI 权限最小为 `contents: read`，同一 ref 的重复运行会取消旧任务。所有使用的第三方 Action 都固定到完整 commit SHA，并在注释中保留版本。

`.github/dependabot.yml` 每周检查 npm、GitHub Actions 和 Android Gradle 依赖更新。

## 手动触发

仓库 → **Actions** → **Sync asmr.one snapshot** → **Run workflow** → 选择 `main` → 运行。

## 修改后如何推送

```powershell
cd "E:\项目\localproject"
git add .github/workflows/sync-asmr.yml scripts/sync-asmr.mjs scripts/snapshot-status.mjs scripts/snapshot-status.test.mjs server/lib/asmr/snapshot.mjs server/lib/asmr/snapshot.test.mjs
git commit -m "你的修改说明"
git push origin main
```

如果以后 GitHub 的固定 IP 失效，可重新设置本地连接参数：

```powershell
git config http.curloptResolve github.com:443:<可用IP>
```

## 常见问题

### 快照 URL 404

- 确认工作流至少成功运行一次并已创建 `snapshot-latest` Release
- 确认仓库公开
- 确认 Release 中存在名为 `live-seed.json` 的 asset
- raw 备用地址要求 `data/live-seed.json` 已提交到 `main`

### 抓取失败但任务仍显示成功

这是有意的回退：旧快照仍可用时不会让上游故障中断任务。查看运行摘要；若旧快照超过 48 小时，会创建或复用固定标题的告警 issue。

### Actions 运行失败

回归测试失败、旧快照无效、Release 上传权限不足、Git 推送权限不足或 rebase 冲突都会明确失败，需要修复对应问题后再运行。

### 仓库私有

Release 匿名下载、raw 和 jsDelivr 都会受限。保持公开，或改用其他公开静态托管。

## 安全

`.gitignore` 已排除 `node_modules/`、`dist/`、`release/`、Android 构建输出、`server/cache/`、`keystore` 和 `local.properties`。受版本控制的文件中不应包含签名密钥或 APK。
