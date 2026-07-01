# Visual Guard

> 📖 [English](./README.md)

自动化视觉回归与页面质量检测工具。配置化场景 → 浏览器采集 → 基线读写 → 多维对比 → 报告/通知。

```text
配置化场景 → 浏览器采集 → 基线读写 → 多维 diff → DiffManifest → 报告 + 插件消费
```

## 当前状态

| 模块 | 状态 | 说明 |
|------|------|------|
| `@visual-guard/shared` | ✅ | 类型、日志、工具、路径 |
| `@visual-guard/config` | ✅ | `visualguard.config.*` 自动发现 + zod 校验 + 环境变量覆盖 |
| `@visual-guard/core` | ✅ | runner / capture / stabilize / diff / semantic-diff / baseline / 分支检测 |
| `@visual-guard/engine-playwright` | ✅ | 默认稳定引擎，主线维护 |
| `@visual-guard/engine-puppeteer` | ✅ | 完全可用，自动探测本机 Chrome，作为备选引擎 |
| `@visual-guard/cli` | ✅ | `run` / `init`（含通知配置）/ `baseline list` / `baseline clean` |
| `@visual-guard/reporters` | ✅ | HTML（侧边栏+TAB）/ JSON（summary 拆分）/ Console |
| `@visual-guard/plugin-notify` | ✅ | 企微/飞书/钉钉 Webhook + QQ 邮箱 SMTP + 通用 Webhook |
| `@visual-guard/plugin-perf` | ✅ | LCP / FCP / CLS / TTFB 采集 + 预算检查 |
| `@visual-guard/plugin-ai` | ⚪ | AI 差异解释（骨架） |
| `@visual-guard/plugin-archive` | ⚪ | 归档压缩（骨架） |

## 核心特性

- **动态内容稳定** — 截图前自动冻结 `Date`、禁用 CSS 动画、冻结 `rAF`，减少误报
- **语义化差异** — 将 pixelmatch/deep-diff 底层输出转为自然语言描述，AI 可消费
- **五维对比** — 像素 / DOM 结构 / 布局偏移 / 网络请求 / 性能指标
- **富交互 HTML 报告** — 侧边栏导航 + 7 维 TAB + diff 热力图 + 动画帧切换 + 性能仪表盘
- **多渠通知** — 企微/飞书/钉钉 Webhook + QQ 邮箱 + 通用 Webhook，`env:` 前缀保护敏感信息
- **分支自动检测** — 自动读取 Git 分支名，无需手动配置

## 引擎策略

当前主线仅保证 **macOS / Linux**。

- **Playwright**：主推荐引擎，默认稳定采集闭环。
- **Puppeteer**：完全可用的备选引擎，自动探测本机 Chrome 路径。

## 快速开始

```bash
pnpm install
pnpm run typecheck
pnpm run build
```

独立工程示例：

```bash
cd examples/standalone
pnpm guard:run              # Playwright 主线
pnpm guard:run:puppeteer    # Puppeteer 备选
pnpm guard:baseline         # 查看基线
pnpm guard:clean            # 清理基线预览
```

## 包结构

```text
packages/
  shared/             # 共享类型、工具函数、日志、路径工具
  config/             # 配置加载、默认值、环境变量覆盖、schema 校验
  core/               # 场景执行、采集、稳定化、基线、diff、语义化
  engine-playwright/  # Playwright 引擎适配器（主线）
  engine-puppeteer/   # Puppeteer 实验适配器
  cli/                # 命令行入口（run / init / baseline）
  reporters/          # HTML / JSON（summary+manifest）/ Console 报告器
  plugin-notify/      # IM 通知 + 邮件通知
  plugin-perf/        # Web Vitals 采集 + 预算检查
  plugin-ai/          # AI 分析插件（规划中）
  plugin-archive/     # 归档插件（规划中）
```

## 项目记忆

项目推进记录保存在：`memory/progress.md`。
