# @visual-guard/engine-cypress

Cypress 项目桥接适配器。

## 为什么不是普通 EngineRuntime？

Cypress 不暴露 Playwright/Puppeteer 式的同进程 `Page` API，不能在 Node 侧直接 `goto` / `screenshot` / `evaluate`。因此本包采用 **桥接模式**：生成 Cypress spec，让 Cypress 自己驱动浏览器，再把采集产物写回 Visual Guard。

当前阶段仅面向 macOS / Linux，不适配 Windows。

## CLI 用法

```bash
# 生成 Cypress spec 和 cypress.config.ts
visual-guard cypress spec

# 生成并执行 Cypress 采集（默认 electron，保证开箱可运行）
visual-guard cypress run --browser electron

# 如需接近 Chrome 渲染，可显式指定 Chrome
visual-guard cypress run --browser chrome
```

默认生成：

```text
cypress/e2e/visual-guard.generated.cy.js
cypress.config.js
.visual-guard/cypress-artifacts/
```

默认使用 JS spec/config，避免 Cypress 在独立示例中误读 workspace 的 TypeScript 配置。

## API

### `createCypressAdapter()`

提供统一的 `BrowserEngineAdapter` 边界和能力声明。当前直接通过 `visual-guard run --engine cypress` 会提示桥接模式，不会伪装成实时 Page Runtime。

### `generateCypressSpec(options)`

根据 Visual Guard 配置生成 Cypress spec 文本。

### `writeCypressSpec(options, specFile)`

写入生成的 Cypress spec。

### `generateCypressConfig(options)` / `writeCypressConfig(options)`

生成或写入 Cypress 配置文件，指定 `screenshotsFolder` 和 `specPattern`。

## 后续计划

1. Core 读取 `.visual-guard/cypress-artifacts`
2. 将 DOM / screenshot 转换为统一 `Snapshot`
3. 复用 baseline / diff / reporter 形成完整 Cypress 闭环
