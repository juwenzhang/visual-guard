# 浏览器引擎适配难点与取舍：Playwright / Puppeteer / Cypress

## 目录

1. [核心结论](#核心结论)
2. [Visual Guard 的引擎抽象目标](#visual-guard-的引擎抽象目标)
3. [底层内核与控制模型对比](#底层内核与控制模型对比)
4. [Playwright：适合作为主线实时引擎](#playwright适合作为主线实时引擎)
5. [Puppeteer：API 形态相似，但工程稳定性成本高](#puppeteerapi-形态相似但工程稳定性成本高)
6. [Cypress：不是实时 Page 引擎，而是测试 Runner 引擎](#cypress不是实时-page-引擎而是测试-runner-引擎)
7. [为什么不能强行统一成同一个 Page API](#为什么不能强行统一成同一个-page-api)
8. [建议的引擎分型设计](#建议的引擎分型设计)
9. [Cypress 适配的正确闭环](#cypress-适配的正确闭环)
10. [实践策略与路线图](#实践策略与路线图)
11. [当前项目决策](#当前项目决策)

---

## 核心结论

Visual Guard 最初希望通过统一的 `BrowserEngineAdapter` 抹平 Playwright、Puppeteer、Cypress 的差异：

```text
BrowserEngineAdapter
  -> EngineRuntime
    -> EngineContext
      -> EnginePage
```

这套抽象适合 **Playwright / Puppeteer** 这类“Node 进程直接控制浏览器页面”的实时引擎，但不适合 Cypress。

当前结论：

| 引擎 | 类型 | 是否适合 `EnginePage` 抽象 | 当前策略 |
|------|------|---------------------------|----------|
| Playwright | Realtime Browser Engine | ✅ 适合 | 主线推荐 |
| Puppeteer | Realtime Browser Engine | ✅ API 形态适合，但稳定性成本高 | 保留实验包，暂停主线投入 |
| Cypress | Runner Engine | ❌ 不适合 | 走 Cypress Runner / artifacts 桥接 |

因此，后续不应继续尝试把所有引擎都塞进同一套 `EnginePage`，而应明确分为两类：

```text
RealtimeBrowserEngineAdapter  -> Playwright / Puppeteer
RunnerEngineAdapter           -> Cypress / 未来测试 Runner 类引擎
```

用户体验可以保持统一：

```bash
visual-guard run --engine playwright
visual-guard run --engine cypress
```

但内部执行路径应该不同：

```text
playwright -> page.goto/page.screenshot/page.evaluate
cypress    -> cypress.run -> cy.visit/cy.screenshot/cy.task -> artifacts -> Snapshot
```

---

## Visual Guard 的引擎抽象目标

Visual Guard 的核心价值不是“支持很多浏览器库”，而是稳定产出统一的检测结果：

```text
配置化场景
  -> 页面采集
  -> Snapshot
  -> baseline 读写
  -> 多维 diff
  -> DiffManifest
  -> reporter / plugin 消费
```

其中最重要的协议产物是：

- `Snapshot`：某个场景的当前页面采集结果
- `BaselineBundle`：历史基线
- `DiffManifest`：最终报告协议

引擎适配层只是为了把不同工具采集到的内容统一成 `Snapshot`。

所以引擎抽象的正确目标是：

> 统一结果协议，而不是强行统一底层控制方式。

也就是说，应该统一的是：

```text
Engine Output -> Snapshot
```

而不是要求所有引擎都必须支持：

```ts
await page.goto(url);
await page.screenshot();
await page.evaluate(fn);
```

---

## 底层内核与控制模型对比

### 1. Playwright

Playwright 是现代浏览器自动化框架，内置浏览器管理能力，支持 Chromium / Firefox / WebKit。

核心模型：

```ts
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(url);
await page.screenshot();
await page.evaluate(() => document.documentElement.outerHTML);
```

特征：

- Node 进程直接控制浏览器
- `BrowserContext` 是一等公民
- 浏览器 revision 与 Playwright 包强绑定
- `page` 生命周期清晰
- 更适合视觉回归类工具

### 2. Puppeteer

Puppeteer 是 Chrome DevTools Protocol 的高层封装，主要面向 Chromium。

核心模型与 Playwright 类似：

```ts
const browser = await puppeteer.launch();
const page = await browser.newPage();

await page.goto(url);
await page.screenshot();
await page.evaluate(() => document.documentElement.outerHTML);
```

特征：

- Node 进程直接控制浏览器
- API 形态接近 Playwright
- 更贴近 Chromium / CDP 底层
- 版本、Chrome revision、缓存路径更敏感
- 不同版本的 context API 存在差异

### 3. Cypress

Cypress 是测试 Runner，不是普通浏览器控制库。

核心模型：

```ts
cy.visit(url);
cy.screenshot();
cy.document().then((doc) => {
  // 读取 DOM
});
cy.task('writeArtifact', data);
```

它的 Node API 通常是：

```ts
await cypress.run({
  configFile: 'cypress.config.ts',
  spec: 'cypress/e2e/visual-guard.generated.cy.ts',
});
```

特征：

- Cypress Runner 控制浏览器
- 用户代码运行在 Cypress spec 环境
- 命令是 `cy.*` 队列模型
- Node 侧不能直接拿到 `page` 对象
- 更适合复用已有 Cypress 项目的登录态、mock、拦截、业务测试链路

---

## Playwright：适合作为主线实时引擎

Playwright 和 Visual Guard 当前的 `EnginePage` 抽象高度匹配。

```ts
export interface EnginePage {
  goto(url: string, options?: GotoOptions): Promise<void>;
  waitForSelector(selector: string, options?: WaitOptions): Promise<void>;
  waitForNetworkIdle?(options?: WaitOptions): Promise<void>;
  evaluate<T>(fn: (...args: unknown[]) => T, ...args: unknown[]): Promise<T>;
  screenshot(options: ScreenshotOptions): Promise<Buffer>;
  elementScreenshot?(selector: string, options?: ScreenshotOptions): Promise<Buffer>;
  close(): Promise<void>;
}
```

Playwright 能自然实现这些能力：

```ts
page.goto()
page.waitForSelector()
page.waitForLoadState('networkidle')
page.evaluate()
page.screenshot()
locator.screenshot()
```

### Playwright 的优势

1. **浏览器版本管理稳定**

```bash
npx playwright install chromium
```

Playwright 能明确安装与当前包版本匹配的浏览器。

2. **Context 隔离强**

```ts
browser.newContext({ viewport, locale, timezoneId })
```

这非常适合视觉回归中按场景、视口隔离环境。

3. **SSR 适配空间大**

当前项目已经针对 SSR streaming 做过 Playwright 适配：

- SSR 模式禁用 service worker
- `goto` 使用 `domcontentloaded`
- SSR 模式跳过 request / response listener
- SSR 模式降低并发，避免 stream tracker 异常累积

4. **用户体验好**

缺少 Chromium 时可自动安装：

```bash
npx playwright install chromium
```

### Playwright 的当前定位

> Playwright 是 Visual Guard 的主线稳定引擎，MVP 和 CI 场景优先保证 Playwright 闭环。

---

## Puppeteer：API 形态相似，但工程稳定性成本高

Puppeteer 表面上很适合当前 `EnginePage` 抽象，因为它也有：

```ts
page.goto()
page.screenshot()
page.evaluate()
```

但实际适配中遇到的问题比预期多。

### 1. 多版本解析源不一致

在 monorepo 中，可能同时存在多套：

```text
puppeteer@21.x
puppeteer@22.x
puppeteer-core@21.x
puppeteer-core@22.x
```

如果引擎包自身和使用者工程分别解析出不同版本，就可能出现：

```text
standalone 使用 puppeteer@21
engine-puppeteer 自己解析到 puppeteer@22
```

这会导致：

- 期望 Chrome revision 不一致
- `puppeteer.executablePath()` 查找的缓存不一致
- 实际 launch 的 `puppeteer-core` 版本不一致

### 2. Chrome revision / 缓存路径敏感

Puppeteer 错误常见形式：

```text
Could not find Chrome (ver. 127.0.6533.88)
cache path: ~/.cache/puppeteer
```

即使用户已经下载过 Chrome，也可能下载的是另一个 revision：

```text
chrome@121.0.6167.85
chrome@127.0.6533.88
```

### 3. Context API 跨版本差异

Puppeteer 21 中：

```ts
browser.createBrowserContext === undefined
browser.createIncognitoBrowserContext === function
```

新版本中则更接近：

```ts
browser.createBrowserContext()
```

这会导致 adapter 必须做版本兼容层。

### 4. Headless 模式行为差异

实际探测中出现过：

| headless 模式 | 表现 |
|--------------|------|
| `true` | 能启动，但页面操作时可能断连 |
| `'new'` | 可能 `ECONNRESET` |
| `false` | 可能 `socket hang up` |

### 5. 运行时断连

典型错误：

```text
read ECONNRESET
socket hang up
Navigating frame was detached
Protocol error: Connection closed. Most likely the page has been closed.
```

这说明问题已经不只是“是否下载 Chrome”，而是 Puppeteer / Chrome / CDP 连接生命周期在当前环境下不稳定。

### Puppeteer 的当前定位

> Puppeteer 保留实验包，但不作为 MVP 主线，不继续阻塞 Playwright 和 Cypress 路线。

---

## Cypress：不是实时 Page 引擎，而是测试 Runner 引擎

Cypress 的核心问题不是稳定性，而是模型不同。

Playwright 的 Node 侧代码可以直接写：

```ts
await page.goto(url);
await page.screenshot();
```

Cypress 不行。Cypress 的浏览器操作必须在 spec 里：

```ts
cy.visit(url);
cy.screenshot();
```

Node 侧只能启动 Runner：

```ts
await cypress.run({
  configFile: 'cypress.config.ts',
  spec: 'cypress/e2e/visual-guard.generated.cy.ts',
});
```

因此 Cypress 不能真实实现：

```ts
EngineRuntime -> EngineContext -> EnginePage
```

如果强行实现，只能变成假的 `EnginePage`，内部仍然是生成 spec 或等待 Cypress 产物。

这会带来两个坏处：

1. 抽象不诚实
2. 调试困难，用户以为是普通 page API，实际上是 Cypress Runner

---

## 为什么不能强行统一成同一个 Page API

统一抽象有两种：

### 错误统一：统一控制 API

```text
所有引擎都必须实现 page.goto/page.screenshot/page.evaluate
```

这对 Cypress 不成立。

### 正确统一：统一产物协议

```text
不同引擎用自己的方式采集
最终都输出 Snapshot / DiffManifest
```

也就是说，Visual Guard 应该统一：

```ts
Snapshot
DiffManifest
Reporter 输入
Plugin 输入
```

而不是统一：

```ts
page.goto()
```

对于 Playwright：

```text
page.goto -> screenshot -> evaluate -> Snapshot
```

对于 Cypress：

```text
cypress.run -> cy.screenshot/cy.document -> artifacts -> Snapshot
```

---

## 建议的引擎分型设计

建议把引擎分成两类。

### 1. RealtimeBrowserEngineAdapter

适合 Playwright / Puppeteer：

```ts
export interface RealtimeBrowserEngineAdapter {
  kind: 'realtime';
  name: BrowserEngineName;
  capabilities: EngineCapabilities;
  launch(options: EngineLaunchOptions): Promise<EngineRuntime>;
}
```

执行路径：

```text
run()
  -> adapter.launch()
  -> runtime.createContext()
  -> context.newPage()
  -> captureScene()
  -> Snapshot
```

### 2. RunnerEngineAdapter

适合 Cypress：

```ts
export interface RunnerEngineAdapter {
  kind: 'runner';
  name: BrowserEngineName;
  capabilities: EngineCapabilities;
  run(options: RunnerEngineOptions): Promise<RunnerArtifacts>;
}
```

执行路径：

```text
run()
  -> adapter.kind === 'runner'
  -> runCypressBridge()
  -> Cypress artifacts
  -> readArtifactsAsSnapshot()
  -> DiffManifest
```

### Core 层判断

```ts
if (adapter.kind === 'realtime') {
  return runRealtimeEngine(options);
}

if (adapter.kind === 'runner') {
  return runRunnerEngine(options);
}
```

这样用户体验仍然统一：

```bash
visual-guard run --engine playwright
visual-guard run --engine cypress
```

但内部不会强迫 Cypress 伪装成 Playwright。

---

## Cypress 适配的正确闭环

Cypress 的完整闭环应是：

```text
VisualGuardConfig
  ↓
生成临时 Cypress spec + cypress.config.ts
  ↓
调用 cypress.run()
  ↓
Cypress 执行：
  - cy.visit(url)
  - cy.viewport(width, height)
  - cy.document() -> DOM
  - cy.screenshot() -> PNG
  - cy.task()/cy.writeFile() -> artifacts
  ↓
.visual-guard/cypress-artifacts/
  cases/
    home@desktop/
      dom.html
      meta.json
      screenshot.png
  ↓
Core 读取 artifacts
  ↓
转换为 Snapshot
  ↓
复用 baseline / diff / reporter
```

### artifacts 协议建议

```text
.visual-guard/cypress-artifacts/
  cases/
    {sceneId}@{viewportName}/
      meta.json
      dom.html
      screenshot.png
      elements/
        {encodedSelector}.png
```

`meta.json`：

```json
{
  "id": "home@desktop",
  "name": "首页",
  "url": "https://example.com/",
  "viewport": {
    "name": "desktop",
    "width": 1280,
    "height": 800
  },
  "screenshot": "screenshot.png",
  "createdAt": "2026-06-19T00:00:00.000Z"
}
```

后续 core 可以新增：

```ts
readCypressArtifacts(artifactDir): Promise<CaptureResult[]>
```

再复用现有：

```text
BaselineStore
DiffEngine
Reporter
```

---

## 实践策略与路线图

### P0：稳定主线

目标：Playwright MVP 稳定可用。

- 保持 `visual-guard run` 默认 Playwright
- 完善 baseline / diff / report
- 输出稳定 HTML / JSON / Console
- CI 中优先跑 Playwright

### P1：Cypress Runner 闭环

目标：让用户能用统一命令跑 Cypress。

```bash
visual-guard run --engine cypress
```

内部执行：

1. 生成临时 Cypress spec/config
2. 调用 `cypress.run()`
3. 读取 artifacts
4. 生成 Snapshot
5. 复用 diff/report

### P2：插件系统落地

- notify
- perf
- archive
- ai

### P3：Puppeteer 再评估

等主链路稳定后，再决定是否继续投入 Puppeteer。

评估前提：

- 固定 Puppeteer 主版本
- 固定 Chrome 下载策略
- 单独 e2e 诊断脚本
- 明确是否真的需要 Puppeteer，而不是 Playwright 覆盖即可

---

## 当前项目决策

当前阶段最终决策：

1. **Playwright 是主线稳定引擎**
2. **Cypress 是下一阶段重点，但必须走 Runner Engine，不伪装 Page API**
3. **Puppeteer 暂停主线投入，保留实验包和经验记录**
4. **暂不适配 Windows，只保证 macOS / Linux**
5. **统一用户入口，但区分内部执行模式**

最终用户体验目标：

```bash
visual-guard run --engine playwright
visual-guard run --engine cypress
```

而不是：

```bash
visual-guard cypress spec
npx cypress run
```

后者可以保留为调试命令，但不应作为主流程暴露给普通用户。
