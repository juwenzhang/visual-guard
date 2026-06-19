# Visual Guard Plugin 机制设计文档

> 状态：方案探讨 | 日期：2026-06-19 | 作者：AI + luhanxin

## 一、背景与目标

Visual Guard MVP 的采集→基线→diff→报告的闭环已打通。下一步需要让 **AI 分析、性能评测、通知、归档** 等扩展能力通过统一的 Plugin 机制接入 runner，而不是硬编码到核心流程中。

核心目标：

- **AI 自动修复**：读取 diff 结果，通过 LLM 分析像素/DOM/布局差异，生成修复代码并提 Pull Request
- **性能评测**：采集 Core Web Vitals（LCP、FCP、CLS、INP、TTFB），生成性能报告，对比基线检测退化
- **Figma 视觉对比**（远期）：截图 vs Figma 设计稿的像素级对比

## 二、当前架构诊断

### 2.1 已有资产

`shared/src/types/plugin.ts` 已定义了基础框架：

```
VisualGuardPlugin.setup(PluginAPI)  ← 插件入口
PluginAPI.on/off/emit               ← 事件订阅/触发
HookName (10 个)                    ← 生命周期钩子名称
HookContext                         ← 钩子上下文数据
```

`VisualGuardConfig` 中已有 `plugins?: PluginConfig[]` 字段。

### 2.2 关键缺口

| 问题 | 影响 |
|------|------|
| runner 中完全没有 `emit()` 调用 | Plugin 无法感知任何生命周期事件 |
| `HookContext` 不包含 `Snapshot`、`EnginePage`、diff 中间结果 | AI plugin 无法拿到 diff 数据，perf plugin 无法拿到 page 做性能采集 |
| `PluginAPI` 没有 `getPage()` / `getCDPSession()` | Lighthouse 或 CDP 直接采集无法实现 |
| core 包未导入任何 plugin 模块 | Plugin 类型与 runner 完全隔离 |
| plugin-ai/perf/notify/archive 是空壳 | 无实现参考 |
| 缺少 `beforeScreenshot`、`afterScreenshot`、`afterReport` 等细粒度 hook | 部分扩展需求需要更精细的介入点 |

### 2.3 事件管理方案

Plugin 系统需要一个轻量的事件订阅/触发机制。对比三种方案：

| 方案 | 体量 | 边界处理 | 类型安全 | 结论 |
|------|------|---------|---------|------|
| 手写 `on/off/emit` | 0 依赖 | 需自己处理 emit 中途 remove、重复注册、内存泄漏 | 手写泛型 | 可行但易出 bug |
| `mitt` | ~200 字节 | emit 中途 remove、wildcard `*` 均已验证 | 天然类型安全 | ✅ 推荐 |
| Node `EventEmitter` | 内置 | 不自带 error isolation | 无泛型 | CJS 倾向，不契合 ESM |

**决策：选用 `mitt`。**

理由：200 字节可忽略，emit 中途 remove handler 这个经典边界 `mitt` 已正确处理，省下的精力放在 hook 数据注入设计上。

**核心实现：PluginEventBus**

```ts
import mitt, { type Emitter } from 'mitt';

// 事件类型 → HookContext 映射
type HookEvents = {
  beforeRun: HookContext;
  afterRun: HookContext;
  beforeCapture: HookContext;
  afterCapture: HookContext;
  beforeScreenshot: HookContext;
  afterScreenshot: HookContext;
  beforeCompare: HookContext;
  afterCompare: HookContext;
  afterReport: HookContext;
  onError: HookContext;
  onWarning: HookContext;
};

/**
 * Plugin 事件总线
 *
 * 基于 mitt 封装，增加 async handler 支持、超时保护和错误隔离。
 * mitt 原生的 emit 是同步的，这里包一层使 handler 的 Promise 可以被 await。
 */
export class PluginEventBus {
  private emitter: Emitter<HookEvents>;
  private defaultTimeout: number;

  constructor(options?: { defaultTimeout?: number }) {
    this.emitter = mitt<HookEvents>();
    this.defaultTimeout = options?.defaultTimeout ?? 30_000; // 默认 30s
  }

  /** 注册事件处理器 */
  on<K extends keyof HookEvents>(
    name: K,
    handler: (ctx: HookEvents[K]) => void | Promise<void>
  ): void {
    this.emitter.on(name, handler);
  }

  /** 取消注册 */
  off<K extends keyof HookEvents>(
    name: K,
    handler: (ctx: HookEvents[K]) => void | Promise<void>
  ): void {
    this.emitter.off(name, handler);
  }

  /**
   * 触发事件 — 逐个 await handler，隔离异常，超时保护。
   */
  async emit<K extends keyof HookEvents>(
    name: K,
    context: HookEvents[K],
    timeout?: number
  ): Promise<void> {
    const handlers = this.emitter.all.get(name);
    if (!handlers) return;

    const effectiveTimeout = timeout ?? this.defaultTimeout;

    for (const handler of handlers) {
      try {
        const result = handler(context);
        if (result instanceof Promise) {
          await withTimeout(result, effectiveTimeout, {
            label: `Plugin hook "${String(name)}" 超时 (${effectiveTimeout}ms)`,
            logger
          });
        }
      } catch (error) {
        logger.warn(
          `Plugin hook "${String(name)}" 执行失败: ${error instanceof Error ? error.message : String(error)}`
        );
        // 不中断，继续其他 handler
      }
    }
  }

  /** 清空所有事件（用于 teardown） */
  clear(): void {
    this.emitter.all.clear();
  }
}

/**
 * Promise 超时包装器
 *
 * 如果 promise 在 timeout 内未 resolve，则 reject 并抛出超时错误。
 * 注意：不会 abort 原 promise（JS 不支持取消 Promise），
 * 只是不再 await 它，避免阻塞主流程。
 */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  opts: { label: string; logger: { warn: (msg: string) => void } }
): Promise<T> {
  if (ms <= 0) return promise; // timeout=0 表示不限制

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(opts.label)), ms)
  );

  return Promise.race([promise, timeout]);
}
```

**withTimeout 的注意事项：**

- `Promise.race` 不会 cancel 原来的 Promise，超时后原 handler 仍在后台运行，只是 runner 不再等它。这是 JS 的限制，无法完全 abort。
- 如果 handler 内部有副作用（如写文件、发网络请求），超时后这些操作可能仍在执行。实际影响有限，因为 `teardown()` + runner `finally` 会在流程结束后清理。
- 如果需要更严格的超时控制，可以依赖 plugin handler 内部自己实现 `AbortController`。



**关键设计决策：**

1. **handler 顺序执行而非并行** — `beforeCapture` / `afterCapture` 等 hook 的 handler 可能有依赖（如 perf plugin 先采集指标、ai plugin 再读取），顺序执行保证数据一致性。
2. **错误隔离** — 单个 handler 抛异常不中断主流程也不影响其他 handler。
3. **超时保护** — 每个 handler 默认 30s 超时，超时则 warn 并跳过，防止慢请求（如 LLM API 调用）卡住整个 runner。超时时间可通过 plugin 的 `options.timeout` 配置。
4. **通过 `emitter.all` 遍历而非 `emit()`** — `mitt` 原生 `emit()` 是同步的，无法 `await` handler 返回的 Promise。用 `emitter.all.get(name)` 直接拿到 `Set<Handler>` 后手动逐个执行。
5. **`clear()` 方法** — runner 中使用 `finally` 清理，避免多次 `run()` 调用时 handler 堆积。

## 三、Plugin Hook 生命周期设计

### 3.1 Runner 流程 + Hook 插入点

```
                ┌──────────┐
                │ beforeRun │  读取 config、初始化状态
                └────┬─────┘
                     ▼
          ┌──────────────────┐
          │ beforeCapture    │  页面跳转前（可注入 cookies、headers）
          └────┬─────────────┘
               ▼
          ┌──────────┐
          │ capture  │  goto → wait → actions → screenshot → evaluate
          └────┬─────┘
               ▼
          ┌──────────────────┐
          │ afterCapture     │  拿到 Snapshot，可跑性能采集、Lighthouse
          └────┬─────────────┘
               ▼
          ┌──────────────────┐
          │ beforeCompare    │  读取基线，diff 前准备
          └────┬─────────────┘
               ▼
          ┌──────────┐
          │ diff     │  diffPixel / diffDom / diffLayout / diffNetwork / diffPerformance
          └────┬─────┘
               ▼
          ┌──────────────────┐
          │ afterCompare     │  拿到 ScenarioResult（含所有 diff 数据）
          └────┬─────────────┘
               ▼
          ┌──────────────────┐
          │ afterReport      │  拿到 DiffManifest + report 文件路径
          └────┬─────────────┘
               ▼
          ┌──────────┐
          │ afterRun  │  收尾：提 PR、发通知、归档
          └──────────┘
```

### 3.2 Hook 名称（修订版，相比现有增加 4 个）

```ts
type HookName =
  // 运行生命周期
  | 'beforeRun'          // runner 启动前
  | 'afterRun'           // runner 结束后

  // 采集生命周期（细粒化）
  | 'beforeCapture'      // captureScene 开始前
  | 'afterCapture'       // Snapshot 生成后、page.close() 前
  | 'beforeScreenshot'   // 截图前
  | 'afterScreenshot'    // 截图后

  // 对比生命周期
  | 'beforeCompare'      // diff 开始前
  | 'afterCompare'       // ScenarioResult 生成后

  // 报告生命周期（新增）
  | 'afterReport'        // DiffManifest 生成 + reporter 执行后

  // 错误处理
  | 'onError'            // 场景出错时
  | 'onWarning';         // 非致命警告
```

## 四、HookContext 扩展（关键设计）

当前 `HookContext` 缺少 Plugin 真正需要的数据。按 hook 类型分步注入：

```ts
interface HookContext {
  // 基础信息（所有 hook 都有）
  runId: string;
  project: string;
  env: string;
  branch: string;
  config: VisualGuardConfig;

  // 场景上下文（capture/compare hook 时有值）
  scenario?: {
    id: string;
    name: string;
    url: string;
    viewport: { width: number; height: number; deviceScaleFactor: number };
  };

  // 引擎页面引用（capture hook 时有值）
  // ★ 注意：这是 EnginePage 接口，不暴露底层 page/browser 对象，
  // 但可以通过 page.evaluate() 注入采集脚本或访问 CDP
  enginePage?: EnginePage;

  // 采集结果（afterCapture 及之后有值）
  snapshot?: Snapshot;

  // diff 结果（afterCompare 及之后有值）
  scenarioResult?: ScenarioResult;

  // 最终产物（afterReport 时有值）
  manifest?: DiffManifest;
  reportFiles?: string[];

  // 错误/警告
  error?: RuntimeError;
  warning?: string;

  // ★ 自定义数据传递：plugin 之间共享状态
  data?: Record<string, unknown>;
}
```

## 五、Plugin 注册与加载

### 7.1 配置方式

```json
{
  "plugins": [
    { "name": "ai", "options": { "model": "claude-sonnet-4-20250514", "autoFix": true } },
    { "name": "perf", "options": { "budget": { "lcp": 2500, "fcp": 1800, "cls": 0.1 } } },
    { "name": "notify", "options": { "webhook": "https://..." } }
  ]
}
```

### 7.2 Plugin 加载器实现

```ts
// core/src/plugin-loader.ts (新文件)
import type { HookEvents } from './types';
import type { PluginConfig, VisualGuardConfig, VisualGuardPlugin } from '@visual-guard/shared';
import { logger } from '@visual-guard/shared';
import { PluginEventBus } from './plugin-event-bus';

const PLUGIN_PACKAGE_MAP: Record<string, string> = {
  ai: '@visual-guard/plugin-ai',
  perf: '@visual-guard/plugin-perf',
  notify: '@visual-guard/plugin-notify',
  archive: '@visual-guard/plugin-archive'
};

export type PluginContext = {
  bus: PluginEventBus;
  config: VisualGuardConfig;
};

/**
 * 加载并初始化所有配置的 plugin。
 * 
 * @returns { bus, teardown } — bus 供 runner 调用 emit，teardown 在 finally 中清理
 */
export async function loadPlugins(configs: PluginConfig[], ctx: PluginContext): Promise<{
  bus: PluginEventBus;
  teardown: () => void;
}> {
  const bus = new PluginEventBus();

  for (const cfg of configs) {
    const pkgName = PLUGIN_PACKAGE_MAP[cfg.name];
    if (!pkgName) {
      logger.warn(`未知 plugin: ${cfg.name}，已跳过`);
      continue;
    }

    try {
      const mod = await import(pkgName);
      const plugin: VisualGuardPlugin = mod.default ?? mod;

      // 构造 PluginAPI 并调用 setup
      const api: PluginAPI = {
        on: (name, handler) => bus.on(name, handler),
        off: (name, handler) => bus.off(name, handler),
        emit: (name, context) => bus.emit(name, context),
        getConfig: () => cfg.options ?? {},
        getLogger: () => logger
      };

      await plugin.setup(api);
      logger.info(`Plugin "${cfg.name}" 已加载`);
    } catch (error) {
      logger.warn(
        `Plugin "${cfg.name}" 加载失败: ${error instanceof Error ? error.message : String(error)}`
      );
      // 不中断，继续加载其他 plugin
    }
  }

  return {
    bus,
    teardown: () => bus.clear()
  };
}
```

### 7.3 Runner 中埋 hook 调用点

```ts
// core/src/runner.ts 中的关键变更（伪代码）
import { loadPlugins } from './plugin-loader';

export async function run(options: RunnerOptions): Promise<DiffManifest> {
  const { config } = options;
  const runId = `${Date.now()}-${hash(config.project).slice(0, 8)}`;

  // 加载 plugin，获取 bus + teardown
  const { bus, teardown } = await loadPlugins(
    config.plugins ?? [],
    { bus: null!, config }  // 实际实现中先创建 bus 再传
  );

  await bus.emit('beforeRun', { runId, project: config.project, env: config.env, branch: 'main', config });

  try {
    const runtime = await adapter.launch({ /* ... */ });

    const tasks = scenes.map(scene =>
      limit(async () => {
        const ctx = await runtime.createContext({ /* ... */ });

        // ★ beforeCapture
        await bus.emit('beforeCapture', {
          runId, project: config.project, env: config.env, branch: 'main',
          config,
          scenario: { id: scene.id, name: scene.scene.name, url: scene.url, viewport: { /*...*/ } }
        });

        const captureResult = await captureScene(scene, ctx, { timeout: config.timeout ?? 30000 });

        // ★ afterCapture — 传入 enginePage + snapshot
        await bus.emit('afterCapture', {
          runId, project: config.project, env: config.env, branch: 'main',
          config,
          scenario: { /*...*/ },
          enginePage,   // ★ plugin-perf 可在此注入性能采集
          snapshot: captureResult.snapshot
        });

        const baseline = await store.read(key);

        // ★ beforeCompare
        await bus.emit('beforeCompare', {
          runId, project: config.project, env: config.env, branch: 'main',
          config, scenario: { /*...*/ }, snapshot: captureResult.snapshot
        });

        // ... diff 逻辑 ...

        const scenarioResult: ScenarioResult = { /* ... */ };

        // ★ afterCompare — 传入完整 diff 数据
        await bus.emit('afterCompare', {
          runId, project: config.project, env: config.env, branch: 'main',
          config, scenario: { /*...*/ }, snapshot: captureResult.snapshot,
          scenarioResult   // ★ plugin-ai 可在此分析 diff
        });

        return scenarioResult;
      })
    );

    const manifest: DiffManifest = { /* ... */ };

    // ★ afterReport — 传入 manifest + report 文件路径
    await bus.emit('afterReport', {
      runId, project: config.project, env: config.env, branch: 'main',
      config, manifest, reportFiles
    });

    return manifest;
  } finally {
    // ★ afterRun — 无论成功失败都执行
    await bus.emit('afterRun', {
      runId, project: config.project, env: config.env, branch: 'main',
      config
    });
    teardown();  // 清理 event bus
    await runtime.close();
  }
}
```

### 7.4 Plugin 接口（修订版）

```ts
// shared/src/types/plugin.ts 中的核心类型
import type { mitt } from 'mitt';

type HookEvents = {
  beforeRun: HookContext;
  afterRun: HookContext;
  beforeCapture: HookContext;
  afterCapture: HookContext;
  beforeScreenshot: HookContext;
  afterScreenshot: HookContext;
  beforeCompare: HookContext;
  afterCompare: HookContext;
  afterReport: HookContext;
  onError: HookContext;
  onWarning: HookContext;
};

interface PluginAPI {
  /** 注册 hook 事件监听 */
  on<K extends keyof HookEvents>(
    name: K,
    handler: (context: HookEvents[K]) => void | Promise<void>
  ): void;

  /** 取消注册 */
  off<K extends keyof HookEvents>(
    name: K,
    handler: (context: HookEvents[K]) => void | Promise<void>
  ): void;

  /** 触发事件（一般由 runner 调用，plugin 内部也可用于跨 plugin 通信） */
  emit<K extends keyof HookEvents>(name: K, context: HookEvents[K]): Promise<void>;

  /** 获取该 plugin 的自定义配置 */
  getConfig(): Record<string, unknown>;

  /** 获取统一日志器 */
  getLogger(): {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
    debug(message: string): void;
  };
}

interface VisualGuardPlugin {
  /** plugin 唯一名称 */
  name: string;
  /** 初始化 — 在此注册 hook */
  setup(api: PluginAPI): void | Promise<void>;
}
```

### 7.5 Plugin 示例：plugin-perf 的 setup

```ts
// plugin-perf/src/index.ts
import type { VisualGuardPlugin, PluginAPI, HookEvents } from '@visual-guard/shared';

function createPerfPlugin(): VisualGuardPlugin {
  return {
    name: 'perf',
    async setup(api: PluginAPI) {
      const options = api.getConfig();

      // 在 afterCapture 阶段采集性能数据
      api.on('afterCapture', async (ctx) => {
        const page = ctx.enginePage;
        if (!page) return;

        // 1. 收集 Navigation Timing
        const navTiming = await page.evaluate(() => {
          const t = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          return {
            domContentLoaded: t.domContentLoadedEventEnd - t.startTime,
            load: t.loadEventEnd - t.startTime,
            firstPaint: performance.getEntriesByName('first-paint', 'paint')[0]?.startTime,
            firstContentfulPaint: performance.getEntriesByName('first-contentful-paint', 'paint')[0]?.startTime
          };
        });

        // 2. 注入 PerformanceObserver 收集 LCP/CLS
        const webVitals = await page.evaluate(() => {
          return new Promise<{ lcp?: number; cls?: number }>((resolve) => {
            const result: { lcp?: number; cls?: number } = {};
            let resolved = false;

            const observer = new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                if (entry.entryType === 'largest-contentful-paint') {
                  result.lcp = entry.startTime;
                }
                if (entry.entryType === 'layout-shift' && !(entry as any).hadRecentInput) {
                  result.cls = (result.cls ?? 0) + (entry as any).value;
                }
              }
            });

            observer.observe({ type: 'largest-contentful-paint', buffered: true });
            observer.observe({ type: 'layout-shift', buffered: true });

            // 等待 LCP 稳定（最多 5s）
            setTimeout(() => {
              observer.disconnect();
              resolve(result);
            }, 5000);
          });
        });

        // 3. 填充 snapshot.performance（用于后续 diff 和报告）
        if (ctx.snapshot) {
          ctx.snapshot.performance = {
            navigation: {
              domContentLoaded: Math.round(navTiming.domContentLoaded),
              load: Math.round(navTiming.load),
              firstPaint: navTiming.firstPaint ? Math.round(navTiming.firstPaint) : undefined,
              firstContentfulPaint: navTiming.firstContentfulPaint
                ? Math.round(navTiming.firstContentfulPaint)
                : undefined,
              largestContentfulPaint: webVitals.lcp ? Math.round(webVitals.lcp) : undefined,
              cumulativeLayoutShift: webVitals.cls
            },
            resources: []
          };
        }

        api.getLogger().info(`[perf] ${ctx.scenario?.name}: LCP=${webVitals.lcp?.toFixed(0)}ms, CLS=${webVitals.cls?.toFixed(3)}`);
      });
    }
  };
}

export default createPerfPlugin();
```

### 7.6 Plugin 示例：plugin-ai 的 setup

```ts
// plugin-ai/src/index.ts
import type { VisualGuardPlugin, PluginAPI } from '@visual-guard/shared';

function createAiPlugin(): VisualGuardPlugin {
  const fixSuggestions: FixSuggestion[] = [];

  return {
    name: 'ai',
    async setup(api: PluginAPI) {
      const options = api.getConfig();
      const model = (options.model as string) ?? 'claude-sonnet-4-20250514';
      const autoFix = (options.autoFix as boolean) ?? false;

      // 在 afterCompare 阶段分析 diff 数据
      api.on('afterCompare', async (ctx) => {
        const result = ctx.scenarioResult;
        if (!result || result.status === 'passed' || result.status === 'baseline') return;

        const prompt = buildFixPrompt(result);
        const suggestion = await callLLM(prompt, model);
        if (suggestion) {
          fixSuggestions.push(suggestion);
        }
      });

      // 在 afterReport 阶段汇总并提 PR
      api.on('afterReport', async (ctx) => {
        if (fixSuggestions.length === 0) return;

        const manifest = ctx.manifest;
        if (!manifest) return;

        // 生成修复补丁文件
        const patchContent = generatePatch(fixSuggestions, manifest);
        const patchPath = `.visual-guard/ai-fixes/${manifest.run.id}.patch`;
        await writeFile(patchPath, patchContent);

        api.getLogger().info(`[ai] 生成 ${fixSuggestions.length} 条修复建议 → ${patchPath}`);

        if (autoFix) {
          // TODO: 自动提交 PR
        }
      });
    }
  };
}
```

### 7.7 错误隔离

每个 hook 的异常不应中断主流程。`PluginEventBus.emit()` 已通过 try/catch 确保单个 handler 失败：

```ts
for (const handler of handlers) {
  try {
    const result = handler(context);
    if (result instanceof Promise) await result;
  } catch (error) {
    logger.warn(`Plugin hook "${String(name)}" 执行失败: ${String(error)}`);
    // 不中断，继续其他 handler
  }
}
```

同时，plugin 加载失败（如 package 未安装）也不会中断主流程：

```ts
try {
  const mod = await import(pkgName);
  // ...
} catch {
  logger.warn(`Plugin "${cfg.name}" 加载失败，已跳过`);
}
```

## 六、EnginePage 接口改造

Plugin 要访问底层能力，需要 `EnginePage` 增加两个可选方法：

```ts
interface EnginePage {
  // ... 现有方法 ...

  /** 获取 Chrome DevTools Protocol session（用于性能采集、网络拦截增强等） */
  getCDPSession?(): Promise<CDPSession>;

  /** 获取视图原始尺寸信息 */
  getViewport?(): { width: number; height: number; deviceScaleFactor: number };
}
```

`CDPSession` 是一个最小抽象：

```ts
interface CDPSession {
  send<T>(method: string, params?: Record<string, unknown>): Promise<T>;
  on(event: string, handler: (params: unknown) => void): void;
  detach(): Promise<void>;
}
```

两个引擎适配器都需要实现：

- **Playwright**：`page.context().newCDPSession(page)` 即可获取 ✅
- **Puppeteer**：`page.createCDPSession()` 即可获取 ✅
- **Cypress**：走桥接模式，不可用 ❌（标记为暂不支持）

## 七、实施路线

| 阶段 | 内容 | 涉及文件 |
|------|------|---------|
| Step 1 | 实现 `PluginEventBus`（基于 mitt）+ 更新 `PluginAPI` 类型 | `core/src/plugin-event-bus.ts`（新文件）、`shared/src/types/plugin.ts` |
| Step 2 | 扩展 `HookContext`，在 `runner.ts` 中埋 hook 调用点 | `core/src/runner.ts` |
| Step 3 | `EnginePage` 增加 `getCDPSession()`，两个引擎适配器实现 | `shared/src/types/engine.ts`、`engine-playwright/src/index.ts`、`engine-puppeteer/src/index.ts` |
| Step 4 | 实现 `plugin-loader.ts`（动态 import + 错误隔离） | `core/src/plugin-loader.ts`（新文件） |
| Step 5 | 实现 `plugin-perf` MVP（web-vitals 采集 + performance 填充） | `plugin-perf/src/index.ts` |
| Step 6 | 实现 `plugin-ai` MVP（diff 数据 → LLM prompt → FixSuggestion） | `plugin-ai/src/index.ts` |
| Step 7 | 实现 `plugin-notify`（afterReport 发 webhook） | `plugin-notify/src/index.ts` |
| Step 8 | `afterReport` hook + reporter 路径注入 | `core/src/runner.ts`、`cli/src/commands/run.ts` |

## 八、决策记录

1. **事件管理**：选用 `mitt`（~200 字节）而非手写或 Node EventEmitter。利用 `emitter.all` 手动遍历 handler 以支持 async handler 和错误隔离。
2. **超时保护**：每个 handler 默认 30s 超时（`Promise.race`），超时后 warn 并继续下一个 handler。超时可通过 `PluginEventBus` 构造参数或 `emit(timeout)` 覆盖。`Promise.race` 不会 cancel 原 Promise，这是 JS 限制，影响可控。
3. **Lighthouse**：MVP 阶段不引入，用 `page.evaluate()` + PerformanceObserver 组合替代。Lighthouse 留作远期可选增强。
4. **Windows 适配**：不做，当前仅 macOS/Linux。
5. **Plugin 引擎访问**：通过 `EnginePage` 接口扩展（`getCDPSession()`），不直接暴露底层 `Page`/`Browser` 对象，保持适配器抽象的封闭性。
6. **Plugin 间通信**：通过 `HookContext.data` 字段共享状态，不引入事件总线。
7. **错误隔离**：单个 plugin hook 失败不中断 runner 主流程；单个 plugin 加载失败不中断其他 plugin。
8. **Handler 顺序**：同一 hook 的多个 handler 按注册顺序同步触发（顺序执行，非并行），before/after 类 hook 中数据填充优先于消费者执行。
9. **并发控制**：不做 handler 并行执行、不做 async 资源泄漏监控、不做重试机制。MVP 阶段只靠超时保护防止慢 handler 阻塞流程。
