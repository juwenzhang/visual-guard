# @visual-guard/engine-puppeteer

Puppeteer 实验适配器。

## 当前状态

该包已实现 `BrowserEngineAdapter` 形态，但 **暂不作为主线推荐引擎**。

已确认的风险：

- monorepo 中多版本 `puppeteer` / `puppeteer-core` 解析源容易不一致
- Chrome revision 与 `~/.cache/puppeteer` 缓存容易错配
- `headless: true` / `headless: 'new'` 在本机表现不同
- 可能出现 `ECONNRESET`、`Navigating frame was detached`、`Protocol error: Connection closed`

## 建议

默认使用 Playwright：

```bash
visual-guard run --engine playwright
```

如需继续调研 Puppeteer，请先用最小脚本验证：

```bash
npx puppeteer browsers install chrome
visual-guard run --engine puppeteer
```

## 定位

该包保留用于后续研究和兼容性验证，不阻塞 Visual Guard MVP 主线。
