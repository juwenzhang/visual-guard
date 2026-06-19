# @visual-guard/engine-puppeteer

Puppeteer 实验适配器，封装为 Visual Guard 的 `BrowserEngineAdapter`。

## 安装模式

该包不直接依赖 Puppeteer 运行时，而是让使用方按需选择：

```bash
pnpm add @visual-guard/engine-puppeteer puppeteer
# 安装 puppeteer：安装阶段会下载兼容 Chrome。
```

或：

```bash
pnpm add @visual-guard/engine-puppeteer puppeteer-core
# 安装 puppeteer-core：只安装库，不下载 Chrome。
```

运行时解析顺序为：

1. 优先加载使用方工程中的 `puppeteer`
2. 如果未安装，再加载使用方工程中的 `puppeteer-core`
3. 两者都未安装时，提示用户选择一种安装模式

## 使用 puppeteer-core

`puppeteer-core` 不包含浏览器下载逻辑。适配器会先自动查找本机常见 Chrome / Chromium 路径；如果未找到，再显式提供 Chrome 路径：

```ts
export default {
  browser: {
    engine: 'puppeteer',
    launchOptions: {
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    }
  }
};
```

也可以通过环境变量指定：

```bash
PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  visual-guard run --engine puppeteer
```

## 使用 puppeteer

`puppeteer` 会在安装阶段下载兼容 Chrome。若安装时跳过了下载，可手动补齐：

```bash
pnpm exec puppeteer browsers install chrome
visual-guard run --engine puppeteer
```

## 当前状态

该包已实现 `BrowserEngineAdapter` 形态，但 **暂不作为主线推荐引擎**。默认仍建议使用 Playwright：

```bash
visual-guard run --engine playwright
```

`puppeteer@25` 需要 Node >= 22.12，当前建议优先使用 `puppeteer@^24.31.0`。

## 定位

该包保留用于后续研究和兼容性验证，不阻塞 Visual Guard MVP 主线。
