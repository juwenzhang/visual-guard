# @visual-guard/engine-playwright

> Playwright 浏览器引擎适配器，实现 Visual Guard 的 `BrowserEngineAdapter` 接口。

## 安装

```bash
npm install @visual-guard/engine-playwright playwright
# 或
pnpm add @visual-guard/engine-playwright playwright
```

## 用法

```ts
import { createPlaywrightAdapter } from '@visual-guard/engine-playwright';
import { run } from '@visual-guard/core';

const adapter = createPlaywrightAdapter();
const manifest = await run({ config, adapter });
```

## API

### `createPlaywrightAdapter()`

创建 Playwright 引擎适配器实例，返回 `BrowserEngineAdapter`。

```ts
const adapter = createPlaywrightAdapter();
// adapter.name → 'playwright'
// adapter.capabilities → { fullPageScreenshot: true, ... }
// adapter.launch({ headless: true }) → EngineRuntime
```

实现的接口层级：

```
BrowserEngineAdapter  →  chromium.launch()
  └─ EngineRuntime    →  Browser
       └─ EngineContext →  BrowserContext
            └─ EnginePage →  Page
```

## License

[MIT](./LICENSE) © luhanxin
