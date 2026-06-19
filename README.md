# Visual Guard

Visual Guard 是一个面向前端页面的自动化视觉回归与页面质量检测工具。

核心链路：

```text
配置化场景 -> 浏览器采集 -> 基线读写 -> 多维 diff -> DiffManifest -> 报告/插件消费
```

## 当前状态

| 模块 | 状态 | 说明 |
|------|------|------|
| `@visual-guard/shared` | ✅ | 类型、日志、工具、路径 |
| `@visual-guard/config` | ✅ | `visualguard.config.*` 自动发现 + zod 校验 |
| `@visual-guard/core` | ✅ | runner / capture / diff / baseline / `--write-baseline` |
| `@visual-guard/engine-playwright` | ✅ 推荐 | 默认稳定引擎，当前主线维护 |
| `@visual-guard/engine-cypress` | 🟡 桥接中 | Cypress 与 Page API 模型不同，后续走 spec + task 桥接 |
| `@visual-guard/engine-puppeteer` | ⚠️ 暂停 | 版本 / Chrome 缓存 / 生命周期坑较多，暂不作为主线 |
| `@visual-guard/cli` | ✅ | `run` / `init` / `baseline list` / `baseline clean` |
| `@visual-guard/reporters` | ✅ | Console / JSON / HTML |
| `plugin-*` | ⚪ | notify / ai / perf / archive 暂为骨架 |

## 引擎策略

当前主线只保证 **macOS / Linux**，暂不适配 Windows。

- **Playwright**：主推荐引擎，负责稳定采集闭环。
- **Cypress**：作为已有 Cypress 项目的桥接方案，后续不复刻 Page API，而是生成 Cypress spec，通过 `cy.visit` / `cy.screenshot` / `cy.task` 输出采集产物。
- **Puppeteer**：保留实验包，但暂不投入主线。已确认其在多版本 monorepo、Chrome revision、headless、连接生命周期上存在较多不稳定点。

## 快速开始

```bash
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run build
```

独立工程示例：

```bash
cd examples/standalone
pnpm guard:run              # Playwright 主线
pnpm guard:baseline         # 查看基线
pnpm guard:clean            # 清理基线预览
```

## 包结构

```text
packages/
  shared/             # 共享类型、工具函数、日志、路径工具
  config/             # 配置加载、默认值、环境变量覆盖、schema 校验
  core/               # 场景执行、采集、基线、diff、manifest 聚合
  engine-playwright/  # Playwright 引擎适配器（主线）
  engine-cypress/     # Cypress 项目桥接适配器（规划中）
  engine-puppeteer/   # Puppeteer 实验适配器（暂停主线投入）
  cli/                # 命令行入口
  reporters/          # HTML / JSON / Console 报告器
  plugin-notify/      # 通知插件
  plugin-ai/          # AI 分析插件
  plugin-perf/        # 性能插件
  plugin-archive/     # 归档插件
```

## 项目记忆

项目推进记录保存在：`memory/progress.md`。
