# Visual Guard 独立工程示例

模拟真实用户从安装到运行的完整流程。

## 快速开始

```bash
# 安装依赖
pnpm install

# 首次运行 — 建立基线（主线：Playwright）
pnpm guard:run

# 修改页面后再次运行 — 检测视觉变化
pnpm guard:run

# 更新基线
pnpm guard:run --write-baseline

# 查看基线列表
pnpm guard:baseline

# 查看基线截图
open .visual-guard/baselines/my-web-app/development/main/home@desktop/desktop/screenshots/full.png

# 清理旧基线（预览模式）
pnpm guard:clean
```

## 引擎说明

| 引擎 | 状态 | 说明 |
|------|------|------|
| Playwright | ✅ 推荐 | 当前主线，稳定跑通 |
| Cypress | 🟡 桥接规划中 | 后续通过 Cypress spec + task 输出采集产物 |
| Puppeteer | ⚠️ 实验/再评估 | 示例默认使用 `puppeteer-core@^24.31.0`，避免安装阶段下载 Chrome；`puppeteer@25` 需要 Node >= 22.12，暂不作为默认 |

本示例会声明主线和实验引擎依赖，方便验证安装关系；但实际执行建议使用 Playwright：

```bash
pnpm guard:run
```

Cypress 当前走桥接模式，会先生成 Cypress spec/config，再执行 Cypress：

```bash
pnpm guard:run:cypress
```

Puppeteer 保留脚本但不作为主线验证。示例默认使用 `puppeteer-core`，适配器会自动查找本机常见 Chrome / Chromium 路径：

```bash
pnpm guard:run:puppeteer
```

如果自动查找失败，可手动指定路径：

```bash
PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  pnpm guard:run:puppeteer
```

如果希望安装阶段自动下载兼容 Chrome，可把示例依赖从 `puppeteer-core` 改为 `puppeteer`，并移除 `.npmrc` 里的 `PUPPETEER_SKIP_DOWNLOAD=true`。

## 配置要点

| 字段 | 说明 | 示例 |
|------|------|------|
| `project` | 项目名称 | `"my-web-app"` |
| `baseUrl` | 被测页面根地址 | `"http://localhost:3000"` |
| `browser.engine` | 浏览器引擎 | `"playwright"` |
| `scenarios[].path` | 页面相对路径 | `"/"` / `"/about"` |
| `viewport` | 视口列表 | `[{width: 1280, height: 800}]` |

## 发布后安装方式

```bash
# 推荐安装方式
npm install -D @visual-guard/cli @visual-guard/engine-playwright

# 初始化项目
visual-guard init

# 运行检测
visual-guard run
```
