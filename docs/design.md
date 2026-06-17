# Visual Guard 设计文档

## 1. 背景与目标

Visual Guard 是一个面向前端页面的自动化视觉回归与页面质量检测工具。它通过浏览器自动化执行配置化场景，采集页面截图、元素截图、DOM 快照、网络请求、控制台错误和性能指标，并与历史基线进行对比，最终输出 HTML、JSON、控制台报告，也可通过插件进行通知推送、AI 分析和性能诊断。

本项目不建议把 84 项能力一次性堆在单包里实现，而是采用 Monorepo + 插件化架构：核心链路先闭环，扩展能力按插件逐步接入。

核心目标：

- 支持稳定、可重复的页面采集。
- 支持截图、DOM、网络、性能多维度对比。
- 支持本地与远程基线管理。
- 支持 CLI、CI、HTML 报告和 JSON manifest。
- 支持通知、AI 分析、Lighthouse 等插件能力。
- 支持后续扩展 VSCode 插件、远程基线服务、趋势分析等能力。

## 2. 总体判断

这份功能清单覆盖面很完整，但实际落地时需要控制复杂度：

1. **浏览器引擎必须支持可切换**  
   Core 不直接绑定某一个自动化框架，而是定义统一的 `BrowserEngineAdapter`。首批支持 `playwright`、`puppeteer`、`cypress` 三类引擎，默认推荐 `playwright`，但用户可通过配置或 CLI 参数切换。

2. **不同引擎能力不完全一致，必须做能力分层**  
   `playwright` / `puppeteer` 适合作为完整采集引擎，覆盖截图、DOM、网络、性能、登录态注入等能力；`cypress` 更适合作为已有 E2E 项目的运行适配器，复用 Cypress 场景和登录能力，但部分底层能力需要通过 Cypress plugin/task 间接实现。

3. **Core 只负责采集、对比、基线、生命周期，不直接关心 CLI 和报告 UI**  
   Core 输出统一 `DiffManifest`，其他模块都消费这个 manifest。

4. **报告、通知、AI、性能增强全部插件化**  
   避免核心包越来越重，也方便用户按需安装。

5. **基线结构必须一开始设计好**  
   视觉回归工具最容易在 baseline 管理上失控，必须按项目、环境、分支、场景、视口隔离。

6. **MVP 不追求 84 项全部完成，但架构必须容纳全部能力**  
   首版先完成：场景执行、截图、DOM 快照、baseline 写入/读取、像素 diff、DOM diff、HTML/JSON/Console 报告、CLI 退出码，并保留多引擎 adapter 扩展点。

## 3. 技术选型

| 领域 | 推荐方案 | 说明 |
|---|---|---|
| 包管理 | `pnpm workspace` | 适合 Monorepo，依赖复用好 |
| 语言 | TypeScript | 类型约束对插件 API、manifest、配置非常关键 |
| 构建 | `tsup` | 多包构建简单，支持 ESM/CJS |
| 测试 | `vitest` | 单测、快照测试、工具函数测试 |
| 浏览器自动化 | `playwright` / `puppeteer` / `cypress` | 通过 `BrowserEngineAdapter` 统一抽象，默认推荐 `playwright` |
| 引擎适配 | 独立 adapter package | `engine-playwright`、`engine-puppeteer`、`engine-cypress` 分包维护 |
| CLI | `commander` | API 简洁，子命令清晰 |
| 配置加载 | `cosmiconfig` | 支持 JS/TS/JSON 配置查找 |
| 配置校验 | `zod` | 生成类型和运行时校验统一 |
| 图片对比 | `pixelmatch` + `pngjs` | `pixelmatch` 需要 PNG 数据结构配合 |
| 并发控制 | `p-limit` | 控制场景并发 |
| 文件操作 | `fs-extra` | baseline/report 写入更方便 |
| 终端输出 | `chalk` + `ora` | 彩色摘要与进度提示 |
| 日志 | `consola` | 轻量、分级清晰 |
| 通知 | `axios` / `nodemailer` | Webhook 与邮件 |
| 性能 | `lighthouse` | 作为独立性能插件接入，主要适配 Chromium 类引擎 |
| 图表 | `chart.js` | 报告中的趋势、水瀑图可选使用 |
| 压缩归档 | `archiver` | 截图归档插件使用 |

## 4. Monorepo 目录结构

```text
visual-guard/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  turbo.json
  docs/
    design.md
  examples/
    basic/
      visualguard.config.ts
    ci/
      gitlab-ci.yml
      github-actions.yml
  packages/
    shared/
      src/
        types/
        utils/
        logger/
        path/
    config/
      src/
        defaults.ts
        schema.ts
        loadConfig.ts
        env.ts
    core/
      src/
        browser/
        engine/
          adapter.ts
          capabilities.ts
        scenario/
        capture/
        snapshot/
        baseline/
        diff/
        hooks/
        runner/
        manifest/
    engine-playwright/
      src/
        index.ts
    engine-puppeteer/
      src/
        index.ts
    engine-cypress/
      src/
        index.ts
    cli/
      src/
        commands/
        index.ts
    reporters/
      src/
        html/
        json/
        console/
    plugin-notify/
      src/
        wecom.ts
        feishu.ts
        dingtalk.ts
        email.ts
    plugin-ai/
      src/
        analyzer.ts
        classifier.ts
        advisor.ts
    plugin-perf/
      src/
        lighthouse.ts
        budget.ts
        trend.ts
    plugin-archive/
      src/
        archive.ts
```

## 5. 包职责划分

### 5.1 `@visual-guard/shared`

共享类型、工具函数和底层基础设施。

包含：

- `SceneConfig`
- `VisualGuardConfig`
- `Snapshot`
- `DomNodeSnapshot`
- `NetworkRecord`
- `PerformanceMetrics`
- `BaselineMeta`
- `DiffManifest`
- `PluginAPI`
- `sleep`、`retry`、`hash`、`stableStringify`
- 路径生成工具
- 分级日志工具

### 5.2 `@visual-guard/config`

负责配置加载、默认值合并、环境变量覆盖和校验。

支持配置文件：

- `visualguard.config.ts`
- `visualguard.config.js`
- `visualguard.config.mjs`
- `visualguard.config.json`

配置优先级：

```text
CLI 参数 > 环境变量 > 用户配置文件 > 默认配置
```

### 5.3 `@visual-guard/core`

系统核心，负责执行完整检测流程。

核心模块：

- Engine Adapter：统一抽象 `playwright`、`puppeteer`、`cypress` 的差异。
- Browser Manager：浏览器实例池、上下文管理，具体实现由当前 engine adapter 提供。
- Page Lifecycle：页面跳转、等待、超时、重试。
- Scenario Resolver：场景解析、标签过滤、URL 构造。
- Auth Injector：Cookie、localStorage、header 注入。
- Stabilizer：冻结时间、禁用动画、处理动态内容。
- Capture：全页截图、元素截图、DOM 快照、网络记录、控制台错误、性能指标。
- Baseline Store：本地基线读写、版本管理、清理策略。
- Diff Engine：DOM diff、文本属性 diff、布局 diff、像素 diff、性能 diff。
- Hook Runtime：生命周期钩子。
- Runner：并发执行、错误隔离、结果聚合。

### 5.4 `@visual-guard/cli`

命令行入口，只负责解析参数、加载配置、调用 core、触发 reporter、设置退出码。

建议命令：

```bash
visual-guard run
visual-guard init
visual-guard baseline list
visual-guard baseline clean
visual-guard report open
```

常用参数：

```bash
visual-guard run \
  --env test \
  --engine playwright \
  --config visualguard.config.ts \
  --scenes home,detail \
  --tags smoke \
  --write-baseline \
  --format html,json,console \
  --budget ./perf-budget.json
```

退出码：

| 退出码 | 含义 |
|---:|---|
| `0` | 无差异，执行成功 |
| `1` | 执行成功，但存在视觉/DOM/性能差异 |
| `2` | 执行异常，如配置错误、浏览器启动失败 |

### 5.5 `@visual-guard/reporters`

消费 `DiffManifest`，输出多种报告。

包含：

- HTML Reporter
- JSON Reporter
- Console Reporter
- 可选 PDF Exporter

HTML 报告重点：

- 左右截图对比。
- diff overlay。
- DOM 变化表格。
- 网络请求变化。
- 性能指标对比。
- 场景折叠展开。
- 报告元信息。
- Lighthouse iframe 嵌入。

### 5.6 插件包

插件通过统一生命周期接入：

```ts
export interface VisualGuardPlugin {
  name: string;
  setup(api: PluginAPI): void | Promise<void>;
}
```

典型钩子：

```ts
api.on('beforeRun', handler);
api.on('beforeScenario', handler);
api.on('beforeCapture', handler);
api.on('afterCapture', handler);
api.on('afterCompare', handler);
api.on('afterReport', handler);
api.on('afterRun', handler);
api.on('onError', handler);
```

插件分类：

- `plugin-notify`：企业微信、飞书、钉钉、邮件。
- `plugin-ai`：多模态差异解释、变化分类、修复建议、性能退化原因分析。
- `plugin-perf`：Lighthouse、性能预算、资源大小统计、Long Tasks、趋势记录、回归告警。
- `plugin-archive`：截图与报告归档。

### 5.7 多引擎适配设计

多引擎切换不应该通过在业务代码中写大量 `if engine === 'xxx'` 实现，而是通过统一 adapter 协议隔离差异。

```ts
export type BrowserEngineName = 'playwright' | 'puppeteer' | 'cypress';

export interface BrowserEngineAdapter {
  name: BrowserEngineName;
  capabilities: EngineCapabilities;
  launch(options: EngineLaunchOptions): Promise<EngineRuntime>;
}

export interface EngineRuntime {
  createContext(options: EngineContextOptions): Promise<EngineContext>;
  close(): Promise<void>;
}

export interface EngineContext {
  newPage(): Promise<EnginePage>;
  setCookies?(cookies: CookieInput[]): Promise<void>;
  setExtraHTTPHeaders?(headers: Record<string, string>): Promise<void>;
  close(): Promise<void>;
}

export interface EnginePage {
  goto(url: string, options?: GotoOptions): Promise<void>;
  waitForSelector(selector: string, options?: WaitOptions): Promise<void>;
  waitForNetworkIdle?(options?: WaitOptions): Promise<void>;
  evaluate<T>(fn: (...args: any[]) => T, ...args: any[]): Promise<T>;
  screenshot(options: ScreenshotOptions): Promise<Buffer>;
  elementScreenshot?(selector: string, options?: ScreenshotOptions): Promise<Buffer>;
  onConsole?(handler: ConsoleHandler): void;
  onRequest?(handler: RequestHandler): void;
  onResponse?(handler: ResponseHandler): void;
  close(): Promise<void>;
}
```

能力矩阵：

| 能力 | Playwright | Puppeteer | Cypress |
|---|---:|---:|---:|
| 页面跳转 | 支持 | 支持 | 支持 |
| 全页截图 | 支持 | 支持 | 支持 |
| 元素截图 | 支持 | 支持 | 支持，但建议通过命令封装 |
| DOM 快照 | 支持 | 支持 | 支持 |
| 网络监听 | 支持 | 支持 | 支持，但依赖 `cy.intercept` / plugin |
| console/pageerror | 支持 | 支持 | 部分支持 |
| 多 context 隔离 | 支持 | 部分支持 | 不适合作为同进程池化模型 |
| Lighthouse | 适配好 | 适配好 | 不建议直接耦合 |
| 已有 E2E 复用 | 一般 | 一般 | 很强 |

落地策略：

- `engine-playwright`：默认引擎，优先实现完整能力。
- `engine-puppeteer`：作为 Chromium 专项适配器，适合已有 Puppeteer 生态用户。
- `engine-cypress`：作为 Cypress 项目适配器，重点复用已有测试链路，不强行要求与 Playwright/Puppeteer 完全同构。
- Core 只依赖 `BrowserEngineAdapter`，不直接依赖 `playwright`、`puppeteer`、`cypress`。
- CLI 支持 `--engine playwright|puppeteer|cypress` 覆盖配置。

## 6. 核心执行流程

```text
1. CLI 解析参数
2. 加载并校验配置
3. 解析场景与环境
4. 根据配置加载 engine adapter
5. 初始化插件和 hooks
6. 启动当前引擎运行时或浏览器实例池
7. 按并发数执行场景
8. 每个场景执行：
   8.1 创建 browser context / engine context
   8.2 注入登录态和 headers
   8.3 打开页面并等待稳定
   8.4 冻结动态内容
   8.5 采集截图、DOM、网络、控制台、性能
   8.6 如果是 write-baseline，则写入 baseline
   8.7 如果是 compare，则读取 baseline 并执行 diff
   8.8 生成场景级结果
9. 聚合所有场景结果为 DiffManifest
10. 输出 HTML / JSON / Console 报告
11. 执行通知、AI、归档等插件
12. 按结果设置 CLI 退出码
```

## 7. 基线设计

### 7.1 本地基线目录

```text
.visual-guard/
  baselines/
    {project}/
      {env}/
        {branch}/
          {sceneId}/
            {viewport}/
              meta.json
              dom.json
              network.json
              performance.json
              accessibility.json
              screenshots/
                full.png
                elements/
                  header.png
                  product-card.png
  reports/
    {runId}/
      manifest.json
      index.html
      assets/
  runs/
    {runId}/
      current/
      diff/
      logs/
```

### 7.2 Baseline Key

基线唯一键建议由以下字段组成：

```text
project + env + branch + sceneId + viewport + deviceScaleFactor + locale
```

### 7.3 基线策略

- 默认读取当前分支基线。
- 如果当前分支不存在，可配置是否 fallback 到 `main` / `master`。
- `write-baseline` 只写当前目标分支。
- 支持 `baseline clean --keep 20` 清理历史版本。
- 远程 baseline 作为 store adapter，不侵入 core。

```ts
export interface BaselineStore {
  read(key: BaselineKey): Promise<BaselineBundle | null>;
  write(key: BaselineKey, bundle: BaselineBundle): Promise<void>;
  list(query: BaselineQuery): Promise<BaselineMeta[]>;
  clean(policy: CleanPolicy): Promise<void>;
}
```

## 8. Diff Manifest 设计

`DiffManifest` 是所有模块之间的核心协议。

```ts
export interface DiffManifest {
  version: '1.0';
  run: {
    id: string;
    project: string;
    env: string;
    branch: string;
    commit?: string;
    startedAt: string;
    endedAt: string;
  };
  summary: {
    total: number;
    passed: number;
    failed: number;
    changed: number;
    errored: number;
    pixelDiffCount: number;
    domDiffCount: number;
    performanceRegressionCount: number;
  };
  scenarios: ScenarioResult[];
}
```

场景结果：

```ts
export interface ScenarioResult {
  id: string;
  name: string;
  url: string;
  status: 'passed' | 'changed' | 'failed' | 'errored';
  artifacts: {
    baselineScreenshot?: string;
    currentScreenshot?: string;
    diffScreenshot?: string;
    domSnapshot?: string;
  };
  diffs: {
    pixel?: PixelDiffResult;
    dom?: DomDiffResult;
    layout?: LayoutDiffResult;
    network?: NetworkDiffResult;
    performance?: PerformanceDiffResult;
  };
  errors: RuntimeError[];
  durationMs: number;
}
```

## 9. 配置设计

示例配置：

```ts
import { defineConfig } from '@visual-guard/config';

export default defineConfig({
  project: 'demo-web',
  env: 'test',
  baseUrl: 'https://example.com',
  outputDir: '.visual-guard/reports',
  baselineDir: '.visual-guard/baselines',
  concurrency: 4,
  timeout: 30000,
  retry: 1,
  browser: {
    engine: 'playwright', // 可选：playwright / puppeteer / cypress
    headless: true,
    launchOptions: {},
    contextOptions: {},
  },
  viewport: [
    { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
    { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
  ],
  diff: {
    pixel: {
      threshold: 0.1,
      maxDiffRatio: 0.01,
      includeAA: false,
    },
    layout: {
      maxDistance: 2,
    },
    ignoreRegions: [
      { selector: '.ad-banner' },
      { x: 0, y: 0, width: 100, height: 40 },
    ],
  },
  performance: {
    enabled: true,
    budget: {
      lcp: 2500,
      fcp: 1800,
      cls: 0.1,
      ttfb: 800,
    },
  },
  scenarios: [
    {
      id: 'home',
      name: '首页',
      path: '/',
      tags: ['smoke'],
      waitForSelector: '#app',
      elements: ['.header', '.main'],
    },
  ],
  reporters: ['html', 'json', 'console'],
  plugins: [],
});
```

## 10. 动态内容稳定策略

视觉回归工具的稳定性优先级高于覆盖面。默认应提供以下稳定策略：

- 固定 `Date.now()` 和 `new Date()`。
- 禁用 CSS animation / transition。
- 禁用或降频 `requestAnimationFrame`。
- 可选禁用 `setInterval`。
- 页面截图前自动等待字体加载完成。
- 页面截图前等待网络空闲。
- 支持用户自定义 `beforeCapture` 脚本。
- 支持遮罩动态区域。
- 支持忽略 DOM 字段或属性。

## 11. 84 项功能落地分层

### P0：MVP 闭环

优先完成能跑通 CI 的最小闭环：

- 1 浏览器实例池管理
- 2 页面生命周期控制器
- 3 场景定义解析
- 4 多环境 URL 构造
- 5 登录态注入器
- 6 动态内容冻结器
- 7 视口/设备模拟
- 8 全页截图采集
- 9 元素区域截图采集
- 10 DOM 结构化快照
- 15 基线写入器
- 16 基线加载器
- 18 DOM JSON 结构化 diff
- 19 文本/属性精确对比
- 20 布局位移检测
- 21 像素级区域 diff
- 22 diff 图像生成
- 23 噪声过滤器
- 24 可忽略区域配置
- 25 对比结果聚合器
- 27 并发执行控制器
- 29 错误恢复机制
- 33 命令行参数解析
- 34 配置文件加载
- 35 场景选择器
- 36 输出格式选择
- 37 退出码设置
- 38 彩色终端输出
- 42 HTML 左右截图对比
- 43 DOM 变化列表
- 44 像素 diff 热力图
- 45 折叠/展开详情
- 47 环境/分支/时间信息
- 53 JSON diff manifest
- 56 控制台摘要输出
- 75 类型定义
- 76 工具函数
- 77 路径工具
- 78 日志工具
- 79 默认配置文件
- 80 配置校验
- 81 环境变量覆盖

### P1：工程可用增强

- 11 网络请求记录器
- 12 控制台错误采集
- 13 性能指标采集
- 17 基线版本管理
- 26 钩子系统
- 28 进度条发射器
- 30 截图差分缓存
- 31 性能基线对比
- 39 交互式初始化
- 40 基线管理子命令
- 41 性能预算文件指定
- 46 截图放大预览
- 48 性能指标仪表盘
- 50 资源瀑布图
- 51 性能退化标记
- 54 JSON 增量输出
- 55 截图 base64 可选输出
- 57 企微机器人推送
- 58 飞书机器人推送
- 59 钉钉机器人推送
- 61 通知内容模板
- 68 性能预算检查
- 69 资源大小统计
- 70 Long Tasks 检测
- 82 CI 集成示例
- 84 截图归档

### P2：高级扩展

- 14 无障碍树快照
- 32 远程基线服务器
- 49 Lighthouse 报告嵌入
- 52 导出 PDF
- 60 邮件通知
- 62 多模态 AI 差异解释
- 63 变化分类
- 64 修复建议生成
- 65 成本控制
- 66 性能退化原因分析
- 67 Lighthouse 集成
- 71 网络节流模拟
- 72 CPU 节流模拟
- 73 性能趋势记录
- 74 性能回归告警
- 83 VSCode 插件

## 12. COI 工具使用方式评估

如果这里的 COI 指当前工程搭建/代码生成/执行编排工具链，那么我会把它用于以下环节，而不是让它承担业务逻辑：

1. **初始化 Monorepo 骨架**：生成 workspace、基础 tsconfig、lint、test、build 配置。
2. **批量创建 package**：按 `core`、`cli`、`reporters`、`plugins`、`shared`、`config`、`engine-playwright`、`engine-puppeteer`、`engine-cypress` 创建包边界。
3. **生成统一模板**：每个包包含 `src/index.ts`、`package.json`、`tsconfig.json`、测试目录。
4. **固化开发命令**：`dev`、`build`、`test`、`lint`、`typecheck`。
5. **后续迭代辅助**：基于本设计文档逐步生成具体模块实现，尤其是先生成 `BrowserEngineAdapter` 协议，再生成各引擎适配包。

COI 不应该替代架构设计，核心还是要保持清晰的包边界、协议边界和插件边界。

## 13. 质量门禁

建议项目从第一天就建立质量门禁：

- TypeScript `strict`。
- 核心类型不允许 `any`。
- `DiffManifest`、`SceneConfig`、`VisualGuardConfig` 必须有单测。
- diff 算法必须有固定输入输出快照测试。
- CLI 退出码必须有集成测试。
- HTML reporter 至少有 manifest fixture 渲染测试。
- baseline 路径生成必须跨平台测试。
- `BrowserEngineAdapter` 必须有契约测试，保证 `playwright`、`puppeteer`、`cypress` 输出同构的采集结果。
- 插件 API 必须通过 mock runner 测试。

## 14. 风险与应对

| 风险 | 表现 | 应对 |
|---|---|---|
| 页面动态内容导致误报 | 时间、广告、轮播、动画引起 diff | 冻结时间、禁用动画、忽略区域、截图前 hook |
| 字体/渲染环境差异 | 本机和 CI 截图不一致 | Docker 镜像、固定浏览器版本、固定字体 |
| baseline 混乱 | 分支和环境互相覆盖 | baseline key 严格包含 env/branch/viewport |
| 报告体积过大 | base64 图片导致 JSON 巨大 | 默认只存路径，base64 作为可选项 |
| AI 成本不可控 | 大图、多场景导致 token 和费用高 | 只分析失败场景、压缩图片、缓存相似 diff |
| 性能指标波动 | 网络和机器环境影响结果 | 支持多次采样、阈值容忍、趋势判断 |
| 多引擎能力不一致 | Cypress、Puppeteer、Playwright 的生命周期和网络能力不同 | 用 `EngineCapabilities` 显式声明能力，缺失能力降级或提示不支持 |
| 插件污染 core | 插件直接依赖内部实现 | 只暴露 PluginAPI，不暴露 core 内部对象 |

## 15. 实施路线图

### 阶段 1：工程骨架

- 创建 pnpm workspace。
- 创建 `shared`、`config`、`core`、`cli`、`reporters`。
- 创建 `engine-playwright`、`engine-puppeteer`、`engine-cypress` 三个引擎适配包。
- 建立统一构建、测试、类型检查。
- 定义核心类型、配置 schema 和 `BrowserEngineAdapter` 协议。

### 阶段 2：核心采集闭环

- 实现默认 `engine-playwright`。
- 实现 `engine-puppeteer` 基础采集能力。
- 实现 `engine-cypress` 与 Cypress 项目的桥接能力。
- 实现场景解析和 URL 构造。
- 实现页面生命周期控制。
- 实现截图、DOM 快照、基础性能采集。
- 实现本地 baseline 读写。

### 阶段 3：对比与报告闭环

- 实现 DOM diff。
- 实现 pixel diff。
- 实现 layout diff。
- 生成统一 `DiffManifest`。
- 实现 console/json/html reporter。
- 实现 CLI 退出码。

### 阶段 4：工程增强

- 实现 hooks。
- 实现并发控制和错误恢复。
- 实现 init、baseline list、baseline clean。
- 实现网络记录、控制台错误、性能基线对比。
- 添加 CI 示例。

### 阶段 5：插件能力

- 通知插件。
- 性能插件。
- AI 分析插件。
- 归档插件。
- 远程 baseline store。

## 16. 首版验收标准

首版可认为完成，当满足：

- 可以通过 CLI 跑一个真实站点的多个场景。
- 可以通过 `browser.engine` 或 `--engine` 在 `playwright`、`puppeteer`、`cypress` 间切换。
- 可以写入 baseline。
- 可以再次运行并与 baseline 对比。
- 可以输出 HTML、JSON、Console 三种报告。
- 有视觉 diff 时退出码为 `1`。
- 无 diff 时退出码为 `0`。
- 单个场景失败不影响其他场景。
- 可以在 CI 中解析 JSON manifest。
- 可以通过配置忽略动态区域。

## 17. 结论

我会按“核心协议先行、Monorepo 分包、多引擎适配、插件按需扩展”的方式实现 Visual Guard。84 项功能中，P0 先保证视觉回归工具的基本价值闭环，同时把 `playwright`、`puppeteer`、`cypress` 的切换能力作为架构级能力预留并逐步实现；P1 增强工程可用性，P2 再做 AI、Lighthouse、远程基线、VSCode 插件等高级能力。

最关键的设计点是：

- `BrowserEngineAdapter` 作为多引擎切换边界。
- `DiffManifest` 作为系统统一产物。
- `BaselineStore` 作为基线存储抽象。
- `PluginAPI` 作为扩展边界。
- `@visual-guard/core` 保持纯核心，不绑定 CLI、报告、通知，也不直接绑定某一个浏览器自动化框架。
- 所有可选能力都以 package/plugin/engine adapter 形式接入。
