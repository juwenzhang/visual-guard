# @visual-guard/engine-puppeteer

Puppeteer 实验适配器，封装为 Visual Guard 的 `BrowserEngineAdapter`。

## 安装

选择需要的 Puppeteer 运行时：

```bash
pnpm add @visual-guard/engine-puppeteer puppeteer
# puppeteer 会在安装阶段下载兼容 Chrome。
```

或：

```bash
pnpm add @visual-guard/engine-puppeteer puppeteer-core
# puppeteer-core 只安装库，不下载 Chrome。
```

## 运行时适配

适配器会从使用方工程解析依赖：

1. 优先加载 `puppeteer`
2. 未安装 `puppeteer` 时加载 `puppeteer-core`
3. 两者都缺失时提示安装其中一种

如果使用 `puppeteer-core`，适配器会先自动查找本机常见 Chrome / Chromium 路径；如果未找到，再通过 `browser.launchOptions.executablePath` 或 `PUPPETEER_EXECUTABLE_PATH` 指定 Chrome 路径。

## 文档

完整的 visual-guard 文档：<https://juwenzhang.github.io/visual-guard/>

## License

[MIT](./LICENSE) © luhanxin
