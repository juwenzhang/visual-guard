# @visual-guard/cli

Visual Guard 命令行入口。

## 安装

```bash
pnpm add -D @visual-guard/cli @visual-guard/engine-playwright
```

引擎是可选 peer dependency，按需安装：

```bash
pnpm add -D @visual-guard/engine-playwright   # 推荐主线
pnpm add -D @visual-guard/engine-cypress cypress
```

`@visual-guard/engine-puppeteer` 保留实验包，暂不推荐作为主线。

## 命令

```bash
visual-guard init
visual-guard run
visual-guard run --engine playwright
visual-guard run --write-baseline
visual-guard baseline list
visual-guard baseline clean --dry-run

# Cypress 桥接
visual-guard cypress spec   # 生成 cypress/e2e/visual-guard.generated.cy.js + cypress.config.js
visual-guard cypress run --browser electron
# 如需接近 Chrome 渲染，可显式指定：visual-guard cypress run --browser chrome
```

## 引擎策略

- `playwright`：稳定主线，`visual-guard run` 默认使用。
- `cypress`：桥接模式，通过 `visual-guard cypress spec` 生成 Cypress spec，再由 Cypress 执行。
- `puppeteer`：实验性，暂停主线投入。
