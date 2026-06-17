# Visual Guard

Visual Guard 是一个面向前端页面的自动化视觉回归与页面质量检测工具。

当前阶段先完成 Monorepo 工程骨架和架构边界初始化，暂不进入具体业务实现。

## 架构方向

核心链路：

```text
配置化场景 -> 多引擎浏览器采集 -> 基线读写 -> 多维 diff -> DiffManifest -> 报告/插件消费
```

关键设计：

- `BrowserEngineAdapter`：统一 `playwright`、`puppeteer`、`cypress` 多引擎适配边界。
- `DiffManifest`：采集、对比、报告、插件之间的统一数据协议。
- `BaselineStore`：本地与远程 baseline 的存储抽象。
- `PluginAPI`：通知、AI、性能、归档等扩展能力的生命周期入口。

完整设计见：`docs/design.md`。

## 包结构

```text
packages/
  shared/             # 共享类型、工具函数、日志、路径工具
  config/             # 配置加载、默认值、环境变量覆盖、schema 校验
  core/               # 场景执行、采集、基线、diff、manifest 聚合
  engine-playwright/  # Playwright 引擎适配器
  engine-puppeteer/   # Puppeteer 引擎适配器
  engine-cypress/     # Cypress 项目桥接适配器
  cli/                # 命令行入口
  reporters/          # HTML / JSON / Console 报告器
  plugin-notify/      # 通知插件
  plugin-ai/          # AI 分析插件
  plugin-perf/        # 性能插件
  plugin-archive/     # 归档插件
```

## 开发命令

```bash
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run build
```

## 项目记忆

项目推进记录保存在：`memory/progress.md`。

> 如果想要快速迭代开发，可以使用 `pnpm i -g @lhx-kit/cli`，然后使用 `lhx-cli add package <package-name> --description <description> --force` 来快速创建包。
